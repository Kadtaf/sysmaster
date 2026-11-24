import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GenerateLabDraftSchema, type LabDraftDto } from '@sysmaster/contracts';
import type { AuthenticatedUser } from '../../iam/domain/identity';
import { CurrentUser, Roles } from '../../iam/interface/auth.decorators';
import { parse } from '../application/editorial.service';
import { LabDraftService } from '../application/lab-draft.service';

@ApiTags('editorial')
@ApiBearerAuth()
@Roles('author', 'admin')
@Controller('editorial/lab-drafts')
export class LabDraftController {
  constructor(private readonly drafts: LabDraftService) {}

  @Post()
  @ApiOperation({
    summary:
      'Brouillon de lab simulé rédigé par l’IA : { topic, category, difficulty? } → révision à relire. La démarche proposée est rejouée sur le simulateur, avec au plus une passe de correction (compte dans le quota IA).',
  })
  draft(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<LabDraftDto> {
    return this.drafts.draft(user, parse(GenerateLabDraftSchema, body ?? {}));
  }
}
