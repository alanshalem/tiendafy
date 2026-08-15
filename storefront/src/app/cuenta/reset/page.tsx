import { Suspense } from 'react';
import { StorefrontPageShell } from '@/lib/storefront-page';
import { ResetPassword } from '@/components/store/ResetPassword';

export const dynamic = 'force-dynamic';

export default function ResetPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  return (
    <StorefrontPageShell searchParams={searchParams}>
      {() => (
        <main className="mx-auto min-h-[60vh] max-w-container px-4 py-8">
          <Suspense>
            <ResetPassword />
          </Suspense>
        </main>
      )}
    </StorefrontPageShell>
  );
}
