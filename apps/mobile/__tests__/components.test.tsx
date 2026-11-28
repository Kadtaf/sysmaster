import type { CommandDetail } from '@sysmaster/contracts';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CommandView } from '../src/components/command-view';
import { Markdown } from '../src/components/markdown';

const command = (over: Partial<CommandDetail> = {}): CommandDetail => ({
  slug: 'rm', name: 'rm', platform: 'linux', summary: 'Supprime des fichiers.', difficulty: 'beginner', riskLevel: 'critical',
  shell: 'bash', history: null, internals: null, syntax: 'rm [options] fichier', why: 'Libérer de la place.', whenToUse: 'Fichier inutile.',
  context: null, bestPractices: ['Lister avant de supprimer.'], commonErrors: [], risks: [{ level: 'critical', text: 'Suppression définitive.' }],
  requiresAdmin: false, maskedUntilRisksRead: true, copyAllowed: false, parameters: [],
  examples: [{ title: 'Supprimer un dossier', code: 'rm -r ./tmp', explanation: 'Récursif.', isRealCase: true }], alternatives: [], sources: [],
  ...over,
});

describe('CommandView (règle P-2)', () => {
  it('masque la syntaxe d’une commande dangereuse jusqu’à la lecture des risques', async () => {
    await render(<CommandView command={command()} />);
    expect(screen.getByText('Suppression définitive.')).toBeOnTheScreen();
    expect(screen.queryByText('rm [options] fichier')).toBeNull();
    expect(screen.queryByText('rm -r ./tmp')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'J’ai lu les risques, afficher la commande' }));
    expect(screen.getByText('rm [options] fichier')).toBeOnTheScreen();
    expect(screen.getByText('rm -r ./tmp')).toBeOnTheScreen();
  });

  it('affiche directement une commande sans danger, avec le risque écrit en toutes lettres', async () => {
    await render(<CommandView command={command({ maskedUntilRisksRead: false, riskLevel: 'none', risks: [] })} />);
    expect(screen.getByText('rm [options] fichier')).toBeOnTheScreen();
    expect(screen.getByText('Aucun risque')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'rm' })).toBeOnTheScreen();
  });
});

describe('Markdown', () => {
  it('rend les titres comme en-têtes pour les lecteurs d’écran et les tableaux en fiches', async () => {
    await render(<Markdown source={'## Pourquoi\n\n| Dossier | Contient |\n|---|---|\n| `/etc` | la configuration |'} />);
    expect(screen.getByRole('header', { name: 'Pourquoi' })).toBeOnTheScreen();
    expect(screen.getByText('Contient : la configuration')).toBeOnTheScreen();
  });
});
