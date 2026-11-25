import { Module } from '@nestjs/common';
import { CommunityService } from './application/community.service';
import { CommunityRepository } from './application/ports';
import { PgCommunityRepository } from './infrastructure/pg-community.repository';
import { CommunityController } from './interface/community.controller';

/** Communauté : forum, questions-réponses, votes, signalements et modération. */
@Module({
  controllers: [CommunityController],
  providers: [CommunityService, { provide: CommunityRepository, useClass: PgCommunityRepository }],
})
export class CommunityModule {}
