import { Suspense } from 'react';
import { StorefrontPageShell } from '@/lib/storefront-page';
import { VerifyEmail } from '@/components/store/VerifyEmail';

export const dynamic = 'force-dynamic';

export default function VerifyPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  return (
    <StorefrontPageShell searchParams={searchParams}>
      {() => (
        <main className="mx-auto min-h-[60vh] max-w-container px-4 py-8">
          <Suspense>
            <VerifyEmail />
          </Suspense>
        </main>
      )}
    </StorefrontPageShell>
  );
}
