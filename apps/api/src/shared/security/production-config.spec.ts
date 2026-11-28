import { productionConfigProblems } from './production-config';

describe('configuration de production', () => {
  const ok = { NODE_ENV: 'production', AI_SERVICE_TOKEN: 'x'.repeat(64), CORS_ORIGINS: 'https://sysmaster.example', OIDC_ISSUER: 'https://id.example/realms/sysmaster' };

  it('rien à redire hors production', () => {
    expect(productionConfigProblems({ NODE_ENV: 'development' })).toEqual([]);
  });

  it('accepte une configuration complète', () => {
    expect(productionConfigProblems(ok)).toEqual([]);
  });

  it.each([
    [{ AI_SERVICE_TOKEN: 'dev-only-ai-token' }, 'AI_SERVICE_TOKEN'],
    [{ AI_SERVICE_TOKEN: 'court' }, 'AI_SERVICE_TOKEN'],
    [{ CORS_ORIGINS: '*' }, 'CORS_ORIGINS'],
    [{ OIDC_ISSUER: '' }, 'OIDC_ISSUER'],
    [{ STRIPE_SECRET_KEY: 'sk_live_x' }, 'STRIPE_WEBHOOK_SECRET'],
    [{ SMTP_URL: 'smtps://u:p@smtp.example:465' }, 'MAIL_LINK_SECRET'],
    [{ SMTP_URL: 'smtps://u:p@smtp.example:465', MAIL_FROM: 'SysMaster <no-reply@example.test>', MAIL_LINK_SECRET: 'court' }, 'MAIL_LINK_SECRET'],
  ])('refuse %p', (override, variable) => {
    const problems = productionConfigProblems({ ...ok, ...override });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(variable);
  });
});
