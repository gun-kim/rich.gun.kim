import { ObjectId } from 'mongodb';
import { z } from 'zod';

/*
 * external_connections 컬렉션의 문서 스키마.
 * 문서 하나는 사용자 한 명의 외부 서비스 연결 하나이고, 사용자당 서비스별로 하나만 둔다.
 * 외부 서비스 호출에 필요한 API Key(업비트, 토스증권)를 저장한다.
 */

/** 마지막으로 실패한 호출의 오류 (예: 업비트 no_authorization_ip, 토스증권 ip-not-allowed) */
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
  /** 연결 해제 시각. 연결 이력을 남기기 위해 문서는 지우지 않는다. */
  deletedAt: z.date().nullable(),
};

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
  upbitConnectionSchema,
  tossinvestConnectionSchema,
]);

export type ExternalConnection = z.infer<typeof externalConnectionSchema>;
export type ExternalProvider = ExternalConnection['provider'];
export type ConnectionOf<P extends ExternalProvider> = Extract<ExternalConnection, { provider: P }>;
