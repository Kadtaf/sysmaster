import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

export const PG_POOL = Symbol('PG_POOL');

/** Petit utilitaire transactionnel partagé par les adaptateurs Postgres. */
@Injectable()
export class Database implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) readonly pool: Pool) {}

  query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, params: unknown[] = []) {
    return this.pool.query<T>(text, params);
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () =>
        new Pool({
          connectionString: process.env.DATABASE_URL ?? 'postgres://sysmaster:sysmaster@localhost:5432/sysmaster',
          max: Number(process.env.PG_POOL_MAX ?? 10),
        }),
    },
    Database,
  ],
  exports: [Database],
})
export class DatabaseModule {}
