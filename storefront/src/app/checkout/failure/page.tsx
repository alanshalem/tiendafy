import { StorefrontView } from '@/components/store/StorefrontView';
import { resolveStorefrontPage } from '@/lib/storefront-page';
import { CheckoutResult } from '@/components/store/CheckoutResult';

export const dynamic = 'force-dynamic';

export default async function CheckoutFailurePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const resolved = await resolveStorefrontPage(searchParams);
  if (!resolved.ok) return resolved.fallback;
  const { data, theme, preview } = resolved;
  const sp = await searchParams;

  return (
    <StorefrontView tenantId={data.tenant.id} tenantName={data.tenant.name} theme={theme} products={[]} live={preview}>
      <CheckoutResult tenantId={data.tenant.id} orderId={sp.order} kind="failure" />
    </StorefrontView>
  );
}
