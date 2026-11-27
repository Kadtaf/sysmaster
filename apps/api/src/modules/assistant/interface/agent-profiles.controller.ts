import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Database } from '../../../shared/database.module';
import { Public } from '../../iam/interface/auth.decorators';
import { DEV_AI_TOKEN } from '../../../shared/security/production-config';

export interface AgentProfileForAi {
  code: string;
  systemPrompt: string;
  version: number;
}

/**
 * Lecture des profils d'agents par le service IA, qui n'accède pas à la base. Même jeton partagé
 * que dans l'autre sens ; absent de la documentation publique. Seuls les profils actifs sont rendus :
 * pour un profil désactivé, le service revient à son texte intégré.
 */
@ApiExcludeController()
@Controller('ai')
export class AgentProfilesController {
  private readonly token = Buffer.from(process.env.AI_SERVICE_TOKEN ?? DEV_AI_TOKEN);

  constructor(private readonly db: Database) {}

  @Public()
  @Get('profiles')
  async list(@Headers('x-ai-token') given = ''): Promise<AgentProfileForAi[]> {
    const g = Buffer.from(given);
    if (g.length !== this.token.length || !timingSafeEqual(g, this.token)) throw new UnauthorizedException('Jeton de service invalide');
    const { rows } = await this.db.query<{ code: string; system_prompt: string; version: number }>(
      `SELECT code, system_prompt, version FROM ai.agent_profiles WHERE enabled ORDER BY code`,
    );
    return rows.map((r) => ({ code: r.code, systemPrompt: r.system_prompt, version: r.version }));
  }
}
