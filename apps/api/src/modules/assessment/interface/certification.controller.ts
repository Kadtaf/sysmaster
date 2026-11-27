import { Body, Controller, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ExamSubmissionSchema, RevokeCertificateSchema,
  type CertificateDto, type CertificationDto, type ExamResultDto, type ExamSessionDto,
} from '@sysmaster/contracts';
import { parse } from '../../editorial/application/editorial.service';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser, OptionalAuth, Public, Roles } from '../../iam/interface/auth.decorators';
import { CertificationService } from '../application/certification.service';
import { LIMITS, RateLimit } from '../../../shared/security/rate-limit';

@ApiTags('certifications')
@Controller()
export class CertificationController {
  constructor(private readonly certs: CertificationService) {}

  @OptionalAuth()
  @Get('certifications')
  @ApiOperation({ summary: 'Certifications : examen, labs exigés, prérequis ; avec la situation de l’utilisateur s’il est connecté' })
  list(@CurrentUser() user: AuthenticatedUser | null): Promise<CertificationDto[]> {
    return this.certs.list(user);
  }

  @OptionalAuth()
  @Get('certifications/:code')
  @ApiOperation({ summary: 'Une certification' })
  get(@CurrentUser() user: AuthenticatedUser | null, @Param('code') code: string): Promise<CertificationDto> {
    return this.certs.get(code, user);
  }

  @ApiBearerAuth()
  @Post('certifications/:code/exam')
  @RateLimit(LIMITS.examStart)
  @ApiOperation({
    summary: 'Ouvre l’examen (questions tirées au sort dans la banque relue, sans les réponses) ou reprend celui en cours. 403 avec les raisons si les conditions ne sont pas remplies',
  })
  start(@CurrentUser() user: AuthenticatedUser, @Param('code') code: string): Promise<ExamSessionDto> {
    return this.certs.start(user, code);
  }

  @ApiBearerAuth()
  @Post('exam-sessions/:id/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remet l’examen : score et, s’il est réussi, numéro du certificat émis. Les bonnes réponses ne sont pas révélées. 410 si déjà remis' })
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown): Promise<ExamResultDto> {
    return this.certs.submit(user, id, parse(ExamSubmissionSchema, body ?? {}));
  }

  @ApiBearerAuth()
  @Get('certificates/mine')
  @ApiOperation({ summary: 'Mes certificats' })
  mine(@CurrentUser() user: AuthenticatedUser): Promise<CertificateDto[]> {
    return this.certs.mine(user);
  }

  @Public()
  @Get('certificates/public-key')
  @Header('content-type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Clé publique Ed25519 (PEM) qui vérifie la signature des certificats' })
  publicKey(): string {
    return this.certs.publicKey();
  }

  @Public()
  @Get('certificates/:serial')
  @RateLimit(LIMITS.certificateLookup)
  @ApiOperation({ summary: 'Vérification publique d’un certificat : titulaire, certification, dates, statut (valide, expiré, révoqué), signature' })
  verify(@Param('serial') serial: string): Promise<CertificateDto> {
    return this.certs.verify(serial);
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Post('certificates/:serial/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Révoque un certificat (administrateurs) : { reason }. La page de vérification affiche le motif' })
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('serial') serial: string, @Body() body: unknown): Promise<CertificateDto> {
    return this.certs.revoke(serial, user, parse(RevokeCertificateSchema, body ?? {}).reason);
  }
}
