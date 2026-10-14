import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NOT_INDEXED } from '@/lib/seo';

// El checkout y las pantallas de resultado del pago: de una persona, no para Google.
export const metadata: Metadata = { title: 'Finalizar compra', robots: NOT_INDEXED };

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return children;
}
