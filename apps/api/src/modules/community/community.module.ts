import { Module } from '@nestjs/common';
import { CommunityService } from './application/community.service';
import { CommunityRepository } from './application/ports';
import { SocialRepository } from './application/social-ports';
import { SocialService } from './application/social.service';
import { PgCommunityRepository } from './infrastructure/pg-community.repository';
import { PgSocialRepository } from './infrastructure/pg-social.repository';
import { CommunityController } from './interface/community.controller';
import { SocialController } from './interface/social.controller';

/** Communauté : forum, questions-réponses, votes, signalements, modération, groupes d'étude et mentorat. */
@Module({
  controllers: [CommunityController, SocialController],
  providers: [
    CommunityService,
    SocialService,
    { provide: CommunityRepository, useClass: PgCommunityRepository },
    { provide: SocialRepository, useClass: PgSocialRepository },
  ],
})
export class CommunityModule {}
