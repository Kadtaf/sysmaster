import { type Block, parseInline, parseMarkdown, plainText, safeHref } from '../src/lib/markdown';

describe('parseMarkdown', () => {
  it('reconnaît titres, paragraphes, listes, citations et règles', () => {
    const blocks = parseMarkdown('## Pourquoi\n\nUn paragraphe\nsur deux lignes.\n\n- un\n- deux\n\n3. trois\n4. quatre\n\n> Attention\n\n---');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'quote', 'rule']);
    expect(blocks[0]).toMatchObject({ level: 2 });
    expect(plainText((blocks[1] as Extract<Block, { type: 'paragraph' }>).children)).toBe('Un paragraphe sur deux lignes.');
    expect(blocks[3]).toMatchObject({ ordered: true, start: 3 });
  });

  it('garde le code tel quel, y compris les caractères Markdown', () => {
    const [code] = parseMarkdown('```bash\nls -la **/*.log\n# commentaire\n```');
    expect(code).toEqual({ type: 'code', lang: 'bash', text: 'ls -la **/*.log\n# commentaire' });
  });

  it('lit les tableaux, avec du code et des barres échappées dans les cellules', () => {
    const [table] = parseMarkdown('| Dossier | Contient |\n|---|---|\n| `/etc` | la **configuration** |\n| `a|b` | x \\| y |');
    expect(table?.type).toBe('table');
    if (table?.type !== 'table') return;
    expect(table.header.map(plainText)).toEqual(['Dossier', 'Contient']);
    expect(table.rows.map((r) => r.map(plainText))).toEqual([['/etc', 'la configuration'], ['a|b', 'x | y']]);
  });
});

describe('parseInline', () => {
  it('code, gras, italique et liens', () => {
    expect(parseInline('Tapez `ls` puis **Entrée**, *vite* [doc](https://example.org)')).toEqual([
      { type: 'text', text: 'Tapez ' },
      { type: 'code', text: 'ls' },
      { type: 'text', text: ' puis ' },
      { type: 'strong', children: [{ type: 'text', text: 'Entrée' }] },
      { type: 'text', text: ', ' },
      { type: 'em', children: [{ type: 'text', text: 'vite' }] },
      { type: 'text', text: ' ' },
      { type: 'link', href: 'https://example.org', children: [{ type: 'text', text: 'doc' }] },
    ]);
  });

  it('ne prend pas les tirets bas des noms de fichiers pour de l’italique', () => {
    expect(plainText(parseInline('sshd_config et /var/log_old'))).toBe('sshd_config et /var/log_old');
    expect(parseInline('sshd_config_x')).toEqual([{ type: 'text', text: 'sshd_config_x' }]);
  });

  it('un lien javascript: ou file: devient du texte simple', () => {
    expect(parseInline('[piège](javascript:alert(1))')).toEqual([{ type: 'text', text: 'piège' }, { type: 'text', text: ')' }]);
    expect(safeHref('file:///etc/passwd')).toBeNull();
    expect(safeHref('/commandes/ls')).toBe('/commandes/ls');
  });

  it('le HTML reste du texte', () => {
    expect(parseInline('<script>x</script>')).toEqual([{ type: 'text', text: '<script>x</script>' }]);
  });
});
