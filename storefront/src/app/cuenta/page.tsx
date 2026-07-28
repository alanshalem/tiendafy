import { StorefrontView } from '@/components/store/StorefrontView';
import { AccountDashboard } from '@/components/store/AccountDashboard';
import { resolveStorefrontPage } from '@/lib/storefront-page';

export const dynamic = 'force-dynamic';

export default async function CuentaPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const resolved = await resolveStorefrontPage(searchParams);
  if (!resolved.ok) return resolved.fallback;
  const { data, theme, preview } = resolved;

  return (
    <StorefrontView
      tenantId={data.tenant.id}
      tenantName={data.tenant.name}
      theme={theme}
      products={data.products}
      live={preview}
    >
      <main className="mx-auto min-h-[60vh] max-w-container px-4 py-8">
        <AccountDashboard />
      </main>
    </StorefrontView>
  );
}
