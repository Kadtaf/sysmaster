import type { GamificationProfileDto, LeaderboardEntryDto } from '@sysmaster/contracts';

export type GamificationProfile = GamificationProfileDto;
export type LeaderboardEntry = LeaderboardEntryDto;

export abstract class GamificationReadRepository {
  abstract profile(userId: string): Promise<GamificationProfile>;
  abstract leaderboard(limit: number, userId: string | null): Promise<{ top: LeaderboardEntry[]; me: LeaderboardEntry | null }>;
  abstract setLeaderboardVisibility(userId: string, visible: boolean): Promise<void>;
}
