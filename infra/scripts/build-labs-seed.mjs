#!/usr/bin/env node
// Génère db/seeds/007_labs.sql à partir de db/content/labs.mjs.
// Usage : node infra/scripts/build-labs-seed.mjs [--check]
//   --check : échoue si le fichier généré n'est pas à jour (utilisé par la CI).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import labs from '../../db/content/labs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'db', 'seeds', '007_labs.sql');

const json = (v) => {
  const s = JSON.stringify(v);
  if (s.includes('$json$')) throw new Error('Le contenu ne doit pas contenir « $json$ »');
  return `$json$${s}$json$::jsonb`;
};

const rows = labs.map((l) =>
  json({
    slug: l.slug,
    title: l.title,
    category: l.category,
    difficulty: l.difficulty,
    ttlMinutes: l.ttlMinutes,
    briefMd: l.briefMd,
    objectives: l.objectives,
    hints: l.hints.map((text) => ({ text })),
    solutionMd: l.solutionMd,
    simulation: { machine: l.machine, validators: l.validators },
  }),
);

const sql = `-- =============================================================================
-- FICHIER GÉNÉRÉ par infra/scripts/build-labs-seed.mjs à partir de db/content/labs.mjs.
-- Ne pas modifier à la main : modifier db/content/labs.mjs puis relancer le script.
--
-- ${labs.length} labs simulés. Rejouable : un lab déjà présent (même slug) n'est jamais réécrit.
-- =============================================================================
INSERT INTO labs.lab_templates (slug, title, category, difficulty, runtime, brief_md, objectives, hints,
                                solution_md, ttl_minutes, simulation, status)
SELECT l->>'slug', l->>'title', l->>'category', (l->>'difficulty')::platform.difficulty, 'simulation',
       l->>'briefMd', ARRAY(SELECT jsonb_array_elements_text(l->'objectives')), l->'hints',
       l->>'solutionMd', (l->>'ttlMinutes')::int, l->'simulation', 'published'
  FROM (VALUES
${rows.map((r) => `    (${r})`).join(',\n')}
  ) AS v(l)
ON CONFLICT (slug) DO NOTHING;
`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {
    /* absent */
  }
  if (current !== sql) {
    console.error('db/seeds/007_labs.sql n’est pas à jour : lancez node infra/scripts/build-labs-seed.mjs');
    process.exit(1);
  }
  console.log('✓ seed des labs à jour');
} else {
  writeFileSync(out, sql);
  console.log(`✓ ${out} : ${labs.length} labs`);
}
