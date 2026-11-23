import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Database } from '../../shared/database.module';
import { Public } from '../iam/interface/auth.decorators';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly db: Database) {}

  @Get()
  async check() {
    let database: 'up' | 'down' = 'up';
    try {
      await this.db.query('SELECT 1');
    } catch {
      database = 'down';
    }
    return { status: database === 'up' ? 'ok' : 'degraded', database, time: new Date().toISOString() };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
