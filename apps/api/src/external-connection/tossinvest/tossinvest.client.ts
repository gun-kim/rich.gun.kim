import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { tokenSchema } from './tossinvest.schemas';

const API_HOST = 'https://openapi.tossinvest.com';

/** 토큰 만료 직전에 쓰다 실패하지 않도록 이만큼 일찍 재발급한다. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/** 토큰이 무효가 되었을 때의 오류 코드. 한 번 재발급하고 다시 시도한다. */
const RETRYABLE_TOKEN_ERRORS = new Set(['invalid-token', 'expired-token', 'token-revoked']);

/** 사용자가 토스증권 WTS 에서 발급받은 Open API 키. 사용자마다 다르므로 호출할 때마다 넘긴다. */
export interface TossInvestCredentials {
  clientId: string;
  clientSecret: string;
}

/** 토큰 발급(/oauth2/token)은 OAuth2 표준 형식으로 오류를 준다. */
const oauthErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

/** 그 밖의 API 오류 envelope */
const errorResponseSchema = z.object({
  error: z.object({
    requestId: z.string().optional(),
    code: z.string(),
    // 내부 정책상 빈 문자열로 오기도 한다.
    message: z.string(),
  }),
});

/** 토스증권이 2xx 가 아닌 응답을 돌려줬을 때 던지는 오류 */
export class TossInvestError extends Error {
  constructor(
    readonly status: number,
    /** 토스증권 오류 코드 (예: ip-not-allowed, account-not-found, invalid_client) */
    readonly code: string,
    message: string,
    /** CS 문의 때 첨부하는 요청 ID */
    readonly requestId?: string,
  ) {
    super(`[${status} ${code}] ${message}`);
    this.name = 'TossInvestError';
  }
}

interface CachedToken {
  clientSecret: string;
  accessToken: Promise<string>;
  expiresAt: number;
}

/** 요청/응답 처리와 액세스 토큰 발급·재사용 등 토스증권 호출의 공통 부분 */
@Injectable()
export class TossInvestClient {
  /**
   * client_id 별 액세스 토큰. 클라이언트당 유효한 토큰은 1개라 새로 발급하면 이전 토큰이 무효가 되므로,
   * 만료될 때까지 재사용하고 동시에 들어온 요청도 같은 발급 결과를 기다리게 한다.
   */
  private readonly tokens = new Map<string, CachedToken>();

  /**
   * GET 요청을 보내고 응답의 result 를 돌려준다.
   * accountSeq 가 있으면 X-Tossinvest-Account 헤더를 붙인다 (계좌·자산·주문 API).
   */
  async get(
    path: string,
    credentials: TossInvestCredentials,
    { query = {}, accountSeq }: { query?: Record<string, string>; accountSeq?: number } = {},
  ): Promise<unknown> {
    const queryString = new URLSearchParams(query).toString();
    const url = `${API_HOST}${path}${queryString ? `?${queryString}` : ''}`;

    const send = async () => {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${await this.getAccessToken(credentials)}`,
      };
      if (accountSeq !== undefined) headers['X-Tossinvest-Account'] = String(accountSeq);
      return fetch(url, { headers });
    };

    let response = await send();
    let body: unknown = await response.json().catch(() => undefined);
    if (response.status === 401 && RETRYABLE_TOKEN_ERRORS.has(this.toError(response, body, path).code)) {
      // 다른 곳에서 토큰을 새로 발급해 이 토큰이 무효가 된 경우 등. 한 번만 재발급한다.
      this.tokens.delete(credentials.clientId);
      response = await send();
      body = await response.json().catch(() => undefined);
    }
    if (!response.ok) throw this.toError(response, body, path);
    return z.object({ result: z.unknown() }).parse(body).result;
  }

  private getAccessToken(credentials: TossInvestCredentials): Promise<string> {
    const cached = this.tokens.get(credentials.clientId);
    if (cached && cached.clientSecret === credentials.clientSecret && cached.expiresAt > Date.now()) {
      return cached.accessToken;
    }

    const accessToken = this.issueToken(credentials);
    const entry: CachedToken = {
      clientSecret: credentials.clientSecret,
      accessToken: accessToken.then(({ access_token }) => access_token),
      // 발급이 끝나면 실제 만료 시각으로 바꾼다. 그 전까지는 같은 발급을 기다리게 한다.
      expiresAt: Number.POSITIVE_INFINITY,
    };
    this.tokens.set(credentials.clientId, entry);
    accessToken.then(
      ({ expires_in }) => {
        entry.expiresAt = Date.now() + expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS;
      },
      () => {
        if (this.tokens.get(credentials.clientId) === entry) this.tokens.delete(credentials.clientId);
      },
    );
    return entry.accessToken;
  }

  /** Client Credentials Grant 로 액세스 토큰을 발급한다. refresh token 은 없다. */
  private async issueToken({ clientId, clientSecret }: TossInvestCredentials) {
    const response = await fetch(`${API_HOST}/oauth2/token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = oauthErrorSchema.safeParse(body);
      throw new TossInvestError(
        response.status,
        error.success ? error.data.error : 'unknown',
        (error.success && error.data.error_description) || '토스증권 토큰 발급 실패',
      );
    }
    return tokenSchema.parse(body);
  }

  private toError(response: Response, body: unknown, path: string): TossInvestError {
    const error = errorResponseSchema.safeParse(body);
    if (!error.success) {
      return new TossInvestError(response.status, 'unknown', `토스증권 요청 실패: ${path}`);
    }
    const { code, message, requestId } = error.data.error;
    return new TossInvestError(
      response.status,
      code,
      message || `토스증권 요청 실패: ${path}`,
      requestId ?? response.headers.get('X-Request-Id') ?? undefined,
    );
  }
}
