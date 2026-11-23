import { Injectable, OnModuleInit } from '@nestjs/common';
import type { ContentPublishedV1 } from '@sysmaster/contracts';
import { EventRegistry } from '../../../shared/events/event-registry';
import { PgAcademyRepository } from './pg-academy.repository';

/**
 * Un cours ou un parcours republié peut changer le nombre de leçons : la progression des inscrits
 * est recalculée (et un parcours qui atteint 100 % publie learning.path.completed.v1, comme d'habitude).
 */
@Injectable()
export class ContentPublishedConsumer implements OnModuleInit {
  constructor(
    private readonly registry: EventRegistry,
    private readonly academy: PgAcademyRepository,
  ) {}

  onModuleInit() {
    this.registry.subscribe('learning-progress', ['learning.course.published.v1', 'learning.path.published.v1'], async (event, tx) => {
      const p = event.payload as ContentPublishedV1;
      await this.academy.recomputeEnrolled(tx, p.kind === 'course' ? { courseId: p.targetId } : { pathId: p.targetId });
    });
  }
}
