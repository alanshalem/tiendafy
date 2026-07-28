import type { ReactNode } from 'react';
import { Button } from '@tiendafy/ui';

interface EmptyStateProps {
  /** Eyebrow en mayúsculas: "VENTAS", "CARRITOS ABANDONADOS". */
  kicker: string;
  title: string;
  body: string;
  /** CTA principal. Sin action = sección "próximamente". */
  action?: { label: string; onClick: () => void };
  /** Ilustración custom; default: sello de paquete. */
  illustration?: ReactNode;
}

/** Ilustración default: paquete con sello bermellón, trazo de tinta. */
function PackageIllustration() {
  return (
    <svg viewBox="0 0 160 120" className="h-36 w-48" fill="none" aria-hidden="true">
      <rect
        x="35"
        y="40"
        width="70"
        height="55"
        rx="4"
        fill="rgb(var(--color-bg-muted))"
        stroke="rgb(var(--color-fg))"
        strokeWidth="2.5"
      />
      <path d="M35 58h70" stroke="rgb(var(--color-fg))" strokeWidth="2.5" />
      <path d="M62 40v18M78 40v18" stroke="rgb(var(--color-fg))" strokeWidth="2.5" />
      <rect
        x="92"
        y="28"
        width="34"
        height="34"
        rx="6"
        fill="rgb(var(--color-primary))"
        stroke="rgb(var(--color-fg))"
        strokeWidth="2.5"
        transform="rotate(8 109 45)"
      />
      <text
        x="109"
        y="55"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontStyle="italic"
        fontWeight="700"
        fontSize="24"
        fill="rgb(var(--color-primary-fg))"
        transform="rotate(8 109 45)"
      >
        t
      </text>
      <path
        d="M30 100c18 6 82 6 100 0"
        stroke="rgb(var(--color-fg-subtle))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1 7"
      />
    </svg>
  );
}

export function EmptyState({ kicker, title, body, action, illustration }: EmptyStateProps) {
  return (
    <div className="mx-auto grid max-w-3xl items-center gap-10 py-16 md:grid-cols-[auto_1fr]">
      <div className="justify-self-center">{illustration ?? <PackageIllustration />}</div>
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-primary">{kicker}</div>
        <h1 className="mt-2 text-2xl font-bold text-fg">{title}</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-fg-muted">{body}</p>
        {action ? (
          <Button className="mt-6" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-bg-muted px-3 py-1 text-xs font-semibold text-fg-muted">
            En construcción — llega con el roadmap del checklist
          </div>
        )}
      </div>
    </div>
  );
}
