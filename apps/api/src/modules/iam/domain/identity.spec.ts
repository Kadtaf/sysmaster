import { hasAnyRole, knownRoles } from './identity';

describe('identité', () => {
  it('ignore les rôles inconnus ou mal formés', () => {
    expect(knownRoles(['learner', 'offline_access', 'admin', 42])).toEqual(['learner', 'admin']);
    expect(knownRoles(undefined)).toEqual([]);
  });

  it('vérifie les rôles requis, super_admin ayant tous les droits', () => {
    expect(hasAnyRole({ roles: ['learner'] }, ['admin'])).toBe(false);
    expect(hasAnyRole({ roles: ['admin'] }, ['admin', 'moderator'])).toBe(true);
    expect(hasAnyRole({ roles: ['super_admin'] }, ['moderator'])).toBe(true);
    expect(hasAnyRole({ roles: [] }, [])).toBe(true);
  });
});
