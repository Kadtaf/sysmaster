import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CommandReadRepository } from './application/ports';
import { GetCommandHandler, SearchCommandsHandler } from './application/queries';
import { PgCommandReadRepository } from './infrastructure/pg-command-read.repository';
import { KnowledgeController } from './interface/knowledge.controller';

@Module({
  imports: [CqrsModule],
  controllers: [KnowledgeController],
  providers: [
    SearchCommandsHandler,
    GetCommandHandler,
    { provide: CommandReadRepository, useClass: PgCommandReadRepository },
  ],
})
export class KnowledgeModule {}
