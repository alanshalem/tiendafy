/**
 * Skeletons de carga (shimmer). Van ADENTRO del marco de la tienda, como
 * fallback del <Suspense> de cada página: el encabezado y el pie ya se ven
 * mientras llega el contenido. Cada uno se anuncia como "Cargando…" a los
 * lectores de pantalla.
 */

export function ProductCardSkeleton() {
  return (
    <div>
      <div className="tf-skeleton aspect-square w-full rounded-lg" />
      <div className="tf-skeleton mt-2 h-4 w-3/4 rounded" />
      <div className="tf-skeleton mt-1.5 h-4 w-1/3 rounded" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" aria-label="Cargando productos…" className="mx-auto max-w-container px-4 py-10">
      <div className="tf-skeleton mb-6 h-7 w-48 rounded" />
      <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: count }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div role="status" aria-label="Cargando producto…" className="mx-auto max-w-container px-4 py-10">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="tf-skeleton aspect-square w-full rounded-lg" />
        <div>
          <div className="tf-skeleton h-9 w-3/4 rounded" />
          <div className="tf-skeleton mt-4 h-7 w-1/3 rounded" />
          <div className="tf-skeleton mt-6 h-4 w-full rounded" />
          <div className="tf-skeleton mt-2 h-4 w-5/6 rounded" />
          <div className="tf-skeleton mt-2 h-4 w-2/3 rounded" />
          <div className="tf-skeleton mt-8 h-12 w-full rounded-md" />
          <div className="tf-skeleton mt-3 h-11 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** Página de texto (legales, contenido, cuenta, contacto): título y párrafos. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Cargando…" className="mx-auto min-h-[60vh] max-w-3xl px-4 py-10">
      <div className="tf-skeleton h-8 w-2/3 rounded" />
      <div className="tf-skeleton mt-6 h-4 w-full rounded" />
      <div className="tf-skeleton mt-2 h-4 w-11/12 rounded" />
      <div className="tf-skeleton mt-2 h-4 w-4/5 rounded" />
      <div className="tf-skeleton mt-8 h-4 w-full rounded" />
      <div className="tf-skeleton mt-2 h-4 w-3/4 rounded" />
    </div>
  );
}
