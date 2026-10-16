import type { Metadata } from 'next';
import { StorefrontPageShell } from '@/lib/storefront-page';
import { AccountConversations } from '@/components/store/AccountConversations';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mis conversaciones' };

/** Las consultas del chat posventa del comprador, desde "Mi cuenta". */
export default function CuentaConversacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  return (
    <StorefrontPageShell searchParams={searchParams} catalogProducts={false}>
      {() => (
        <main className="mx-auto min-h-[60vh] max-w-container px-4 py-8">
          <AccountConversations />
        </main>
      )}
    </StorefrontPageShell>
  );
}
