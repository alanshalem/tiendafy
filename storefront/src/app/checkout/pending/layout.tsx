import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Pago pendiente' };

export default function CheckoutResultLayout({ children }: { children: ReactNode }) {
  return children;
}
