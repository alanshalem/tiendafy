import type { Metadata } from 'next';
import { StorefrontPageShell } from '@/lib/storefront-page';
import { ReviewWriter } from '@/components/store/ReviewWriter';
import { NOT_INDEXED } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Opiná de tu compra', robots: NOT_INDEXED };

/**
 * Donde el comprador escribe sus reseñas. Se llega con el link del email
 * (`?t=<token firmado>`) o desde el detalle de una compra en "Mi cuenta"
 * (`?pedido=<id>`, con la sesión del comprador): sin una de las dos no hay
 * nada que opinar.
 */
export default async function WriteReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; t?: string; pedido?: string }>;
}) {
  const { t, pedido } = await searchParams;
  return (
    <StorefrontPageShell searchParams={searchParams} catalogProducts={false}>
      {() => (
        <main className="mx-auto min-h-[60vh] max-w-2xl px-4 py-8">
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            Opiná de tu compra
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Tu opinión ayuda a otros compradores a decidir. Se publica con tu nombre y la inicial de tu
            apellido.
          </p>
          <ReviewWriter token={t ?? null} orderId={pedido ?? null} />
        </main>
      )}
    </StorefrontPageShell>
  );
}
