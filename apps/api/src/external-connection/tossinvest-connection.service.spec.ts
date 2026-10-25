import { beforeAll, describe, expect, it } from 'vitest';
import { TossInvestClient } from './tossinvest/tossinvest.client';
import type { TossInvestAccount } from './tossinvest/tossinvest.schemas';
import { TossInvestConnectionService } from './tossinvest-connection.service';

/*
 * 실제 토스증권 Open API 를 호출한다.
 * 토큰 발급부터 API Key 의 허용 IP 에 등록된 곳(CI 는 osaka 셀프호스티드 러너)에서만 성공한다.
 * 로컬에서는 키가 없으면 건너뛰고, CI 에서는 키가 없으면 실패한다.
 *
 * 클라이언트당 유효한 토큰은 1개라, 같은 키를 쓰는 다른 프로세스가 있으면 서로의 토큰을 무효화한다.
 * 테스트용 키는 앱과 따로 발급한다. 주문 API 는 쓰지 않는다.
 */
const credentials = {
  clientId: process.env.TOSSINVEST_CLIENT_ID_FOR_TEST ?? '',
  clientSecret: process.env.TOSSINVEST_CLIENT_SECRET_FOR_TEST ?? '',
};
const hasCredentials = Boolean(credentials.clientId && credentials.clientSecret);
const service = new TossInvestConnectionService(new TossInvestClient());

describe.skipIf(!hasCredentials && !process.env.CI)('TossInvestConnectionService', () => {
  let accounts: TossInvestAccount[];
  let accountSeq: number;

  beforeAll(async () => {
    if (!hasCredentials) {
      throw new Error('TOSSINVEST_CLIENT_ID_FOR_TEST, TOSSINVEST_CLIENT_SECRET_FOR_TEST 가 설정되지 않았습니다.');
    }
    accounts = await service.getAccounts(credentials);
    accountSeq = accounts[0]?.accountSeq;
  });

  it('getAccounts: 내 계좌 목록을 조회한다', () => {
    expect(accounts.length).toBeGreaterThan(0);
    for (const account of accounts) {
      expect(account.accountNo).not.toBe('');
      expect(Number.isInteger(account.accountSeq)).toBe(true);
    }
  });

  it('getHoldings: 보유 주식과 통화별 평가금액을 조회한다', async () => {
    const holdings = await service.getHoldings(credentials, accountSeq);

    expect(holdings.marketValue.amount.krw).toBeGreaterThanOrEqual(0);
    for (const item of holdings.items) {
      expect(item.symbol).not.toBe('');
      expect(item.quantity).toBeGreaterThan(0);
      expect(item.lastPrice).toBeGreaterThan(0);
    }
  });

  it('getStocks: 국내·미국 종목의 기본 정보를 조회한다', async () => {
    const stocks = await service.getStocks(credentials, ['005930', 'AAPL', '005930']);

    expect(stocks.map(({ symbol }) => symbol).toSorted()).toEqual(['005930', 'AAPL']);
    const samsung = stocks.find(({ symbol }) => symbol === '005930');
    expect(samsung).toMatchObject({ market: 'KOSPI', currency: 'KRW' });
    const apple = stocks.find(({ symbol }) => symbol === 'AAPL');
    expect(apple).toMatchObject({ market: 'NASDAQ', currency: 'USD' });
  });

  it('getCashBuyingPower: 원화·달러 현금 매수 가능 금액을 조회한다', async () => {
    await expect(service.getCashBuyingPower(credentials, accountSeq, 'KRW')).resolves.toBeGreaterThanOrEqual(0);
    await expect(service.getCashBuyingPower(credentials, accountSeq, 'USD')).resolves.toBeGreaterThanOrEqual(0);
  });

  it('getUsdKrwRate: USD→KRW 환율을 조회한다', async () => {
    const rate = await service.getUsdKrwRate(credentials);

    expect(rate.baseCurrency).toBe('USD');
    expect(rate.quoteCurrency).toBe('KRW');
    expect(rate.rate).toBeGreaterThan(0);
  });
});
