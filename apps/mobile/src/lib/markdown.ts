/**
 * Analyse du Markdown des leçons, réduite à ce que le contenu SysMaster utilise : titres, paragraphes,
 * listes, citations, blocs de code, tableaux et, dans le texte, code, gras, italique et liens.
 * Pas de HTML brut : il n'est jamais interprété, il reste du texte (aucune injection possible).
 */
export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'heading'; level: number; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { type: 'quote'; children: Inline[] }
  | { type: 'code'; lang: string | null; text: string }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { type: 'rule' };

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.trim()) { i++; continue; }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1] ?? '```';
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith(marker)) body.push(lines[i++] ?? '');
      i++; // ligne de fermeture (ou fin du texte)
      blocks.push({ type: 'code', lang: fence[2] || null, text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: (heading[1] ?? '#').length, children: parseInline(heading[2] ?? '') });
      i++;
      continue;
    }

    if (RULE.test(line)) { blocks.push({ type: 'rule' }); i++; continue; }

    if (line.includes('|') && TABLE_SEP.test(lines[i + 1] ?? '')) {
      const header = splitRow(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? '').includes('|') && (lines[i] ?? '').trim()) {
        rows.push(splitRow(lines[i] ?? '').map(parseInline));
        i++;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = !BULLET.test(line);
      const start = ordered ? Number(ORDERED.exec(line)?.[1] ?? 1) : 1;
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i] ?? '';
        const m = ordered ? ORDERED.exec(current) : BULLET.exec(current);
        if (m) { items.push((ordered ? m[2] : m[1]) ?? ''); i++; continue; }
        // Ligne de continuation indentée : elle prolonge l'élément précédent.
        if (current.trim() && /^\s{2,}/.test(current) && items.length) {
          items[items.length - 1] += ` ${current.trim()}`;
          i++;
          continue;
        }
        break;
      }
      blocks.push({ type: 'list', ordered, start, items: items.map(parseInline) });
      continue;
    }

    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i] ?? '')) body.push((lines[i++] ?? '').replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', children: parseInline(body.join(' ')) });
      continue;
    }

    const body: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? '';
      if (!current.trim() || FENCE.test(current) || HEADING.test(current) || BULLET.test(current)
        || ORDERED.test(current) || /^\s*>/.test(current) || RULE.test(current)
        || (current.includes('|') && TABLE_SEP.test(lines[i + 1] ?? ''))) break;
      body.push(current.trim());
      i++;
    }
    blocks.push({ type: 'paragraph', children: parseInline(body.join(' ')) });
  }
  return blocks;
}

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  let inCode = false;
  for (let k = 0; k < row.length; k++) {
    const ch = row[k];
    if (ch === '\\' && row[k + 1] === '|') { cell += '|'; k++; continue; }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) { cells.push(cell.trim()); cell = ''; continue; }
    cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

/** Seuls les liens web et internes sont gardés : un lien javascript: ou file: devient du texte. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^https?:\/\//i.test(h) || h.startsWith('/')) return h;
  return null;
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => { if (text) { out.push({ type: 'text', text }); text = ''; } };
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\' && i + 1 < source.length && /[\\`*_[\]()#|>-]/.test(source[i + 1] ?? '')) {
      text += source[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      const end = source.indexOf('`', i + 1);
      if (end > i) { flush(); out.push({ type: 'code', text: source.slice(i + 1, end) }); i = end + 1; continue; }
    }
    if ((ch === '*' || ch === '_') && source[i + 1] === ch) {
      const end = source.indexOf(ch + ch, i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: 'strong', children: parseInline(source.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (ch === '*' || (ch === '_' && !/\w/.test(source[i - 1] ?? ''))) {
      const end = source.indexOf(ch, i + 1);
      if (end > i + 1 && source[i + 1] !== ' ' && (ch === '*' || !/\w/.test(source[end + 1] ?? ''))) {
        flush();
        out.push({ type: 'em', children: parseInline(source.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '[') {
      const close = source.indexOf(']', i + 1);
      if (close > i && source[close + 1] === '(') {
        const end = source.indexOf(')', close + 2);
        if (end > close) {
          const label = parseInline(source.slice(i + 1, close));
          const href = safeHref(source.slice(close + 2, end));
          flush();
          if (href) out.push({ type: 'link', href, children: label });
          else out.push(...label);
          i = end + 1;
          continue;
        }
      }
    }
    text += ch;
    i++;
  }
  flush();
  return out;
}

/** Texte brut d'une suite d'éléments, pour les libellés d'accessibilité. */
export function plainText(nodes: Inline[]): string {
  return nodes.map((n) => (n.type === 'text' || n.type === 'code' ? n.text : plainText(n.children))).join('');
}
