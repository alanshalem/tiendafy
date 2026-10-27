import { Suspense } from 'react';
import type { Metadata } from 'next';
import { StorefrontPageShell } from '@/lib/storefront-page';
import { NewsletterConfirm } from '@/components/store/NewsletterConfirm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Confirmar suscripción', robots: { index: false } };

export default function NewsletterConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  return (
    <StorefrontPageShell searchParams={searchParams}>
      {() => (
        <main className="mx-auto min-h-[60vh] max-w-container px-4 py-8">
          <Suspense>
            <NewsletterConfirm />
          </Suspense>
        </main>
      )}
    </StorefrontPageShell>
  );
}
