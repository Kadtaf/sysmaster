import { copyAllowed, maskedUntilRisksRead } from './risk-policy';

describe('Règle P-2 : comprendre avant d\'exécuter', () => {
  it.each([
    ['none', false, true],
    ['low', false, true],
    ['medium', false, true],
    ['high', true, true],
    ['critical', true, false],
  ] as const)('risque %s → masquée=%s, copie=%s', (level, masked, copy) => {
    expect(maskedUntilRisksRead(level)).toBe(masked);
    expect(copyAllowed(level)).toBe(copy);
  });
});
