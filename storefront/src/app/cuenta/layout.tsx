import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NOT_INDEXED, sectionTitle } from '@/lib/seo';

// La cuenta del comprador (y el cambio de clave, y la verificación del mail).
export async function generateMetadata(): Promise<Metadata> {
  return { title: await sectionTitle('Mi cuenta'), robots: NOT_INDEXED };
}

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
