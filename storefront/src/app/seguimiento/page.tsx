import type { Metadata } from 'next';
import { StorefrontPageShell } from '@/lib/storefront-page';
import { OrderTracker } from '@/components/store/OrderTracker';
import { NOT_INDEXED, sectionTitle } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  // Cada link lleva un token propio: no tiene sentido indexarla.
  return { title: await sectionTitle('Seguí tu pedido'), robots: NOT_INDEXED };
}

/** "Seguí tu pedido": sin cuenta, con email + número o con el link del mail. */
export default async function SeguimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; pt?: string; t?: string; pedido?: string }>;
}) {
  const sp = await searchParams;
  return (
    <StorefrontPageShell searchParams={searchParams} catalogProducts={false}>
      {() => (
        <main className="mx-auto min-h-[60vh] max-w-2xl px-4 py-10">
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            Seguí tu pedido
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            Con el email con el que compraste y el número de pedido ves en qué está, el seguimiento del envío
            y el detalle de la compra. No hace falta tener cuenta.
          </p>
          <OrderTracker token={sp.t} initialNumber={sp.pedido} />
        </main>
      )}
    </StorefrontPageShell>
  );
}
