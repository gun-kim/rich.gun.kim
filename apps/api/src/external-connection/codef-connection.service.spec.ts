import { beforeAll, describe, expect, it } from 'vitest';
import { CodefClient } from './codef/codef.client';
import { codefConfigFromEnv } from './codef/codef.config';
import type { RegisteredAccounts } from './codef/codef.schemas';
import { CodefConnectionService } from './codef-connection.service';

/*
 * 실제 CODEF API 를 호출한다. 키(CODEF_*)는 앱과 같은 환경 변수로 받고,
 * 조회할 커넥티드 아이디는 CODEF_CONNECTED_ID_FOR_TEST 로 받는다.
 * 로컬에서는 값이 없으면 건너뛰고, CI 에서는 값이 없으면 실패한다.
 *
 * 과도하게 호출하면 기관이 IP 를 차단할 수 있으므로 기관마다 최소한만 조회한다.
 * 계정 등록·추가·삭제는 실제 계정을 바꾸므로 테스트하지 않는다.
 * 증권 종목별 잔고는 증권사에 따라 계좌 비밀번호가 필요해 테스트하지 않는다.
 */
const config = codefConfigFromEnv();
const connectedId = process.env.CODEF_CONNECTED_ID_FOR_TEST ?? '';
const runInCi = Boolean(process.env.CI);
const service = new CodefConnectionService(new CodefClient(config));

/** 오늘부터 days 일 전까지의 조회 기간 (한국 시간 기준 YYYYMMDD) */
function recentDays(days: number): { startDate: string; endDate: string } {
  const format = (date: Date) =>
    date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).replaceAll('-', '');
  const now = new Date();
  return {
    startDate: format(new Date(now.getTime() - days * 24 * 60 * 60 * 1000)),
    endDate: format(now),
  };
}

const YYYYMMDD = /^\d{8}$/;

// TODO: CODEF 계속 사용 여부(데모 기간 제한)를 정하고 Secrets 를 등록할 때까지 임시로 건너뛴다.
//  다시 돌리려면 아래를 describe.skipIf(!config.clientId && !runInCi) 로 되돌린다.
describe.skip('CodefConnectionService', () => {
  it('getExchangeRates: 하나은행 고시 매매기준율을 조회한다', async () => {
    const rates = await service.getExchangeRates();

    expect(rates.resDate).toMatch(YYYYMMDD);
    const usd = rates.resDetailList.find(({ currency }) => currency === 'USD');
    expect(usd?.baseRate).toBeGreaterThan(0);
  });

  describe.skipIf(!connectedId && !runInCi)('커넥티드 아이디 조회', () => {
    let accounts: RegisteredAccounts['accountList'];
    const organizationsOf = (businessType: string) =>
      accounts.filter((account) => account.businessType === businessType).map((account) => account.organization);

    beforeAll(async () => {
      if (!connectedId) {
        throw new Error('CODEF_CONNECTED_ID_FOR_TEST 가 설정되지 않았습니다.');
      }
      ({ accountList: accounts } = await service.getRegisteredAccounts(connectedId));
    });

    it('getRegisteredAccounts: 등록된 기관 계정이 있다', () => {
      expect(accounts.length).toBeGreaterThan(0);
      for (const account of accounts) {
        expect(['BK', 'CD', 'ST']).toContain(account.businessType);
        expect(account.organization).not.toBe('');
      }
    });

    it('은행: 보유계좌와 수시입출 계좌 하나의 최근 거래내역을 조회한다', async ({ skip }) => {
      const organizations = organizationsOf('BK');
      if (organizations.length === 0) skip('등록된 은행 계정이 없다');

      for (const organization of organizations) {
        const { resDepositTrust } = await service.getBankAccounts(connectedId, organization);
        // 거래내역은 예금구분이 10(미분류)·11(수시입출) 인 계좌만 조회할 수 있다.
        const demand = resDepositTrust.find(({ resAccountDeposit }) => ['10', '11'].includes(resAccountDeposit));
        if (!demand) continue;

        const { resTrHistoryList } = await service.getBankTransactions(connectedId, {
          organization,
          account: demand.resAccount,
          ...recentDays(7),
        });
        for (const transaction of resTrHistoryList) {
          expect(transaction.resAccountTrDate).toMatch(YYYYMMDD);
        }
      }
    });

    it('증권: 증권사별 계좌 목록을 조회한다', async ({ skip }) => {
      const organizations = organizationsOf('ST');
      if (organizations.length === 0) skip('등록된 증권 계정이 없다');

      for (const organization of organizations) {
        const stockAccounts = await service.getStockAccounts(connectedId, organization);
        for (const account of stockAccounts) {
          expect(account.resAccount).not.toBe('');
        }
      }
    });

    it('카드: 보유카드, 최근 승인내역, 최근 청구 명세서를 조회한다', async ({ skip }) => {
      const organizations = organizationsOf('CD');
      if (organizations.length === 0) skip('등록된 카드 계정이 없다');

      for (const organization of organizations) {
        const cards = await service.getCards(connectedId, organization);
        expect(cards.length).toBeGreaterThan(0);

        const approvals = await service.getCardApprovals(connectedId, { organization, ...recentDays(7) });
        for (const approval of approvals) {
          expect(approval.resUsedDate).toMatch(YYYYMMDD);
        }

        await service.getCardBillings(connectedId, { organization });
      }
    });
  });
});
