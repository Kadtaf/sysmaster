import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CertificateRenderer, CertificateSigner, CertificationRepository } from './application/certification-ports';
import { PdfLibCertificateRenderer } from './infrastructure/certificate-pdf';
import { CertificationService } from './application/certification.service';
import { PracticeService } from './application/practice.service';
import { QuizRepository } from './application/ports';
import { Ed25519Signer } from './infrastructure/ed25519-signer';
import { PgCertificationRepository } from './infrastructure/pg-certification.repository';
import { PgQuizRepository } from './infrastructure/pg-quiz.repository';
import { CertificationController } from './interface/certification.controller';
import { QuizController } from './interface/quiz.controller';

/** Évaluation : quiz d'entraînement publiés depuis le back-office, examens de certification et certificats signés. */
@Module({
  imports: [BillingModule],
  controllers: [QuizController, CertificationController],
  providers: [
    PracticeService,
    CertificationService,
    { provide: QuizRepository, useClass: PgQuizRepository },
    { provide: CertificationRepository, useClass: PgCertificationRepository },
    { provide: CertificateSigner, useClass: Ed25519Signer },
    { provide: CertificateRenderer, useClass: PdfLibCertificateRenderer },
  ],
})
export class AssessmentModule {}
