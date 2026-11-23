import { TokenClaims } from '../domain/identity';
import { UserRepository } from './ports';
import { UserProvisioner } from './user-provisioner';

const claims: TokenClaims = {
  subject: 'kc-1', email: 'a@x.fr', emailVerified: true, displayName: 'A', locale: 'fr', roles: ['learner'],
};

function repo() {
  const r = {
    calls: 0,
    provision: async (c: TokenClaims) => {
      r.calls++;
      return { id: 'u1', subject: c.subject, email: c.email, displayName: c.displayName, roles: c.roles };
    },
  };
  return r;
}

describe('UserProvisioner', () => {
  it('met en cache pendant 60 s', async () => {
    const r = repo();
    const p = new UserProvisioner(r as unknown as UserRepository);
    await p.fromClaims(claims, 0);
    await p.fromClaims(claims, 30_000);
    expect(r.calls).toBe(1);
    await p.fromClaims(claims, 61_000);
    expect(r.calls).toBe(2);
  });

  it('resynchronise immédiatement si les rôles changent', async () => {
    const r = repo();
    const p = new UserProvisioner(r as unknown as UserRepository);
    await p.fromClaims(claims, 0);
    const u = await p.fromClaims({ ...claims, roles: ['learner', 'admin'] }, 1);
    expect(r.calls).toBe(2);
    expect(u.roles).toEqual(['learner', 'admin']);
  });
});
