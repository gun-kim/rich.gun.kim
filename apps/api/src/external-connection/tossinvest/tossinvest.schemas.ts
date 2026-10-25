import { z } from 'zod';

/*
 * 토스증권 응답 스키마.
 * 주식 보유 현황과 평가금액·예수금·환율에 필요한 필드만 정의한다.
 * z.object 는 정의하지 않은 키를 버린다. 필드 설명은 docs/tossinvest 문서를 참고한다.
 */

/** 토스증권은 수량·금액·비율을 "72000" 같은 decimal 문자열로 준다. 숫자가 아니면 파싱에 실패한다. */
const decimal = z
  .string()
  .transform((value) => Number(value))
  .pipe(z.number().finite());

/** 통화 코드. 토스증권이 값을 늘릴 수 있으므로 KRW·USD 외의 값도 받는다. */
const currency = z.string();

export const tokenSchema = z.object({
  access_token: z.string().min(1),
  /** 만료까지 남은 초 (보통 86400) */
  expires_in: z.number(),
});

export const accountsSchema = z.array(
  z.object({
    /** 계좌번호 */
    accountNo: z.string(),
    /** 계좌 식별 키. 계좌·자산·주문 API 의 X-Tossinvest-Account 헤더에 쓴다. */
    accountSeq: z.number().int(),
    /** 현재는 BROKERAGE(종합매매)만 온다. 모르는 값도 받는다. */
    accountType: z.string(),
  }),
);

/** 통화별 합산 금액. 환율 환산 없이 각 통화로 거래된 종목의 합이고, 해외 종목이 없으면 usd 는 null 이다. */
const amountByCurrency = z.object({
  krw: decimal,
  usd: decimal.nullish().transform((value) => value ?? null),
});

export const holdingsSchema = z.object({
  /** 투자원금 */
  totalPurchaseAmount: amountByCurrency,
  marketValue: z.object({
    /** 평가금액 */
    amount: amountByCurrency,
    /** 세금·수수료 공제 후 평가금액 */
    amountAfterCost: amountByCurrency,
  }),
  profitLoss: z.object({
    amount: amountByCurrency,
    /** 손익률 (소수비율, 0.1516 = 15.16%). 전체 자산을 현재 환율로 원화 환산한 기준 */
    rate: decimal,
  }),
  items: z.array(
    z.object({
      /** KR: 6자리 종목코드 (예: 005930), US: 티커 (예: AAPL) */
      symbol: z.string(),
      name: z.string(),
      /** KR, US */
      marketCountry: z.string(),
      /** 거래 통화. 아래 가격·금액은 모두 이 통화 기준이다. */
      currency,
      /** 보유 수량. 미국 주식은 소수점 수량일 수 있다. */
      quantity: decimal,
      /** 현재가 */
      lastPrice: decimal,
      /** 매수 평균가 */
      averagePurchasePrice: decimal,
      marketValue: z.object({
        /** 매입금액 */
        purchaseAmount: decimal,
        /** 평가금액 */
        amount: decimal,
      }),
      profitLoss: z.object({
        amount: decimal,
        /** 손익률 (소수비율) */
        rate: decimal,
      }),
    }),
  ),
});

export const buyingPowerSchema = z.object({
  currency,
  /** 현금 기반 매수 가능 금액 (미수 미발생 기준) */
  cashBuyingPower: decimal,
});

export const exchangeRateSchema = z.object({
  baseCurrency: currency,
  quoteCurrency: currency,
  /** 환율 (1 baseCurrency 당 quoteCurrency). 1분마다 갱신되는 참고용 표시 환율 */
  rate: decimal,
  /** 이 환율의 유효 시작 시각 (ISO 8601, KST) */
  validFrom: z.string(),
});

export type TossInvestAccount = z.output<typeof accountsSchema>[number];
export type TossInvestHoldings = z.output<typeof holdingsSchema>;
export type TossInvestHolding = TossInvestHoldings['items'][number];
export type TossInvestExchangeRate = z.output<typeof exchangeRateSchema>;
