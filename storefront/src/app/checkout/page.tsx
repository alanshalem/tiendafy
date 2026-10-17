import { StorefrontPageShell } from '@/lib/storefront-page';
import { CheckoutClient } from '@/components/store/CheckoutClient';
import { CheckoutSkeleton } from '@/components/store/CheckoutSkeleton';

export const dynamic = 'force-dynamic';

export default function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // El esqueleto tiene las medidas del checkout: el que llega después no
  // empuja nada (ver CheckoutSkeleton).
  return (
    <StorefrontPageShell searchParams={searchParams} catalogProducts={false} fallback={<CheckoutSkeleton />}>
      {({ data, theme }) => (
        <CheckoutClient
          tenantId={data.tenant.id}
          storeName={data.tenant.name}
          contact={{
            whatsapp: theme.whatsappButton.phone || theme.contact.whatsapp || null,
            email: theme.contact.email || null,
          }}
        />
      )}
    </StorefrontPageShell>
  );
}
