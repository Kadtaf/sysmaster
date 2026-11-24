/**
 * Lecteur d'un sous-ensemble de YAML suffisant pour un fichier compose : des tables
 * (« clé: valeur ») et des listes (« - élément ») imbriquées par indentation, des scalaires
 * entre guillemets ou non, des commentaires. Pas d'ancres, de blocs multilignes ni de flux
 * ({…}, […]) : un fichier qui en contient est refusé avec la ligne en cause, comme le ferait
 * docker compose devant un YAML invalide.
 */

export type Yaml = string | Yaml[] | { [key: string]: Yaml };

export class YamlError extends Error {
  constructor(readonly line: number, message: string) {
    super(`yaml: line ${line}: ${message}`);
  }
}

interface Line {
  no: number;
  indent: number;
  text: string;
}

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

function stripComment(s: string): string {
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) {
      return s.slice(0, i);
    }
  }
  return s;
}

export function parseYaml(source: string): Yaml {
  const lines: Line[] = [];
  source.split('\n').forEach((raw, i) => {
    if (/\t/.test(raw.match(/^\s*/)![0])) throw new YamlError(i + 1, 'found character that cannot start any token (tabulation)');
    const text = stripComment(raw).replace(/\s+$/, '');
    if (!text.trim()) return;
    lines.push({ no: i + 1, indent: text.length - text.trimStart().length, text: text.trim() });
  });
  if (!lines.length) return {};
  let pos = 0;

  function block(indent: number): Yaml {
    const first = lines[pos];
    if (first.text.startsWith('- ') || first.text === '-') return list(indent);
    return map(indent);
  }

  function list(indent: number): Yaml[] {
    const out: Yaml[] = [];
    while (pos < lines.length && lines[pos].indent === indent && (lines[pos].text.startsWith('- ') || lines[pos].text === '-')) {
      const l = lines[pos];
      const rest = l.text.slice(1).trim();
      pos++;
      if (!rest) {
        if (pos < lines.length && lines[pos].indent > indent) out.push(block(lines[pos].indent));
        else out.push('');
      } else if (/^[^"'][^:]*:(\s|$)/.test(rest) && !/^[^:]+:\/\//.test(rest)) {
        throw new YamlError(l.no, 'les tables dans une liste ne sont pas prises en charge ici');
      } else {
        out.push(scalar(rest, l.no));
      }
    }
    if (pos < lines.length && lines[pos].indent > indent) throw new YamlError(lines[pos].no, 'bad indentation of a sequence entry');
    return out;
  }

  function map(indent: number): { [key: string]: Yaml } {
    const out: { [key: string]: Yaml } = {};
    while (pos < lines.length && lines[pos].indent === indent) {
      const l = lines[pos];
      if (l.text.startsWith('- ')) throw new YamlError(l.no, 'did not find expected key');
      const m = /^("[^"]*"|'[^']*'|[^:]+):(?:\s+(.*))?$/.exec(l.text);
      if (!m) throw new YamlError(l.no, 'could not find expected \':\'');
      const key = unquote(m[1]);
      if (key in out) throw new YamlError(l.no, `mapping key "${key}" already defined`);
      pos++;
      if (m[2] !== undefined && m[2] !== '') {
        out[key] = scalar(m[2], l.no);
      } else if (pos < lines.length && lines[pos].indent > indent) {
        out[key] = block(lines[pos].indent);
      } else if (pos < lines.length && lines[pos].indent === indent && lines[pos].text.startsWith('- ')) {
        out[key] = list(indent); // liste au même niveau que la clé (style courant)
      } else {
        out[key] = '';
      }
    }
    if (pos < lines.length && lines[pos].indent > indent) throw new YamlError(lines[pos].no, 'mapping values are not allowed in this context');
    return out;
  }

  function scalar(s: string, no: number): string {
    const t = s.trim();
    if (/^[[{&*|>]/.test(t)) throw new YamlError(no, 'syntaxe YAML non prise en charge ici (flux, ancre ou bloc)');
    if ((t.startsWith('"') && !t.endsWith('"')) || (t.startsWith("'") && !t.endsWith("'"))) throw new YamlError(no, 'found unexpected end of stream');
    return unquote(t);
  }

  const root = block(lines[0].indent);
  if (pos < lines.length) throw new YamlError(lines[pos].no, 'bad indentation');
  return root;
}

export interface ComposeService {
  image: string;
  restart: string;
  ports: { host: number; container: number }[];
  env: Record<string, string>;
}

/** Interprète un fichier compose : services, image, ports « hôte:conteneur », environnement (liste ou table). */
export function parseCompose(source: string): { services: Record<string, ComposeService> } {
  const doc = parseYaml(source);
  if (typeof doc !== 'object' || Array.isArray(doc) || typeof doc.services !== 'object' || Array.isArray(doc.services)) {
    throw new YamlError(1, 'services must be a mapping');
  }
  const services: Record<string, ComposeService> = {};
  for (const [name, raw] of Object.entries(doc.services)) {
    if (typeof raw !== 'object' || Array.isArray(raw)) throw new YamlError(1, `service "${name}" must be a mapping`);
    if (typeof raw.image !== 'string' || !raw.image) throw new YamlError(1, `service "${name}" has neither an image nor a build context specified`);
    const ports = (Array.isArray(raw.ports) ? raw.ports : []).map((p) => {
      const m = typeof p === 'string' ? /^(?:[\d.]+:)?(\d+):(\d+)(?:\/tcp)?$/.exec(p) : null;
      if (!m) throw new YamlError(1, `service "${name}": invalid port "${String(p)}"`);
      return { host: Number(m[1]), container: Number(m[2]) };
    });
    const env: Record<string, string> = {};
    if (Array.isArray(raw.environment)) {
      for (const e of raw.environment) {
        if (typeof e !== 'string') continue;
        const i = e.indexOf('=');
        if (i > 0) env[e.slice(0, i)] = e.slice(i + 1);
      }
    } else if (raw.environment && typeof raw.environment === 'object') {
      for (const [k, v] of Object.entries(raw.environment)) env[k] = typeof v === 'string' ? v : '';
    }
    services[name] = { image: raw.image, restart: typeof raw.restart === 'string' ? raw.restart : 'no', ports, env };
  }
  return { services };
}
