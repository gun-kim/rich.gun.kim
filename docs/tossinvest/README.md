# 토스증권 연동 자료

`apps/api` 의 `TossInvestConnectionService` 가 쓰는 토스증권 Open API 자료를 모아 둔 곳이다.
명세는 [토스증권 개발자 센터](https://developers.tossinvest.com)에서 2026-10-25 에 옮겨 왔다 (OpenAPI `1.2.24`).

## 원문

토스증권이 LLM·코딩 에이전트용으로 공개한 Markdown 원문을 그대로 저장해 두었다. 이 README 는 원문과 OpenAPI 명세에서 이 프로젝트에 필요한 내용만 추린 것이다.
엔드포인트·스키마의 기준은 [OpenAPI JSON](https://openapi.tossinvest.com/openapi-docs/latest/openapi.json) 이다 (용량이 커서 저장하지 않았다).

| 파일 | 원문 |
|---|---|
| [overview.md](./overview.md) | [개요 (기능 목록, 시작하기, Rate Limits, 에러, 웹소켓)](https://openapi.tossinvest.com/openapi-docs/overview.md) |
| [faq.md](./faq.md) | [FAQ](https://openapi.tossinvest.com/openapi-docs/faq.md) |

## 이 프로젝트에서 토스증권이 맡는 데이터

토스증권 계좌의 국내·미국 주식 보유 현황과 평가금액, 현금, 종목 정보(시장·종목 유형)다. 업비트와 달리 보유 주식 조회가 현재가·평가금액·손익을 함께 준다.

- 금액은 **거래 통화별로 따로** 합산된다 (`krw` 는 국내 종목, `usd` 는 미국 종목). 원화 합계는 `usd × 환율` 로 직접 계산한다.
- 예수금 조회 API 가 없어 **현금 기반 매수 가능 금액**(`cashBuyingPower`)을 현금 잔고로 쓴다.

주문·조건주문, 시세, 웹소켓은 쓰지 않는다.

## 메소드와 토스증권 API

| 메소드 | 토스증권 API | 엔드포인트 | 계좌 헤더 | Rate Limits Group |
|---|---|---|---|---|
| (모든 메소드, 내부) | 액세스 토큰 발급 | `POST /oauth2/token` | | `AUTH` 초당 5회 |
| `getAccounts(credentials)` | 계좌 목록 조회 | `GET /api/v1/accounts` | | `ACCOUNT` 초당 1회 |
| `getHoldings(credentials, accountSeq)` | 보유 주식 조회 | `GET /api/v1/holdings` | 필요 | `ASSET` 초당 5회 |
| `getCashBuyingPower(credentials, accountSeq, currency)` | 매수 가능 금액 조회 | `GET /api/v1/buying-power?currency=KRW` | 필요 | `ORDER_INFO` 초당 6회 |
| `getStocks(credentials, symbols)` | 종목 기본 정보 조회 | `GET /api/v1/stocks?symbols=005930,AAPL` | | `STOCK` 초당 5회 |
| `getUsdKrwRate(credentials)` | 환율 조회 | `GET /api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW` | | `MARKET_INFO` 초당 3회 |

호스트는 `https://openapi.tossinvest.com` 이다. 한도는 클라이언트 × 그룹 단위이고 사전 공지 없이 바뀔 수 있다.

```ts
const [account] = await tossinvest.getAccounts({ clientId, clientSecret });
const holdings = await tossinvest.getHoldings(credentials, account.accountSeq);
const { rate } = await tossinvest.getUsdKrwRate(credentials);
const stockKrw = holdings.marketValue.amount.krw + (holdings.marketValue.amount.usd ?? 0) * rate;
```

## API Key

- API Key 는 **사용자마다 다르다.** 각 사용자가 토스증권 WTS 의 설정 > Open API 에서 발급받는 `client_id`·`client_secret` 이라 환경 변수로 두지 않고, 메소드 인자(`TossInvestCredentials`)로 받는다.
- `client_secret` 은 계좌 조회·주문이 가능한 비밀값이다. 저장할 때 암호화해야 한다.
- **허용 IP:** WTS 설정 > Open API > 허용 IP 관리에 등록한 IP 에서만 동작한다. 사용자가 **우리 api 서버의 공인 IP** 를 등록해야 한다. 아니면 토큰 발급은 `403 access_denied`, 그 밖의 API 는 `403 ip-not-allowed` 다.
- 문서(OpenAPI 의 OAuth scope 목록이 비어 있음)상 키에 조회 전용 권한을 따로 주는 방법은 보이지 않는다. 우리는 주문 API 를 호출하지 않는다.

## 인증 (OAuth 2.0 Client Credentials)

구현은 `apps/api/src/external-connection/tossinvest/tossinvest.client.ts` 에 있다.

1. `POST /oauth2/token` 에 `application/x-www-form-urlencoded` 로 `grant_type=client_credentials`, `client_id`, `client_secret` 을 보낸다.
2. 응답은 공통 envelope 이 아닌 OAuth2 표준 형식이다: `{ "access_token": "eyJ...", "token_type": "Bearer", "expires_in": 86400 }`. refresh token 은 없다.
3. 모든 API 에 `Authorization: Bearer {access_token}` 을 붙인다. 계좌·자산·주문 API 는 `X-Tossinvest-Account: {accountSeq}` 도 붙인다.

**클라이언트당 유효한 토큰은 1개다.** 새로 발급하면 직전 토큰은 바로 무효가 되어 `401 token-revoked` 가 난다.
그래서 `TossInvestClient` 는

- `client_id` 별로 토큰을 메모리에 두고 만료 1분 전까지 재사용한다. 동시에 들어온 요청은 같은 발급을 기다린다.
- `401` 이 `invalid-token`·`expired-token`·`token-revoked` 이면 토큰을 한 번 재발급하고 다시 시도한다.
- 같은 키를 여러 프로세스(예: 로컬과 서버, 테스트)에서 쓰면 서로의 토큰을 무효화한다. 테스트용 키는 따로 발급한다.

## 계좌 목록 조회 — `GET /api/v1/accounts`

현재는 종합매매(`BROKERAGE`) 계좌만 오고, 없으면 빈 배열이다. 자녀계좌는 쓸 수 없다.

| 필드 | 타입 | 설명 | 수집 |
|---|---|---|---|
| `accountNo` | string | 계좌번호 | ✅ |
| `accountSeq` | integer | 계좌 식별 키. `X-Tossinvest-Account` 헤더 값 | ✅ |
| `accountType` | string | `BROKERAGE` · `OVERSEAS_DERIVATIVES` · `PENSION_SAVINGS` · `RESHORING_INVESTMENT`. 모르는 값도 받아야 한다 | ✅ |

## 보유 주식 조회 — `GET /api/v1/holdings`

국내(KR)·미국(US) 주식만 포함하고 해외 옵션·채권은 빠진다. 보유 종목이 없으면 합계는 0, `items` 는 빈 배열이다.
`symbol` 쿼리로 한 종목만 거를 수 있지만 쓰지 않는다. 수량·금액·비율은 모두 decimal 문자열이고 숫자로 바꿔 쓴다.

합계 필드(통화별 `{ krw, usd }` — `usd` 는 미국 종목이 없으면 `null`):

| 필드 | 설명 | 수집 |
|---|---|---|
| `totalPurchaseAmount` | 투자원금 | ✅ |
| `marketValue.amount` · `marketValue.amountAfterCost` | 평가금액 · 세금·수수료 공제 후 평가금액 | ✅ |
| `profitLoss.amount` | 손익금액 | ✅ |
| `profitLoss.rate` | 손익률 (소수비율, 원화 환산 기준). 0.1516 = 15.16% | ✅ |
| `profitLoss.amountAfterCost` · `profitLoss.rateAfterCost` | 세금·수수료 공제 후 손익 | |
| `dailyProfitLoss.amount` · `dailyProfitLoss.rate` | 일간 손익 | |

종목(`items[]`, 금액은 모두 그 종목의 `currency` 기준):

| 필드 | 설명 | 수집 |
|---|---|---|
| `symbol` | KR: 6자리 종목코드 (예: `005930`, `0101N0`), US: 티커 (예: `AAPL`) | ✅ |
| `name` | 종목명 | ✅ |
| `marketCountry` | `KR` · `US` | ✅ |
| `currency` | `KRW` · `USD` | ✅ |
| `quantity` | 보유 수량 | ✅ |
| `lastPrice` | 현재가 | ✅ |
| `averagePurchasePrice` | 매수 평균가 | ✅ |
| `marketValue.purchaseAmount` · `marketValue.amount` | 매입금액 · 평가금액 | ✅ |
| `marketValue.amountAfterCost` | 세금·수수료 공제 후 평가금액 | |
| `profitLoss.amount` · `profitLoss.rate` | 손익금액 · 손익률 | ✅ |
| `dailyProfitLoss`, `cost.commission`, `cost.tax` | 일간 손익, 예상 수수료·세금 | |

```json
{
  "result": {
    "totalPurchaseAmount": { "krw": "6500000", "usd": "1553" },
    "marketValue": { "amount": { "krw": "7200000", "usd": "1785" }, "amountAfterCost": { "krw": "7050000", "usd": "1771.43" } },
    "profitLoss": { "amount": { "krw": "700000", "usd": "232" }, "rate": "0.1179", "...": "..." },
    "items": [
      { "symbol": "005930", "name": "삼성전자", "marketCountry": "KR", "currency": "KRW", "quantity": "100", "lastPrice": "72000", "averagePurchasePrice": "65000", "...": "..." }
    ]
  }
}
```

## 종목 기본 정보 조회 — `GET /api/v1/stocks`

- 입력: `symbols` (필수) — 쉼표로 구분한 종목 심볼, 한 번에 최대 200건. 넘으면 `400 invalid-request` 라 `getStocks` 는 중복을 없애고 200건씩 나눠 조회한다.
- 없는 종목을 넣었을 때의 동작은 명세에 없다. 호출하는 쪽은 결과에 없는 종목을 "정보 없음"으로 다룬다.

| 필드 | 설명 | 수집 |
|---|---|---|
| `symbol` · `name` · `englishName` | 심볼, 한글·영문 종목명 | `englishName` 제외 ✅ |
| `isinCode` | 국제증권식별번호 (예: `KR7005930003`) | ✅ |
| `market` | `KOSPI` · `KOSDAQ` · `NYSE` · `NASDAQ` · `AMEX` · `KR_ETC` · `US_ETC` | ✅ |
| `securityType` | `STOCK` · `ETF` · `ETN` · `REIT` · `FOREIGN_STOCK` 등 | ✅ |
| `status` | `SCHEDULED` · `ACTIVE` · `DELISTED` | ✅ |
| `currency` | `KRW` · `USD` | ✅ |
| `isCommonShare`, `listDate`, `delistDate`, `sharesOutstanding`, `leverageFactor`, `koreanMarketDetail` | 보통주 여부, 상장·상폐일, 발행주식수, 레버리지 배수, 국내 거래정지 등 | |

## 매수 가능 금액 조회 — `GET /api/v1/buying-power`

- 입력: `currency` (필수) — `KRW` 또는 `USD`
- 응답: `{ "currency": "KRW", "cashBuyingPower": "5000000" }`. 미수를 쓰지 않는 현금 기반 매수 가능 금액이다. KRW 는 정수, USD 는 소수점이 있다.
- 예수금 자체가 아니라 "지금 살 수 있는 현금"이므로 실제 예수금과 다를 수 있다.

## 환율 조회 — `GET /api/v1/exchange-rate`

- 입력: `baseCurrency=USD`, `quoteCurrency=KRW` (필수), `dateTime` (선택, 생략하면 현재)
- 1분마다 갱신되는 참고용 표시 환율이다. 실제 거래 환율과 다를 수 있다.

| 필드 | 설명 | 수집 |
|---|---|---|
| `baseCurrency` · `quoteCurrency` | 기준 · 표시 통화 | ✅ |
| `rate` | 환율 (1 USD 당 KRW) | ✅ |
| `midRate` · `basisPoint` · `rateChangeType` | 매매기준율, 변동, `UP`·`DOWN` 등 | |
| `validFrom` · `validUntil` | 이 환율의 유효 구간 (보통 1분) | `validFrom` ✅ |

## 오류

2xx 가 아니면 `TossInvestError` 를 던진다. `status` 는 HTTP 상태 코드, `code` 는 토스증권 오류 코드, `requestId` 는 CS 문의용 ID 다.

```json
{ "error": { "requestId": "01HXYZABCDEFG123456789", "code": "ip-not-allowed", "message": "허용되지 않은 IP 주소입니다." } }
```

- 토큰 발급은 OAuth2 형식(`{ "error": "invalid_client", "error_description": "..." }`)으로 오고, `error` 를 `code` 로 쓴다.
- `message` 는 빈 문자열일 수 있다. `code` 로 판단한다.
- 자주 보는 코드: `invalid_client`(키 오류), `access_denied`·`ip-not-allowed`(허용 IP 아님), `expired-token`·`token-revoked`(토큰 무효), `account-header-required`·`account-not-found`(계좌 헤더 문제), `maintenance`(점검 중)
- `429` 는 요청 제한 초과다. `Retry-After` 초만큼 기다린 뒤 다시 시도한다. 응답 헤더 `X-RateLimit-Limit`·`X-RateLimit-Remaining` 으로 한도를 알 수 있다.

## 참고

- [토스증권 개발자 센터](https://developers.tossinvest.com) · [API Reference](https://developers.tossinvest.com/docs) · [llms.txt](https://developers.tossinvest.com/llms.txt)
- [OpenAPI JSON](https://openapi.tossinvest.com/openapi-docs/latest/openapi.json) · [OpenAPI Markdown](https://openapi.tossinvest.com/openapi-docs/latest/api-reference/README.md)
