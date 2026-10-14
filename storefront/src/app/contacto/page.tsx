import type { Metadata } from 'next';
import { StorefrontPageShell } from '@/lib/storefront-page';
import { ContactContent } from '@/components/store/ContactContent';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Contacto',
  description: 'Escribinos: respondemos consultas sobre productos, envíos y compras.',
};

export default function ContactPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  return (
    <StorefrontPageShell searchParams={searchParams}>
      {({ theme }) => <ContactContent contact={theme.contact} />}
    </StorefrontPageShell>
  );
}
