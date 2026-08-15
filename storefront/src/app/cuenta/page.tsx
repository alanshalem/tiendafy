import { StorefrontPageShell } from '@/lib/storefront-page';
import { AccountDashboard } from '@/components/store/AccountDashboard';

export const dynamic = 'force-dynamic';

export default function CuentaPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  return (
    <StorefrontPageShell searchParams={searchParams}>
      {() => (
        <main className="mx-auto min-h-[60vh] max-w-container px-4 py-8">
          <AccountDashboard />
        </main>
      )}
    </StorefrontPageShell>
  );
}
