#!/usr/bin/env node
// Applique les migrations SQL de db/migrations dans l'ordre, une seule fois chacune.
// Options : --seed (charge db/seeds/*.sql), --reset (DÉVELOPPEMENT : supprime tous les schémas applicatifs).
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = new Set(process.argv.slice(2));
const url = process.env.DATABASE_URL ?? 'postgres://sysmaster:sysmaster@localhost:5432/sysmaster';
const SCHEMAS = ['platform','iam','skills','learning','kb','diagnostic','labs','assessment','gamification','community','billing','ai','notification','editorial'];

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  if (args.has('--reset')) {
    if (process.env.NODE_ENV === 'production') throw new Error('--reset refusé en production');
    console.log('⚠  Réinitialisation : suppression des schémas applicatifs');
    await client.query(`DROP SCHEMA IF EXISTS ${SCHEMAS.join(', ')} CASCADE`);
  }
  await client.query('CREATE SCHEMA IF NOT EXISTS platform');
  await client.query(`CREATE TABLE IF NOT EXISTS platform.schema_migrations (
    filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

  const dir = join(root, 'db', 'migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const { rowCount } = await client.query('SELECT 1 FROM platform.schema_migrations WHERE filename = $1', [file]);
    if (rowCount) continue;
    console.log(`→ migration ${file}`);
    await client.query('BEGIN');
    try {
      await client.query(readFileSync(join(dir, file), 'utf8'));
      await client.query('INSERT INTO platform.schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  if (args.has('--seed')) {
    const seedDir = join(root, 'db', 'seeds');
    for (const file of readdirSync(seedDir).filter((f) => f.endsWith('.sql')).sort()) {
      console.log(`→ seed ${file}`);
      await client.query(readFileSync(join(seedDir, file), 'utf8'));
    }
  }
  console.log('✓ base à jour');
} finally {
  await client.end();
}
