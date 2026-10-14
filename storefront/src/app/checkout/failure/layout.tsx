import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'No se pudo completar el pago' };

export default function CheckoutResultLayout({ children }: { children: ReactNode }) {
  return children;
}
