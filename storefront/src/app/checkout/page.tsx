import { StorefrontPageShell } from '@/lib/storefront-page';
import { CheckoutClient } from '@/components/store/CheckoutClient';

export const dynamic = 'force-dynamic';

export default function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <StorefrontPageShell searchParams={searchParams} catalogProducts={false}>
      {({ data }) => <CheckoutClient tenantId={data.tenant.id} />}
    </StorefrontPageShell>
  );
}
