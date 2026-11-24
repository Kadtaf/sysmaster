import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Rendu du contenu pédagogique. Le HTML brut est ignoré (pas de rehype-raw) : un contenu
 * mal relu ne peut pas injecter de script. Les liens internes passent par le routeur Next.js.
 * `ugc` : contenu écrit par les membres (liens nofollow, images distantes non chargées).
 */
export function Markdown({ children, ugc = false }: { children: string; ugc?: boolean }) {
  return (
    <div className="prose prose-slate max-w-none dark:prose-invert prose-pre:bg-slate-950 prose-pre:text-slate-100 prose-code:before:content-none prose-code:after:content-none prose-table:text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href = '', children }) =>
            href.startsWith('/') ? (
              <Link href={href}>{children}</Link>
            ) : (
              <a href={href} target="_blank" rel={ugc ? 'nofollow ugc noopener noreferrer' : 'noopener noreferrer'}>{children}</a>
            ),
          // Contenu des membres : pas d'image distante (pistage, contenu choquant) ; on garde un lien.
          ...(ugc ? { img: ({ src, alt }: { src?: unknown; alt?: string }) => <span>[image : {alt || String(src ?? '')}]</span> } : {}),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
