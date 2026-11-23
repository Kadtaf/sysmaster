import type { CommandDetail, CommandSummary } from '@sysmaster/contracts';

export type CommandRecord = Omit<CommandDetail, 'maskedUntilRisksRead' | 'copyAllowed'>;

export abstract class CommandReadRepository {
  abstract search(q: string | undefined, platform: string | undefined, limit: number): Promise<CommandSummary[]>;
  abstract findBySlug(slug: string): Promise<CommandRecord | null>;
}
