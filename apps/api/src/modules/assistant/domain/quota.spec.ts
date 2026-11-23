import { conversationTitle, dailyQuota } from './quota';

describe('Assistant : règles', () => {
  it('quota selon le rôle', () => {
    expect(dailyQuota(['learner'], 30)).toBe(30);
    expect(dailyQuota(['learner', 'author'], 30)).toBe(90);
    expect(dailyQuota(['admin'], 30)).toBe(300);
  });

  it('titre de conversation court et sans couper un mot', () => {
    expect(conversationTitle('  Mon   disque est plein ')).toBe('Mon disque est plein');
    const long = conversationTitle('Pourquoi mon serveur Ubuntu refuse-t-il les connexions SSH depuis la mise à jour du noyau de ce matin ?');
    expect(long.length).toBeLessThanOrEqual(81);
    expect(long.endsWith('…')).toBe(true);
    expect(long).not.toMatch(/\s…$/);
  });
});
