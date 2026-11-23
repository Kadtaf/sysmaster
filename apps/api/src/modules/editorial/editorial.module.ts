import { Module } from '@nestjs/common';
import { EditorialService } from './application/editorial.service';
import { EditorialRepository } from './application/ports';
import { PgEditorialRepository } from './infrastructure/pg-editorial.repository';
import { EditorialController } from './interface/editorial.controller';

/** Back-office éditorial (Phase 2) : rédaction, relecture et publication des fiches commandes. */
@Module({
  controllers: [EditorialController],
  providers: [EditorialService, { provide: EditorialRepository, useClass: PgEditorialRepository }],
})
export class EditorialModule {}
