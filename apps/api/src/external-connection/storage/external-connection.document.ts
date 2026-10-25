import { ObjectId } from 'mongodb';
import { z } from 'zod';

/*
 * external_connections 컬렉션의 문서 스키마.
 * 문서 하나는 사용자 한 명의 외부 서비스 연결 하나이고, 사용자당 서비스별로 하나만 둔다.
 * 은행 비밀번호·인증서는 CODEF 가 보관하므로 저장하지 않고, 커넥티드 아이디와 API Key(업비트, 토스증권)만 저장한다.
 */

/** 마지막으로 실패한 호출의 오류 (예: CODEF CF-12100, 업비트 no_authorization_ip, 토스증권 ip-not-allowed) */
export const connectionErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  occurredAt: z.date(),
});

export type ConnectionError = z.infer<typeof connectionErrorSchema>;

const baseConnection = {
  _id: z.instanceof(ObjectId),
  /** 리버스 프록시(Authelia)가 Remote-User 헤더로 넘겨주는 사용자 이름 */
  userId: z.string().min(1),
  /** error: 사용자가 재연결해야 하는 상태, disconnected: 연결 해제됨 */
  status: z.enum(['active', 'error', 'disconnected']),
  lastSyncedAt: z.date().nullable(),
  lastError: connectionErrorSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  /** 연결 해제 시각. CODEF 계정 삭제는 되돌릴 수 없으므로 문서는 지우지 않고 남긴다. */
  deletedAt: z.date().nullable(),
};

/** 커넥티드 아이디에 등록된 기관 계정 */
export const codefInstitutionSchema = z.object({
  /** BK: 은행·저축은행, CD: 카드, ST: 증권 */
  businessType: z.enum(['BK', 'CD', 'ST']),
  /** 기관코드 (예: 국민은행 0004) */
  organization: z.string(),
  loginType: z.enum(['certificate', 'id']),
  status: z.enum(['active', 'error']),
  lastError: connectionErrorSchema.nullable(),
  registeredAt: z.date(),
});

export type CodefInstitution = z.infer<typeof codefInstitutionSchema>;

export const codefConnectionSchema = z.object({
  ...baseConnection,
  provider: z.literal('codef'),
  /** 커넥티드 아이디를 발급받은 CODEF 환경. 다른 환경에서는 쓸 수 없다. */
  environment: z.enum(['sandbox', 'development', 'production']),
  connectedId: z.string().min(1),
  institutions: z.array(codefInstitutionSchema),
});

export const upbitConnectionSchema = z.object({
  ...baseConnection,
  provider: z.literal('upbit'),
  credentials: z.object({
    accessKey: z.string().min(1),
    secretKey: z.string().min(1),
  }),
  /** API Key 만료일. 업비트가 알려주지 않으므로 사용자가 입력한다. */
  expiresAt: z.date().nullable(),
});

export const tossinvestConnectionSchema = z.object({
  ...baseConnection,
  provider: z.literal('tossinvest'),
  credentials: z.object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
  }),
  /** 조회할 계좌의 accountSeq. 계좌 목록 조회로 받아 X-Tossinvest-Account 헤더에 쓴다. */
  accountSeq: z.number().int(),
});

export const externalConnectionSchema = z.discriminatedUnion('provider', [
  codefConnectionSchema,
  upbitConnectionSchema,
  tossinvestConnectionSchema,
]);

export type ExternalConnection = z.infer<typeof externalConnectionSchema>;
export type ExternalProvider = ExternalConnection['provider'];
export type ConnectionOf<P extends ExternalProvider> = Extract<ExternalConnection, { provider: P }>;
