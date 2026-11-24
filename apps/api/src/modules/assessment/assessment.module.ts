import { Module } from '@nestjs/common';
import { PracticeService } from './application/practice.service';
import { QuizRepository } from './application/ports';
import { PgQuizRepository } from './infrastructure/pg-quiz.repository';
import { QuizController } from './interface/quiz.controller';

/** Évaluation : pour l'instant, les quiz d'entraînement publiés depuis le back-office. */
@Module({
  controllers: [QuizController],
  providers: [PracticeService, { provide: QuizRepository, useClass: PgQuizRepository }],
})
export class AssessmentModule {}
