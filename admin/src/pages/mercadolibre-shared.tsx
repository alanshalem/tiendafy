import { Loader2 } from 'lucide-react';

// ---- Helpers compartidos por las tabs de Mercado Libre -----------------------

export const money = (n: number, currency: string) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

export const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '—');

export function Cargando() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-fg-subtle" />
    </div>
  );
}

export function Vacio({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface/50 p-10 text-center text-sm text-fg-muted">
      {texto}
    </div>
  );
}
