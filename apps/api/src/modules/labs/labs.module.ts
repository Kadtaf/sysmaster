import { Module } from '@nestjs/common';
import { LabsService } from './application/labs.service';
import { LabRepository } from './application/ports';
import { PgLabRepository } from './infrastructure/pg-lab.repository';
import { LabInstancesController, LabsController } from './interface/labs.controller';

/**
 * Labs virtuels. Premier runtime : la simulation (machine en JSON, commandes interprétées par
 * le domaine). Les runtimes réels (conteneur, micro-VM) viendront derrière le même service.
 */
@Module({
  controllers: [LabsController, LabInstancesController],
  providers: [LabsService, { provide: LabRepository, useClass: PgLabRepository }],
})
export class LabsModule {}
