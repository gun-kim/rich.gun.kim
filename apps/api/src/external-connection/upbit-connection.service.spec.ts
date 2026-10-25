import { describe, expect, it } from 'vitest';
import { UpbitClient } from './upbit/upbit.client';
import { UpbitConnectionService } from './upbit-connection.service';

/*
 * 실제 업비트 API 를 호출한다.
 * getAccounts 는 API Key 의 허용 IP 에 등록된 곳(CI 는 osaka 셀프호스티드 러너)에서만 성공한다.
 * 로컬에서는 키가 없으면 건너뛰고, CI 에서는 키가 없으면 실패한다.
 */
const credentials = {
  accessKey: process.env.UPBIT_ACCESS_KEY_FOR_TEST ?? '',
  secretKey: process.env.UPBIT_SECRET_KEY_FOR_TEST ?? '',
};
const hasCredentials = Boolean(credentials.accessKey && credentials.secretKey);
const service = new UpbitConnectionService(new UpbitClient());

// TODO: Secrets 를 등록할 때까지 임시로 건너뛴다. 다시 돌리려면 .skip 을 지운다.
describe.skip('UpbitConnectionService', () => {
  describe('getTickers', () => {
    it('페어가 없으면 빈 배열을 돌려준다', async () => {
      await expect(service.getTickers([])).resolves.toEqual([]);
    });

    it('중복을 없애고 페어별 현재가를 조회한다', async () => {
      const tickers = await service.getTickers(['KRW-BTC', 'KRW-ETH', 'KRW-BTC']);

      expect(tickers.map(({ market }) => market).toSorted()).toEqual(['KRW-BTC', 'KRW-ETH']);
      for (const ticker of tickers) {
        expect(ticker.trade_price).toBeGreaterThan(0);
      }
    });

    it('업비트에 없는 페어는 빼고 조회한다', async () => {
      const tickers = await service.getTickers(['KRW-BTC', 'KRW-NOT-LISTED']);
      expect(tickers.map(({ market }) => market)).toEqual(['KRW-BTC']);

      await expect(service.getTickers(['KRW-NOT-LISTED'])).resolves.toEqual([]);
    });
  });

  describe.skipIf(!hasCredentials && !process.env.CI)('getAccounts', () => {
    it('API Key 의 화폐별 보유수량과 매수 평균가를 조회한다', async () => {
      if (!hasCredentials) {
        throw new Error('UPBIT_ACCESS_KEY_FOR_TEST, UPBIT_SECRET_KEY_FOR_TEST 가 설정되지 않았습니다.');
      }
      const accounts = await service.getAccounts(credentials);

      for (const account of accounts) {
        expect(account.currency).not.toBe('');
        expect(account.balance).toBeGreaterThanOrEqual(0);
        expect(account.locked).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
