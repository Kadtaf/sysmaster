import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const LAB = 'linux-disque-plein-nginx';

describeDb('Communauté : partage de scripts et de labs (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  const users: string[] = [];
  const http = () => request(app.getHttpServer());

  async function member(roles = ['learner'], solved = false) {
    const identity = newIdentity();
    const token = await tokenFor(identity, roles);
    const as = (r: request.Test) => r.auth(token, { type: 'bearer' });
    await as(http().get('/api/v1/me')).expect(200);
    const id = (await pool.query(`SELECT id FROM iam.users WHERE idp_subject = $1`, [identity.sub])).rows[0].id as string;
    users.push(id);
    if (solved) {
      await pool.query(
        `INSERT INTO labs.instances (template_id, user_id, status, score, expires_at, ended_at)
         SELECT id, $1, 'solved', 100, now(), now() FROM labs.lab_templates WHERE slug = $2`,
        [id, LAB],
      );
    }
    return { id, as };
  }

  const scriptThread = (script: Record<string, unknown>) => ({
    categorySlug: 'linux', kind: 'script_share', title: 'Nettoyer les vieux journaux compressés',
    bodyMd: 'Un petit script que j’utilise chaque mois sur mes serveurs web.', tags: ['logs'], script,
  });
  const script = {
    language: 'bash', riskLevel: 'low',
    code: '#!/bin/bash\nfind /var/log -name "*.gz" -mtime +30 -print\nrm -rf /var/log/old-archives',
    explanation: 'Liste les journaux compressés de plus de 30 jours, puis supprime le dossier d’archives déjà sauvegardé.',
  };

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp());
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM community.posts WHERE author_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM community.threads WHERE author_id = ANY($1::uuid[])`, [users]);
    await pool.query(`DELETE FROM labs.instances WHERE user_id = ANY($1::uuid[])`, [users]);
    await pool?.end();
    await app?.close();
  });

  it('script : explication obligatoire, risque relevé, relu par une autre personne, re-relu après modification', async () => {
    const author = await member();
    const missing = await author.as(http().post('/api/v1/community/threads').send(scriptThread({ ...script, explanation: 'Trop court.' }))).expect(400);
    expect(missing.body.issues[0].field).toBe('script.explanation');
    await author.as(http().post('/api/v1/community/threads').send({ ...scriptThread(script), script: undefined })).expect(400);

    const { id } = (await author.as(http().post('/api/v1/community/threads').send(scriptThread(script))).expect(201)).body;
    let t = (await http().get(`/api/v1/community/threads/${id}`).expect(200)).body;
    // Déclaré « low », mais rm -rf : relevé à « high », avec la raison.
    expect(t.scriptDetail).toMatchObject({ language: 'bash', riskLevel: 'high', reviewed: false });
    expect(t.scriptDetail.warnings.join(' ')).toContain('Suppression récursive forcée');
    expect(t.script).toEqual({ language: 'bash', riskLevel: 'high', reviewed: false });

    await author.as(http().put(`/api/v1/community/threads/${id}/script-review`).send({ reviewed: true })).expect(403);
    const reviewer = await member(['reviewer']);
    await (await member()).as(http().put(`/api/v1/community/threads/${id}/script-review`).send({ reviewed: true })).expect(403);
    t = (await reviewer.as(http().put(`/api/v1/community/threads/${id}/script-review`).send({ reviewed: true })).expect(200)).body;
    expect(t.scriptDetail).toMatchObject({ reviewed: true, reviewedAt: expect.any(String) });

    // Retoucher le texte seul garde la relecture ; changer le code la retire.
    const edit = { title: 'Nettoyer les vieux journaux compressés', bodyMd: 'Un petit script que j’utilise chaque mois, version commentée.', tags: ['logs'] };
    t = (await author.as(http().put(`/api/v1/community/threads/${id}`).send({ ...edit, script: { ...script, riskLevel: 'high' } })).expect(200)).body;
    expect(t.scriptDetail.reviewed).toBe(true);
    t = (await author.as(http().put(`/api/v1/community/threads/${id}`).send({ ...edit, script: { ...script, riskLevel: 'high', code: 'find /var/log -name "*.gz" -mtime +30 -delete' } })).expect(200)).body;
    expect(t.scriptDetail).toMatchObject({ reviewed: false, riskLevel: 'high', warnings: [] });
  });

  it('lab : partagé par qui l’a résolu, démarche cachée à qui ne l’a pas résolu', async () => {
    const share = { categorySlug: 'linux', kind: 'lab_share', labSlug: LAB, title: 'Ma démarche pour le disque plein', bodyMd: 'Commencez par `df -h` puis `du -sh /var/log/*` : le coupable saute aux yeux.' };
    const notSolved = await member();
    expect((await notSolved.as(http().post('/api/v1/community/threads').send(share)).expect(403)).body.message).toContain('résolu');
    await notSolved.as(http().post('/api/v1/community/threads').send({ ...share, labSlug: 'lab-inexistant' })).expect(400);

    const author = await member(['learner'], true);
    const { id } = (await author.as(http().post('/api/v1/community/threads').send(share)).expect(201)).body;
    const solver = await member(['learner'], true);
    await solver.as(http().post(`/api/v1/community/threads/${id}/posts`).send({ bodyMd: 'Pensez aussi à `journalctl --vacuum-size` pour le journal systemd.' })).expect(201);

    // Visiteur et apprenant qui n'a pas résolu : rien de la démarche, ni dans le sujet, ni dans la liste.
    for (const viewer of [http().get(`/api/v1/community/threads/${id}`), notSolved.as(http().get(`/api/v1/community/threads/${id}`))]) {
      const locked = (await viewer.expect(200)).body;
      expect(locked).toMatchObject({ spoilerLocked: true, bodyMd: '', posts: [], lab: { slug: LAB }, can: { reply: false } });
      expect(JSON.stringify(locked)).not.toContain('du -sh');
    }
    const list = (await http().get('/api/v1/community/threads?kind=lab_share').expect(200)).body;
    expect(JSON.stringify(list.items.find((i: { id: string }) => i.id === id))).not.toContain('du -sh');
    await notSolved.as(http().post(`/api/v1/community/threads/${id}/posts`).send({ bodyMd: 'Je réponds sans avoir résolu le lab, ce qui est refusé.' })).expect(403);

    const open = (await solver.as(http().get(`/api/v1/community/threads/${id}`)).expect(200)).body;
    expect(open).toMatchObject({ spoilerLocked: false, posts: [expect.objectContaining({ mine: true })] });
    expect(open.bodyMd).toContain('du -sh');
  });
});
