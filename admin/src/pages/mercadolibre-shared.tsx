import { formatDate } from '../lib/format';

// ---- Helpers compartidos por las tabs de Mercado Libre -----------------------

export const money = (n: number, currency: string) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

export const fecha = (iso: string | null) => (iso ? formatDate(iso) : '—');
