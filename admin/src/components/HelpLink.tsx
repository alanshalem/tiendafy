import { HelpCircle } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { HELP_LINKS, SHOW_HELP_LINKS, type HelpLinkId } from '../config/features';

/** Enlace al manual interno ("Más sobre…"). Abre /ayuda/:topic en una pestaña nueva. */
export function HelpLink({ id, className }: { id: HelpLinkId; className?: string }) {
  if (!SHOW_HELP_LINKS) return null;
  const link = HELP_LINKS[id];
  if (!link) return null;
  return (
    <a
      href={`/ayuda/${id}`}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'mt-6 inline-flex w-full items-center justify-center gap-1.5 text-center text-sm font-medium text-primary hover:underline',
        className,
      )}
    >
      <HelpCircle className="h-3.5 w-3.5" /> {link.label}
    </a>
  );
}
