import { StorefrontPageShell } from '@/lib/storefront-page';
import { AccountOrderDetail } from '@/components/store/AccountOrderDetail';

export const dynamic = 'force-dynamic';

/** El detalle de un pedido propio, desde "Mi cuenta". */
export default async function CuentaPedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { id } = await params;
  return (
    <StorefrontPageShell searchParams={searchParams} catalogProducts={false}>
      {() => (
        <main className="mx-auto min-h-[60vh] max-w-container px-4 py-8">
          <AccountOrderDetail orderId={id} />
        </main>
      )}
    </StorefrontPageShell>
  );
}
