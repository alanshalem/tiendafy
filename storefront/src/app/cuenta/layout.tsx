import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NOT_INDEXED } from '@/lib/seo';

// La cuenta del comprador (y el cambio de clave, y la verificación del mail).
export const metadata: Metadata = { title: 'Mi cuenta', robots: NOT_INDEXED };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
