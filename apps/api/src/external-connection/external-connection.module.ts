import { Module } from '@nestjs/common';
import { BanksaladConnectionService } from './banksalad-connection.service';
import { ExternalConnectionRepository } from './storage/external-connection.repository';
import { TossInvestClient } from './tossinvest/tossinvest.client';
import { TossInvestConnectionService } from './tossinvest-connection.service';
import { UpbitClient } from './upbit/upbit.client';
import { UpbitConnectionService } from './upbit-connection.service';

const services = [
  UpbitConnectionService,
  TossInvestConnectionService,
  BanksaladConnectionService,
  ExternalConnectionRepository,
];

/** 외부 서비스(업비트, 토스증권, 뱅크샐러드) 연동을 묶는 모듈 */
@Module({
  providers: [
    UpbitClient,
    TossInvestClient,
    ...services,
  ],
  exports: services,
})
export class ExternalConnectionModule {}
