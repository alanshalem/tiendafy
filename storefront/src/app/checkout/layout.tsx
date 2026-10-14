import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NOT_INDEXED, sectionTitle } from '@/lib/seo';

// El checkout y las pantallas de resultado del pago: de una persona, no para Google.
export async function generateMetadata(): Promise<Metadata> {
  return { title: await sectionTitle('Finalizar compra'), robots: NOT_INDEXED };
}

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return children;
}
