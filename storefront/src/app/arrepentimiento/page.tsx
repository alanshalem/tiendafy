import type { Metadata } from 'next';
import { StorefrontView } from '@/components/store/StorefrontView';
import { RepentanceForm } from '@/components/store/RepentanceForm';
import { resolveStorefrontPage } from '@/lib/storefront-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Botón de arrepentimiento' };

/** Botón de Arrepentimiento — obligatorio en AR (Res. 424/2020). */
export default async function ArrepentimientoPage({ searchParams }: { searchParams: Promise<{ preview?: string; pt?: string }> }) {
  const resolved = await resolveStorefrontPage(searchParams);
  if (!resolved.ok) return resolved.fallback;
  const { data, theme, preview } = resolved;

  return (
    <StorefrontView tenantId={data.tenant.id} tenantName={data.tenant.name} theme={theme} products={data.products} live={preview}>
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Botón de arrepentimiento</h1>
        <p className="mt-4 text-sm leading-relaxed opacity-75">
          Si te arrepentiste de una compra, tenés derecho a revocarla dentro de los <strong>10 días corridos</strong> desde
          la entrega del producto o la contratación del servicio, sin costo alguno (art. 34, Ley 24.240 y Resolución 424/2020).
          Completá este formulario y la tienda va a coordinar con vos la devolución y el reintegro del pago.
        </p>
        <RepentanceForm />
      </main>
    </StorefrontView>
  );
}
