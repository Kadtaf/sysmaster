import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { CommandDetail, CommandSummary } from '@sysmaster/contracts';
import { copyAllowed, maskedUntilRisksRead } from '../domain/risk-policy';
import { CommandReadRepository } from './ports';

export class SearchCommandsQuery {
  constructor(
    readonly q?: string,
    readonly platform?: string,
    readonly limit = 50,
  ) {}
}

@QueryHandler(SearchCommandsQuery)
export class SearchCommandsHandler implements IQueryHandler<SearchCommandsQuery, CommandSummary[]> {
  constructor(private readonly repo: CommandReadRepository) {}
  execute({ q, platform, limit }: SearchCommandsQuery) {
    return this.repo.search(q?.trim() || undefined, platform || undefined, Math.min(Math.max(limit, 1), 100));
  }
}

export class GetCommandQuery {
  constructor(readonly slug: string) {}
}

@QueryHandler(GetCommandQuery)
export class GetCommandHandler implements IQueryHandler<GetCommandQuery, CommandDetail> {
  constructor(private readonly repo: CommandReadRepository) {}
  async execute({ slug }: GetCommandQuery): Promise<CommandDetail> {
    const cmd = await this.repo.findBySlug(slug);
    if (!cmd) throw new NotFoundException(`Fiche « ${slug} » introuvable`);
    return {
      ...cmd,
      maskedUntilRisksRead: maskedUntilRisksRead(cmd.riskLevel),
      copyAllowed: copyAllowed(cmd.riskLevel),
    };
  }
}
