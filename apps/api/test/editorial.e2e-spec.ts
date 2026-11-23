import { INestApplication } from '@nestjs/common';
import type { CommandContent } from '@sysmaster/contracts';
import { Pool } from 'pg';
import request from 'supertest';
import { EditorialRepository } from '../src/modules/editorial/application/ports';
import { contentIssues } from '../src/modules/editorial/domain/editorial';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Back-office éditorial (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  const http = () => request(app.getHttpServer());
  const slug = `linux-ls-${Date.now()}`;

  const as = async (roles: string[]) => {
    const token = await tokenFor(newIdentity(), roles);
    return (r: request.Test) => r.auth(token, { type: 'bearer' });
  };

  const complete = (over: Partial<CommandContent> = {}): CommandContent => ({
    slug, name: 'ls', platform: 'linux', shell: 'bash',
    summary: 'Liste le contenu d’un répertoire.', history: null, internals: null, syntax: 'ls [options] [chemin]',
    why: 'Voir ce que contient un dossier avant d’agir.', whenToUse: 'Avant toute manipulation de fichiers.',
    context: 'Tout shell POSIX ; aucun droit particulier.', riskLevel: 'none',
    risks: [{ level: 'none', text: 'Lecture seule : ne modifie rien.' }], difficulty: 'beginner', requiresAdmin: false,
    bestPractices: ['Utiliser -la pour voir les fichiers cachés'], commonErrors: [],
    parameters: [{ flag: '-l', description: 'Format long : droits, propriétaire, taille.', riskLevel: 'none' }],
    examples: [{ title: 'Lister en détail', code: 'ls -la /var/log', explanation: 'Montre aussi les fichiers cachés.', isRealCase: false }],
    alternatives: [{ slug: 'linux-journalctl', note: 'Pour lire des journaux plutôt que lister des fichiers.' }],
    sources: [{ title: 'ls(1)', url: 'https://man7.org/linux/man-pages/man1/ls.1.html', publisher: 'man7.org' }],
    ...over,
  });

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp());
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM kb.commands WHERE slug = $1`, [slug]);
    await pool?.end();
    await app?.close();
  });

  it('toutes les fiches publiées de démo respectent la règle P-1', async () => {
    const repo = app.get(EditorialRepository);
    const slugs = await repo.publishedSlugs();
    for (const s of slugs) {
      const { content } = (await repo.publishedContent(s))!;
      expect({ slug: s, issues: contentIssues(content, slugs) }).toEqual({ slug: s, issues: [] });
    }
  });

  it('réservé aux rôles éditoriaux', async () => {
    await http().get('/api/v1/editorial/revisions').expect(401);
    const learner = await as(['learner']);
    await learner(http().get('/api/v1/editorial/revisions')).expect(403);
  });

  it('nouvelle fiche : brouillon incomplet, soumission refusée avec la liste des manques, relecture, publication', async () => {
    const author = await as(['author']);
    const reviewer = await as(['reviewer']);
    const otherAuthor = await as(['author']);

    const created = await author(http().post('/api/v1/editorial/revisions').send({})).expect(201);
    const id = created.body.id;
    expect(created.body).toMatchObject({ status: 'draft', isNew: true, can: { edit: true, submit: true, review: false } });
    expect(created.body.issues.length).toBeGreaterThan(5);

    // Un autre auteur ne voit pas ce brouillon (404 : on ne révèle pas son existence).
    await otherAuthor(http().get(`/api/v1/editorial/revisions/${id}`)).expect(404);

    // Enregistrer un brouillon incomplet est permis ; le soumettre ne l'est pas.
    await author(http().put(`/api/v1/editorial/revisions/${id}`).send(complete({ why: '', alternatives: [] }))).expect(200);
    const refused = await author(http().post(`/api/v1/editorial/revisions/${id}/submit`)).expect(422);
    expect(refused.body.issues.map((i: { field: string }) => i.field).sort()).toEqual(['alternatives', 'why']);

    // Contenu mal formé : 400 avec le champ en cause.
    const bad = await author(http().put(`/api/v1/editorial/revisions/${id}`).send({ ...complete(), riskLevel: 'extreme' })).expect(400);
    expect(bad.body.issues[0].field).toBe('riskLevel');

    await author(http().put(`/api/v1/editorial/revisions/${id}`).send(complete())).expect(200);
    const submitted = await author(http().post(`/api/v1/editorial/revisions/${id}/submit`)).expect(200);
    expect(submitted.body).toMatchObject({ status: 'in_review', issues: [], can: { edit: false, review: false } });

    // L'auteur ne peut plus modifier pendant la relecture.
    await author(http().put(`/api/v1/editorial/revisions/${id}`).send(complete())).expect(409);

    // Demander des changements exige une explication.
    await reviewer(http().post(`/api/v1/editorial/revisions/${id}/review`).send({ decision: 'request_changes' })).expect(400);
    const changes = await reviewer(http().post(`/api/v1/editorial/revisions/${id}/review`))
      .send({ decision: 'request_changes', comment: 'Ajoutez l’option -h pour les tailles lisibles.' })
      .expect(200);
    expect(changes.body).toMatchObject({ status: 'changes_requested', reviewComment: expect.stringContaining('-h') });

    // La fiche n'est pas en ligne tant qu'elle n'est pas approuvée.
    await http().get(`/api/v1/kb/commands/${slug}`).expect(404);

    const params = [...complete().parameters, { flag: '-h', description: 'Tailles lisibles (Ko, Mo).', riskLevel: 'none' as const }];
    await author(http().put(`/api/v1/editorial/revisions/${id}`).send(complete({ parameters: params }))).expect(200);
    await author(http().post(`/api/v1/editorial/revisions/${id}/submit`)).expect(200);
    const approved = await reviewer(http().post(`/api/v1/editorial/revisions/${id}/review`).send({ decision: 'approve' })).expect(200);
    expect(approved.body.status).toBe('published');
    expect(approved.body.history.map((h: { action: string }) => h.action)).toEqual([
      'created', 'submitted', 'changes_requested', 'submitted', 'approved',
    ]);

    // En ligne, avec ses éléments liés.
    const live = await http().get(`/api/v1/kb/commands/${slug}`).expect(200);
    expect(live.body.parameters.map((p: { flag: string }) => p.flag)).toEqual(['-l', '-h']);
    expect(live.body.alternatives).toEqual([expect.objectContaining({ slug: 'linux-journalctl' })]);
    expect(live.body.sources[0].url).toBe('https://man7.org/linux/man-pages/man1/ls.1.html');

    // Traçabilité : audit et événement dans la même transaction.
    const audit = await pool.query(`SELECT 1 FROM platform.audit_log WHERE action = 'kb.command.published' AND metadata->>'revisionId' = $1`, [id]);
    expect(audit.rowCount).toBe(1);
    const outbox = await pool.query(`SELECT 1 FROM platform.outbox_events WHERE type = 'kb.command.published.v1' AND payload->>'revisionId' = $1`, [id]);
    expect(outbox.rowCount).toBe(1);
  });

  it('personne ne relit sa propre révision, même un administrateur', async () => {
    const admin = await as(['admin']);
    const { body } = await admin(http().post('/api/v1/editorial/revisions').send({ fromSlug: 'linux-journalctl' })).expect(201);
    try {
      expect(body).toMatchObject({ isNew: false, content: { slug: 'linux-journalctl' } });
      await admin(http().post(`/api/v1/editorial/revisions/${body.id}/submit`)).expect(200);
      const own = await admin(http().post(`/api/v1/editorial/revisions/${body.id}/review`).send({ decision: 'approve' })).expect(403);
      expect(own.body.message).toContain('propre révision');
    } finally {
      await admin(http().post(`/api/v1/editorial/revisions/${body.id}/withdraw`)).expect(200);
    }
  });

  it('modifier une fiche publiée : une seule révision ouverte, l’identifiant d’URL ne change pas, la version en ligne reste intacte', async () => {
    const author = await as(['author']);
    const other = await as(['author']);
    const reviewer = await as(['reviewer']);
    const { body } = await author(http().post('/api/v1/editorial/revisions').send({ fromSlug: 'linux-journalctl' })).expect(201);
    try {
      await other(http().post('/api/v1/editorial/revisions').send({ fromSlug: 'linux-journalctl' })).expect(409);
      await author(http().put(`/api/v1/editorial/revisions/${body.id}`).send({ ...body.content, slug: 'journalctl-renomme' })).expect(400);

      const before = (await http().get('/api/v1/kb/commands/linux-journalctl').expect(200)).body;
      await author(http().put(`/api/v1/editorial/revisions/${body.id}`).send({ ...body.content, summary: 'Résumé modifié en brouillon' })).expect(200);
      expect((await http().get('/api/v1/kb/commands/linux-journalctl').expect(200)).body.summary).toBe(before.summary);

      // Le relecteur voit la révision dans sa file.
      const queue = await reviewer(http().get('/api/v1/editorial/revisions?status=draft')).expect(200);
      expect(queue.body.map((r: { id: string }) => r.id)).toContain(body.id);
    } finally {
      await author(http().post(`/api/v1/editorial/revisions/${body.id}/withdraw`)).expect(200);
    }
  });
});
