import { defaultRule, RateLimiter } from './rate-limit';
import { docsEnabled, trustProxy } from '../../bootstrap';

describe('RateLimiter', () => {
  const rule = { limit: 3, windowS: 60 };

  it('refuse au-delà de la limite, puis rouvre à la fenêtre suivante', () => {
    const l = new RateLimiter();
    const t0 = 1_000_000;
    expect([1, 2, 3].map(() => l.hit('k', rule, t0).allowed)).toEqual([true, true, true]);
    const refused = l.hit('k', rule, t0 + 10_000);
    expect(refused).toEqual({ allowed: false, remaining: 0, retryAfterS: 50 });
    expect(l.hit('k', rule, t0 + 60_000).allowed).toBe(true);
  });

  it('compte chaque clé à part', () => {
    const l = new RateLimiter();
    for (let i = 0; i < 3; i++) l.hit('a', rule, 0);
    expect(l.hit('a', rule, 0).allowed).toBe(false);
    expect(l.hit('b', rule, 0).allowed).toBe(true);
  });

  it('oublie les vieilles fenêtres et ne grossit pas sans fin', () => {
    const l = new RateLimiter(5);
    for (let i = 0; i < 5; i++) l.hit(`k${i}`, rule, 0);
    l.hit('nouvelle', rule, 1);
    expect(l.size).toBe(1);
    l.hit('x', rule, 2 * 3_600_000);
    expect(l.size).toBe(1);
  });
});

describe('réglages de sécurité', () => {
  it('limite générale : 600 par défaut, 0 la désactive', () => {
    expect(defaultRule({})).toEqual({ bucket: 'all', limit: 600, windowS: 60 });
    expect(defaultRule({ RATE_LIMIT_PER_MINUTE: '0' })).toBeNull();
  });

  it('X-Forwarded-For ignoré tant qu’aucun proxy n’est déclaré', () => {
    expect(trustProxy(undefined)).toBe(false);
    expect(trustProxy('')).toBe(false);
    expect(trustProxy('1')).toBe(1);
    expect(trustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
  });

  it('documentation OpenAPI fermée en production sauf demande explicite', () => {
    expect(docsEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(docsEnabled({ NODE_ENV: 'production', API_DOCS: 'true' })).toBe(true);
    expect(docsEnabled({ NODE_ENV: 'test' })).toBe(true);
    expect(docsEnabled({ API_DOCS: 'false' })).toBe(false);
  });
});
