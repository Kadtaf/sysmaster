import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { SymptomDto, Platform } from '@sysmaster/contracts';
import { DiagnosticKnowledgePort } from './ports';

export class ListSymptomsQuery {
  constructor(readonly platform: string) {}
}

@QueryHandler(ListSymptomsQuery)
export class ListSymptomsHandler implements IQueryHandler<ListSymptomsQuery, SymptomDto[]> {
  constructor(private readonly knowledge: DiagnosticKnowledgePort) {}

  async execute({ platform }: ListSymptomsQuery): Promise<SymptomDto[]> {
    const symptoms = await this.knowledge.listSymptoms(platform);
    return symptoms.map((s) => ({ code: s.code, label: s.label, platform: s.platform as Platform }));
  }
}
