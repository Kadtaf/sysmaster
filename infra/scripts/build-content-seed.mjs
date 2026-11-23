#!/usr/bin/env node
// Génère db/seeds/006_contenu_parcours.sql à partir de db/content/*.mjs.
// Usage : node infra/scripts/build-content-seed.mjs [--check]
//   --check : échoue si le fichier généré n'est pas à jour (utilisé par la CI).
//
// Pourquoi un générateur : rédiger du Markdown dans des chaînes SQL est source d'erreurs ;
// ici le contenu reste lisible, et le SQL produit est relu une fois, rejouable et sans dépendance.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commands, courses, paths, skills } from '../../db/content/index.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'db', 'seeds', '006_contenu_parcours.sql');

const json = (v) => {
  const s = JSON.stringify(v);
  if (s.includes('$json$')) throw new Error('Le contenu ne doit pas contenir « $json$ »');
  return `$json$${s}$json$::jsonb`;
};
const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;

const sql = `-- =============================================================================
-- FICHIER GÉNÉRÉ par infra/scripts/build-content-seed.mjs à partir de db/content/.
-- Ne pas modifier à la main : modifier db/content puis relancer le script.
--
-- Contenu des parcours « Administrateur Linux » et « Technicien informatique » :
-- ${commands.length} fiches commandes, ${courses.length} cours.
-- Rejouable : un contenu déjà présent (même identifiant d'URL) n'est jamais réécrit, pour ne pas
-- écraser une modification faite et relue dans le back-office.
-- =============================================================================
BEGIN;

INSERT INTO skills.skills (code, name, platform) VALUES
${skills.map((s) => `  (${lit(s.code)}, ${lit(s.name)}, ${lit(s.platform)})`).join(',\n')}
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------- Fiches ----
CREATE TEMP TABLE seeded_commands (slug text PRIMARY KEY, alternatives jsonb NOT NULL) ON COMMIT DROP;

CREATE FUNCTION pg_temp.seed_command(c jsonb) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  cid uuid;
  sid uuid;
  s jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM kb.commands WHERE slug = c->>'slug') THEN RETURN; END IF;
  INSERT INTO kb.commands (slug, name, platform, shell, summary, history, internals, syntax, why, when_to_use, context,
                           best_practices, common_errors, risk_level, risks, difficulty, requires_admin, status)
  VALUES (c->>'slug', c->>'name', (c->>'platform')::platform.os_platform, c->>'shell', c->>'summary', c->>'history',
          c->>'internals', c->>'syntax', c->>'why', c->>'whenToUse', c->>'context',
          ARRAY(SELECT jsonb_array_elements_text(c->'bestPractices')), c->'commonErrors',
          (c->>'riskLevel')::platform.risk_level, c->'risks', (c->>'difficulty')::platform.difficulty,
          (c->>'requiresAdmin')::boolean, 'published')
  RETURNING id INTO cid;

  INSERT INTO kb.command_parameters (command_id, flag, description, risk_level, position)
  SELECT cid, p->>'flag', p->>'description', (p->>'riskLevel')::platform.risk_level, i - 1
    FROM jsonb_array_elements(c->'parameters') WITH ORDINALITY AS t(p, i);
  INSERT INTO kb.command_examples (command_id, title, code, explanation, is_real_case, position)
  SELECT cid, e->>'title', e->>'code', e->>'explanation', (e->>'isRealCase')::boolean, i - 1
    FROM jsonb_array_elements(c->'examples') WITH ORDINALITY AS t(e, i);
  FOR s IN SELECT * FROM jsonb_array_elements(c->'sources') LOOP
    INSERT INTO kb.sources (title, url, publisher) VALUES (s->>'title', s->>'url', s->>'publisher')
    ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title
    RETURNING id INTO sid;
    INSERT INTO kb.command_sources (command_id, source_id) VALUES (cid, sid) ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO seeded_commands VALUES (c->>'slug', c->'alternatives');
END
$fn$;

${commands.map((c) => `SELECT pg_temp.seed_command(${json(c)});`).join('\n\n')}

-- Alternatives en second temps : une fiche peut renvoyer vers une fiche créée plus bas.
INSERT INTO kb.command_alternatives (command_id, alternative_id, note)
SELECT c.id, a.id, x->>'note'
  FROM seeded_commands s
  CROSS JOIN jsonb_array_elements(s.alternatives) AS x
  JOIN kb.commands c ON c.slug = s.slug
  JOIN kb.commands a ON a.slug = x->>'slug' AND a.status = 'published'
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------- Cours ----
CREATE FUNCTION pg_temp.seed_course(c jsonb) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  course_id uuid;
  module_id uuid;
  lesson_id uuid;
  m jsonb;
  mi int;
  l jsonb;
  li int;
BEGIN
  IF EXISTS (SELECT 1 FROM learning.courses WHERE slug = c->>'slug') THEN RETURN; END IF;
  INSERT INTO learning.courses (slug, title, summary, platform, difficulty, is_premium, status)
  VALUES (c->>'slug', c->>'title', c->>'summary', (c->>'platform')::platform.os_platform,
          (c->>'difficulty')::platform.difficulty, (c->>'isPremium')::boolean, 'published')
  RETURNING id INTO course_id;
  FOR m, mi IN SELECT * FROM jsonb_array_elements(c->'modules') WITH ORDINALITY LOOP
    INSERT INTO learning.modules (course_id, title, position) VALUES (course_id, m->>'title', mi - 1)
    RETURNING id INTO module_id;
    FOR l, li IN SELECT * FROM jsonb_array_elements(m->'lessons') WITH ORDINALITY LOOP
      INSERT INTO learning.lessons (module_id, slug, title, type, content_md, objectives, est_minutes, position)
      VALUES (module_id, l->>'slug', l->>'title', l->>'type', l->>'contentMd',
              ARRAY(SELECT jsonb_array_elements_text(l->'objectives')), (l->>'estMinutes')::int, li - 1)
      RETURNING id INTO lesson_id;
      INSERT INTO learning.lesson_skills (lesson_id, skill_id)
      SELECT lesson_id, id FROM skills.skills WHERE code IN (SELECT jsonb_array_elements_text(l->'skills'));
    END LOOP;
  END LOOP;
END
$fn$;

${courses.map((c) => `SELECT pg_temp.seed_course(${json(c)});`).join('\n\n')}

-- -------------------------------------------------------------- Parcours ----
-- L'ordre d'un parcours n'est réécrit que s'il lui manque un des cours prévus (premier chargement).
-- Un événement learning.path.published.v1 fait alors recalculer la progression des inscrits.
CREATE FUNCTION pg_temp.seed_path(p_slug text, wanted text[]) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  pid uuid;
BEGIN
  SELECT id INTO pid FROM learning.learning_paths WHERE slug = p_slug;
  IF pid IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM unnest(wanted) AS w(slug)
      JOIN learning.courses c ON c.slug = w.slug
     WHERE NOT EXISTS (SELECT 1 FROM learning.path_courses pc WHERE pc.path_id = pid AND pc.course_id = c.id)
  ) THEN RETURN; END IF;
  DELETE FROM learning.path_courses WHERE path_id = pid;
  INSERT INTO learning.path_courses (path_id, course_id, position)
  SELECT pid, c.id, row_number() OVER (ORDER BY w.ord)
    FROM unnest(wanted) WITH ORDINALITY AS w(slug, ord)
    JOIN learning.courses c ON c.slug = w.slug;
  INSERT INTO platform.outbox_events (aggregate, aggregate_id, type, payload)
  VALUES ('learning.path', pid, 'learning.path.published.v1',
          jsonb_build_object('kind', 'path', 'targetId', pid, 'key', p_slug, 'source', 'seed'));
END
$fn$;

${paths.map((p) => `SELECT pg_temp.seed_path(${lit(p.slug)}, ARRAY[${p.courses.map(lit).join(', ')}]);`).join('\n')}

COMMIT;
`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {
    /* absent */
  }
  if (current !== sql) {
    console.error('db/seeds/006_contenu_parcours.sql n’est pas à jour : lancez node infra/scripts/build-content-seed.mjs');
    process.exit(1);
  }
  console.log('✓ seed de contenu à jour');
} else {
  writeFileSync(out, sql);
  console.log(`✓ ${out} : ${commands.length} fiches, ${courses.length} cours, ${paths.length} parcours`);
}
