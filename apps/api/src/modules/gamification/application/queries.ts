import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GamificationProfile, GamificationReadRepository, LeaderboardEntry } from './ports';

export class GetGamificationProfileQuery {
  constructor(readonly userId: string) {}
}

@QueryHandler(GetGamificationProfileQuery)
export class GetGamificationProfileHandler implements IQueryHandler<GetGamificationProfileQuery, GamificationProfile> {
  constructor(private readonly repo: GamificationReadRepository) {}
  execute({ userId }: GetGamificationProfileQuery) {
    return this.repo.profile(userId);
  }
}

export class GetLeaderboardQuery {
  constructor(readonly limit: number, readonly userId: string | null) {}
}

@QueryHandler(GetLeaderboardQuery)
export class GetLeaderboardHandler implements IQueryHandler<GetLeaderboardQuery, { top: LeaderboardEntry[]; me: LeaderboardEntry | null }> {
  constructor(private readonly repo: GamificationReadRepository) {}
  execute({ limit, userId }: GetLeaderboardQuery) {
    return this.repo.leaderboard(limit, userId);
  }
}
