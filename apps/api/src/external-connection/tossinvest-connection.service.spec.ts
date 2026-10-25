import { beforeAll, describe, expect, it } from 'vitest';
import { TossInvestClient } from './tossinvest/tossinvest.client';
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

// TODO: Secrets 를 등록할 때까지 임시로 건너뛴다.
//  다시 돌리려면 아래를 describe.skipIf(!hasCredentials && !process.env.CI) 로 되돌린다.
describe.skip('TossInvestConnectionService', () => {
  let accountSeq: number;

  beforeAll(async () => {
    if (!hasCredentials) {
      throw new Error('TOSSINVEST_CLIENT_ID_FOR_TEST, TOSSINVEST_CLIENT_SECRET_FOR_TEST 가 설정되지 않았습니다.');
    }
    const accounts = await service.getAccounts(credentials);
    expect(accounts.length).toBeGreaterThan(0);
    accountSeq = accounts[0].accountSeq;
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
