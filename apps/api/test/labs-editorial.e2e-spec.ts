import { INestApplication } from '@nestjs/common';
import type { LabContent } from '@sysmaster/contracts';
import { Pool } from 'pg';
import request from 'supertest';
import { createTestApp, newIdentity } from './helpers/test-app';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Back-office : labs simulés (e2e)', () => {
  let app: INestApplication;
  let tokenFor: Awaited<ReturnType<typeof createTestApp>>['tokenFor'];
  let pool: Pool;
  const http = () => request(app.getHttpServer());
  const slug = `lab-test-${Date.now().toString(36)}`;

  const as = async (roles: string[]) => {
    const token = await tokenFor(newIdentity(), roles);
    return (r: request.Test) => r.auth(token, { type: 'bearer' });
  };

  beforeAll(async () => {
    ({ app, tokenFor } = await createTestApp());
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM labs.instances WHERE template_id IN (SELECT id FROM labs.lab_templates WHERE slug = $1)`, [slug]);
    await pool.query(`DELETE FROM labs.lab_templates WHERE slug = $1`, [slug]);
    await pool?.end();
    await app?.close();
  });

  it('un lab n’est publiable que si sa démarche de référence répare la machine ; publié, il est jouable', async () => {
    const author = await as(['author']);
    const reviewer = await as(['reviewer']);

    // Partir d'un lab publié : la révision reprend la machine, les validateurs et la démarche.
    const from = await author(http().post('/api/v1/editorial/revisions').send({ kind: 'lab', from: 'linux-port-80-occupe' })).expect(201);
    const existing = (await author(http().get(`/api/v1/editorial/revisions/${from.body.id}`)).expect(200)).body;
    expect(existing.content.walkthrough).toHaveLength(5);
    expect(existing.issues).toEqual([]);
    await author(http().post(`/api/v1/editorial/revisions/${from.body.id}/withdraw`)).expect(200);

    // Nouveau lab : même panne, mais la démarche oublie de désactiver apache2.
    const content: LabContent = { ...existing.content, slug, title: 'Lab de test : port pris', walkthrough: ['systemctl stop apache2', 'systemctl start nginx'] };
    const draft = await author(http().post('/api/v1/editorial/revisions').send({ kind: 'lab' })).expect(201);
    const blank = (await author(http().get(`/api/v1/editorial/revisions/${draft.body.id}`)).expect(200)).body;
    expect(blank.content.machine.mounts).toHaveLength(1);

    await author(http().put(`/api/v1/editorial/revisions/${draft.body.id}`).send(content)).expect(200);
    const refused = await author(http().post(`/api/v1/editorial/revisions/${draft.body.id}/submit`)).expect(422);
    expect(refused.body.issues).toContainEqual(
      expect.objectContaining({ field: 'walkthrough', message: expect.stringContaining('apache2 ne redémarrera pas') }),
    );

    // Une machine sans panne est refusée aussi.
    const svc = content.machine.services;
    const healthy = {
      ...content,
      machine: { ...content.machine, services: { ...svc, apache2: { ...svc.apache2, active: 'inactive', enabled: false, pid: undefined }, nginx: { ...svc.nginx, active: 'active', pid: 700 } } },
    };
    await author(http().put(`/api/v1/editorial/revisions/${draft.body.id}`).send(healthy)).expect(200);
    const noFault = (await author(http().get(`/api/v1/editorial/revisions/${draft.body.id}`)).expect(200)).body;
    expect(noFault.issues.map((i: { message: string }) => i.message).join(' ')).toContain('il n’y a pas de panne');

    await author(http().put(`/api/v1/editorial/revisions/${draft.body.id}`).send({ ...content, walkthrough: [...content.walkthrough, 'systemctl disable apache2'] })).expect(200);
    await author(http().post(`/api/v1/editorial/revisions/${draft.body.id}/submit`)).expect(200);
    const approved = await reviewer(http().post(`/api/v1/editorial/revisions/${draft.body.id}/review`).send({ decision: 'approve' })).expect(200);
    expect(approved.body.status).toBe('published');

    const detail = (await http().get(`/api/v1/labs/${slug}`).expect(200)).body;
    expect(detail).toMatchObject({ title: 'Lab de test : port pris', runtime: 'simulation', hintCount: content.hints.length });
    const learner = await as([]);
    const session = (await learner(http().post(`/api/v1/labs/${slug}/instances`)).expect(200)).body;
    expect(session.status).toBe('running');

    // Modifier le lab publié : la révision repart du contenu en ligne.
    const edit = await author(http().post('/api/v1/editorial/revisions').send({ kind: 'lab', from: slug })).expect(201);
    expect(edit.body).toMatchObject({ kind: 'lab', isNew: false, key: slug });
    const current = (await author(http().get(`/api/v1/editorial/revisions/${edit.body.id}`)).expect(200)).body.content;
    await author(http().put(`/api/v1/editorial/revisions/${edit.body.id}`).send({ ...current, title: 'Lab de test : titre revu' })).expect(200);
    await author(http().post(`/api/v1/editorial/revisions/${edit.body.id}/submit`)).expect(200);
    await reviewer(http().post(`/api/v1/editorial/revisions/${edit.body.id}/review`).send({ decision: 'approve' })).expect(200);
    expect((await http().get(`/api/v1/labs/${slug}`).expect(200)).body.title).toBe('Lab de test : titre revu');
  });
});
