import { Injectable } from '@nestjs/common';
import { TossInvestClient, type TossInvestCredentials } from './tossinvest/tossinvest.client';
import {
  accountsSchema,
  buyingPowerSchema,
  exchangeRateSchema,
  holdingsSchema,
  type TossInvestAccount,
  type TossInvestExchangeRate,
  type TossInvestHoldings,
} from './tossinvest/tossinvest.schemas';

/**
 * 토스증권 Open API 로 국내·미국 주식 보유 현황, 예수금, 환율을 조회한다.
 * API Key 는 사용자마다 다르므로 호출하는 쪽이 사용자별로 저장해 두고 넘긴다.
 * 호출하는 서버 IP 가 키의 허용 IP 에 등록되어 있어야 한다. 각 API 명세는 docs/tossinvest 를 참고한다.
 */
@Injectable()
export class TossInvestConnectionService {
  constructor(private readonly client: TossInvestClient) {}

  /** 계좌 목록. 현재는 종합매매(BROKERAGE) 계좌만 오고, 계좌가 없으면 빈 배열이다. */
  async getAccounts(credentials: TossInvestCredentials): Promise<TossInvestAccount[]> {
    const data = await this.client.get('/api/v1/accounts', credentials);
    return accountsSchema.parse(data);
  }

  /**
   * 계좌 하나의 보유 주식과 통화별 평가금액·손익 합계.
   * 국내(KR)·미국(US) 주식만 포함하고, 금액은 환율 환산 없이 거래 통화별로 따로 합산된다.
   */
  async getHoldings(credentials: TossInvestCredentials, accountSeq: number): Promise<TossInvestHoldings> {
    const data = await this.client.get('/api/v1/holdings', credentials, { accountSeq });
    return holdingsSchema.parse(data);
  }

  /**
   * 계좌 하나의 통화별 현금 기반 매수 가능 금액 (미수 미발생 기준).
   * 토스증권 Open API 에 예수금 조회가 없어 현금 잔고로 이 값을 쓴다.
   */
  async getCashBuyingPower(
    credentials: TossInvestCredentials,
    accountSeq: number,
    currency: 'KRW' | 'USD',
  ): Promise<number> {
    const data = await this.client.get('/api/v1/buying-power', credentials, {
      accountSeq,
      query: { currency },
    });
    return buyingPowerSchema.parse(data).cashBuyingPower;
  }

  /** 현재 USD→KRW 환율. 미국 주식 평가금액을 원화로 환산하는 데 쓴다. 계좌는 필요 없다. */
  async getUsdKrwRate(credentials: TossInvestCredentials): Promise<TossInvestExchangeRate> {
    const data = await this.client.get('/api/v1/exchange-rate', credentials, {
      query: { baseCurrency: 'USD', quoteCurrency: 'KRW' },
    });
    return exchangeRateSchema.parse(data);
  }
}
