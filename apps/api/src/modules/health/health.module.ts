import { Controller, Get, HttpCode, Module, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Database } from '../../shared/database.module';
import { Public } from '../iam/interface/auth.decorators';

/**
 * Sondes de santé.
 * - live : le processus répond. Kubernetes le redémarre sinon ; elle ne touche pas la base,
 *   pour qu'une panne de Postgres ne déclenche pas une cascade de redémarrages inutiles.
 * - ready : la base répond. Sinon le pod sort du load balancer, sans être tué.
 */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly db: Database) {}

  private async database(): Promise<'up' | 'down'> {
    try {
      await this.db.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }

  @Get()
  async check() {
    const database = await this.database();
    return { status: database === 'up' ? 'ok' : 'degraded', database, version: process.env.APP_VERSION ?? 'dev', time: new Date().toISOString() };
  }

  @Get('live')
  @HttpCode(200)
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    if ((await this.database()) === 'down') throw new ServiceUnavailableException({ status: 'unavailable', database: 'down' });
    return { status: 'ok', database: 'up' };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
