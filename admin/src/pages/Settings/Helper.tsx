import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@tiendafy/ui';

/** Bloque colapsable de ayuda contextual (antes copiado en MP, WhatsApp y Facturación). */
export function Helper({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-border bg-bg-muted/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-fg"
      >
        {title}
        <ChevronDown className={cn('h-4 w-4 text-fg-muted transition', open && 'rotate-180')} />
      </button>
      {open && <div className="px-3 pb-3 text-sm leading-relaxed text-fg-muted">{children}</div>}
    </div>
  );
}
