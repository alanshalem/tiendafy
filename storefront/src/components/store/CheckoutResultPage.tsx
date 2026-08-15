import { StorefrontPageShell } from '@/lib/storefront-page';
import { CheckoutResult } from './CheckoutResult';

/**
 * Las tres rutas de resultado del checkout (success/pending/failure) son la
 * misma página; solo cambia el `kind` que usa CheckoutResult como pista
 * inicial mientras consulta el estado real de la orden.
 */
export function CheckoutResultPage(kind: 'success' | 'pending' | 'failure') {
  return async function Page({
    searchParams,
  }: {
    searchParams: Promise<Record<string, string | undefined>>;
  }) {
    const sp = await searchParams;
    return (
      <StorefrontPageShell searchParams={searchParams} catalogProducts={false}>
        {({ data }) => <CheckoutResult tenantId={data.tenant.id} orderId={sp.order} kind={kind} />}
      </StorefrontPageShell>
    );
  };
}
