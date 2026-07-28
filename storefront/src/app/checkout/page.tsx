import { StorefrontView } from '@/components/store/StorefrontView';
import { resolveStorefrontPage } from '@/lib/storefront-page';
import { CheckoutClient } from '@/components/store/CheckoutClient';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const resolved = await resolveStorefrontPage(searchParams);
  if (!resolved.ok) return resolved.fallback;
  const { data, theme, preview } = resolved;

  return (
    <StorefrontView
      tenantId={data.tenant.id}
      tenantName={data.tenant.name}
      theme={theme}
      products={[]}
      live={preview}
    >
      <CheckoutClient tenantId={data.tenant.id} />
    </StorefrontView>
  );
}
