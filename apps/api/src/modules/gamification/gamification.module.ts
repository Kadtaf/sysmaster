import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { GamificationReadRepository } from './application/ports';
import { GetGamificationProfileHandler, GetLeaderboardHandler } from './application/queries';
import { PgGamificationConsumer } from './infrastructure/pg-gamification.consumer';
import { PgGamificationReadRepository } from './infrastructure/pg-gamification-read.repository';
import { GamificationController } from './interface/gamification.controller';

/** Gamification : alimentée uniquement par des événements (aucun autre module ne l'appelle). */
@Module({
  imports: [CqrsModule],
  controllers: [GamificationController],
  providers: [
    PgGamificationConsumer,
    GetGamificationProfileHandler,
    GetLeaderboardHandler,
    { provide: GamificationReadRepository, useClass: PgGamificationReadRepository },
  ],
})
export class GamificationModule {}
