import { Suspense } from 'react';
import type { Metadata } from 'next';
import { StorefrontPageShell } from '@/lib/storefront-page';
import { ResetPassword } from '@/components/store/ResetPassword';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Nueva contraseña' };

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
