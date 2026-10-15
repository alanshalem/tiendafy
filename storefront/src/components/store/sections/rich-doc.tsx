import { Fragment, type ReactNode } from 'react';
import type { RichBlock, RichDoc, RichInline } from '@tiendafy/types';
import { StoreLink } from '../StoreLink';

/*
 * El texto con formato de una sección, dibujado con elementos de React a
 * partir del árbol guardado (ver rich-text.ts en @tiendafy/types). Nunca
 * `dangerouslySetInnerHTML`: lo que no está en esta lista no se dibuja, y los
 * links pasan por StoreLink (safeHref), así un "javascript:" no llega a un href.
 */

function Inline({ nodes }: { nodes: RichInline[] | undefined }) {
  return (
    <>
      {(nodes ?? []).map((n, i) => {
        if (n.type === 'hardBreak') return <br key={i} />;
        let out: ReactNode = n.text;
        const marks = n.marks ?? [];
        if (marks.some((m) => m.type === 'italic')) out = <em>{out}</em>;
        if (marks.some((m) => m.type === 'bold')) out = <strong className="font-semibold">{out}</strong>;
        const link = marks.find((m) => m.type === 'link');
        if (link?.type === 'link')
          out = (
            <StoreLink
              href={link.attrs.href}
              className="font-medium underline underline-offset-2 hover:opacity-80"
            >
              {out}
            </StoreLink>
          );
        return <Fragment key={i}>{out}</Fragment>;
      })}
    </>
  );
}

function Blocks({ blocks }: { blocks: RichBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'paragraph':
            // Un párrafo vacío es un renglón en blanco que dejó el comercio.
            return (
              <p key={i} className="min-h-[1lh]">
                <Inline nodes={b.content} />
              </p>
            );
          case 'heading': {
            // La sección tiene su h2: los títulos de adentro van de h3 para abajo.
            const Tag = b.attrs.level <= 3 ? 'h3' : 'h4';
            return (
              <Tag
                key={i}
                className={Tag === 'h3' ? 'pt-2 text-xl font-bold' : 'pt-1 text-lg font-semibold'}
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                <Inline nodes={b.content} />
              </Tag>
            );
          }
          case 'bulletList':
          case 'orderedList': {
            const List = b.type === 'bulletList' ? 'ul' : 'ol';
            return (
              <List
                key={i}
                className={`space-y-1 pl-6 text-left ${b.type === 'bulletList' ? 'list-disc' : 'list-decimal'}`}
              >
                {b.content.map((li, j) => (
                  <li key={j} className="[&>p]:min-h-0">
                    <Blocks blocks={li.content} />
                  </li>
                ))}
              </List>
            );
          }
          case 'blockquote':
            return (
              <blockquote key={i} className="space-y-3 border-l-4 border-primary/60 pl-4 text-left italic">
                <Blocks blocks={b.content} />
              </blockquote>
            );
        }
      })}
    </>
  );
}

export function RichDocView({ doc, className }: { doc: RichDoc; className?: string }) {
  if (doc.content.length === 0) return null;
  return (
    <div className={`space-y-3 leading-relaxed ${className ?? ''}`}>
      <Blocks blocks={doc.content} />
    </div>
  );
}
