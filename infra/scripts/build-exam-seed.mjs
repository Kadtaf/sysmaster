#!/usr/bin/env node
// Génère db/seeds/012_banques_examens.sql à partir de db/content/exam-banks.mjs.
// Usage : node infra/scripts/build-exam-seed.mjs [--check]
//   --check : échoue si le fichier généré n'est pas à jour (utilisé par la CI).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { banks, exams, levelsOnly } from '../../db/content/exam-banks.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'db', 'seeds', '012_banques_examens.sql');

const LETTERS = ['a', 'b', 'c', 'd'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'expert'];
// Espace de noms fixe des UUID v5 des questions : ne jamais le changer, les identifiants en dépendent.
const NAMESPACE = 'b7a4f3e2-5c1d-4e8a-9f60-3d2c1b0a9e87';

/** UUID v5 (RFC 4122) : stable pour une même clé. */
function uuidV5(name) {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex');
  const h = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest().subarray(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** Permutation de [0..n-1] déterministe, tirée de la clé de la question (Fisher-Yates sur un flux SHA-256). */
function permutation(key, n) {
  const bytes = createHash('sha256').update(`ordre:${key}`).digest();
  const p = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}

const errors = [];
const seen = new Set();
const rows = [];
for (const [platform, questions] of Object.entries(banks)) {
  for (const q of questions) {
    const before = errors.length;
    const fail = (m) => errors.push(`${platform}/${q.key} : ${m}`);
    if (!/^[a-z]+-\d{2,3}$/.test(q.key ?? '')) fail('clé invalide (ex. net-01)');
    if (seen.has(q.key)) fail('clé en double');
    seen.add(q.key);
    if (!DIFFICULTIES.includes(q.difficulty)) fail(`difficulté inconnue « ${q.difficulty} »`);
    if (!['single', 'multiple'].includes(q.type)) fail(`type inconnu « ${q.type} »`);
    if (!q.prompt || q.prompt.length < 15) fail('énoncé trop court');
    if (!Array.isArray(q.choices) || q.choices.length !== 4) fail('il faut exactement quatre propositions');
    if (new Set(q.choices ?? []).size !== (q.choices ?? []).length) fail('propositions en double');
    const answer = q.answer ?? [];
    if (answer.some((l) => !LETTERS.includes(l)) || new Set(answer).size !== answer.length) fail('réponse invalide');
    if (q.type === 'single' && answer.length !== 1) fail('une question « single » a exactement une bonne réponse');
    if (q.type === 'multiple' && (answer.length < 2 || answer.length > 3)) fail('une question « multiple » a deux ou trois bonnes réponses');
    // P-1 : on explique toujours pourquoi.
    if (!q.explanation || q.explanation.length < 80) fail('explication trop courte (80 caractères minimum)');
    if (q.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(q.id)) fail('id invalide');
    if (errors.length > before) continue;

    // Mélange : la proposition écrite en position perm[k] devient la lettre k.
    const perm = permutation(q.key, 4);
    const choices = perm.map((from, k) => ({ id: LETTERS[k], text: q.choices[from] }));
    const correct = new Set(answer.map((l) => LETTERS.indexOf(l)));
    const newAnswer = perm.flatMap((from, k) => (correct.has(from) ? [LETTERS[k]] : []));
    rows.push({
      id: q.id ?? uuidV5(`question:${q.key}`), type: q.type, prompt: q.prompt, choices, answer: newAnswer,
      explanation: q.explanation, difficulty: q.difficulty, platform,
    });
  }
}

for (const [code, e] of Object.entries(exams)) {
  if (!Number.isInteger(e.questionCount) || e.questionCount < 5) errors.push(`${code} : nombre de questions invalide`);
  if (!Number.isInteger(e.timeLimitS) || e.timeLimitS < 300) errors.push(`${code} : durée invalide`);
  if ((e.difficulties ?? []).some((d) => !DIFFICULTIES.includes(d))) errors.push(`${code} : niveau inconnu`);
  // Le tirage doit avoir le choix : au moins un tiers de questions en plus de ce que l'examen sert.
  const pool = rows.filter((r) => e.platforms.includes(r.platform) && (!e.difficulties?.length || e.difficulties.includes(r.difficulty))).length;
  if (pool < Math.ceil(e.questionCount * 1.2)) errors.push(`${code} : ${pool} questions disponibles pour un examen de ${e.questionCount}`);
}
for (const [code, levels] of Object.entries(levelsOnly)) {
  if (exams[code] || levels.some((d) => !DIFFICULTIES.includes(d))) errors.push(`${code} : niveaux invalides`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const json = (v) => {
  const s = JSON.stringify(v);
  if (s.includes('$q$')) throw new Error('Le contenu ne doit pas contenir « $q$ »');
  return `$q$${s}$q$::jsonb`;
};
const byPlatform = Object.entries(banks).map(([p, qs]) => `${p} ${qs.length}`).join(', ');

const sql = `-- =============================================================================
-- FICHIER GÉNÉRÉ par infra/scripts/build-exam-seed.mjs à partir de db/content/exam-banks.mjs.
-- Ne pas modifier à la main : modifier db/content/exam-banks/*.mjs puis relancer le script.
--
-- ${rows.length} questions d'examen relues (${byPlatform}). Rejouable : le contenu du dépôt fait
-- foi et réécrit une question existante (même identifiant), sauf son état de relecture : une question
-- retirée par un administrateur (reviewed = false) le reste.
-- =============================================================================
INSERT INTO assessment.questions (id, type, prompt_md, choices, answer, explanation, difficulty, platform, generated_by_ai, reviewed)
SELECT (q->>'id')::uuid, q->>'type', q->>'prompt', q->'choices', q->'answer', q->>'explanation',
       (q->>'difficulty')::platform.difficulty, (q->>'platform')::platform.os_platform, false, true
  FROM (VALUES
${rows.map((r) => `    (${json(r)})`).join(',\n')}
  ) AS v(q)
ON CONFLICT (id) DO UPDATE
  SET type = EXCLUDED.type, prompt_md = EXCLUDED.prompt_md, choices = EXCLUDED.choices, answer = EXCLUDED.answer,
      explanation = EXCLUDED.explanation, difficulty = EXCLUDED.difficulty, platform = EXCLUDED.platform;

-- Réglages des examens dont la banque est prête.
UPDATE assessment.certifications c SET exam_question_count = e.n, exam_time_limit_s = e.t, exam_difficulties = e.d::platform.difficulty[]
  FROM (VALUES
${Object.entries(exams).map(([code, e]) => `    ('${code}', ${e.questionCount}, ${e.timeLimitS}, '{${(e.difficulties ?? []).join(',')}}')`).join(',\n')}
  ) AS e(code, n, t, d)
 WHERE c.code = e.code;

-- Niveaux fixés à l'avance pour des banques encore à écrire.
UPDATE assessment.certifications c SET exam_difficulties = e.d::platform.difficulty[]
  FROM (VALUES
${Object.entries(levelsOnly).map(([code, d]) => `    ('${code}', '{${d.join(',')}}')`).join(',\n')}
  ) AS e(code, d)
 WHERE c.code = e.code;
`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {
    /* absent */
  }
  if (current !== sql) {
    console.error('db/seeds/012_banques_examens.sql n’est pas à jour : lancez node infra/scripts/build-exam-seed.mjs');
    process.exit(1);
  }
  console.log('✓ seed des banques d’examen à jour');
} else {
  writeFileSync(out, sql);
  console.log(`✓ ${out} : ${rows.length} questions (${byPlatform})`);
}
