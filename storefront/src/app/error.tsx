'use client';

/**
 * El último recurso: lo que falló fuera del contenido de la página (no se
 * pudo ni cargar la tienda o su diseño). Un error en el contenido ya no llega
 * acá: lo ataja StoreErrorBoundary adentro del marco de la tienda, con su
 * encabezado y su buscador. Acá no hay diseño que pintar, así que va lo
 * mínimo para salir: reintentar o volver al inicio (un link de verdad, que
 * recarga la página entera).
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold">Algo salió mal</h1>
      <p className="mt-2 max-w-sm text-sm text-fg-muted">
        Tuvimos un problema cargando esta página. Probá de nuevo en un momento.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex min-h-10 items-center rounded-full bg-black px-6 text-sm font-semibold text-white transition-transform hover:scale-[1.03] dark:bg-white dark:text-black"
        >
          Reintentar
        </button>
        {/* <a> y no <Link>: si falló el marco de la tienda, conviene empezar de cero. */}
        <a href="/" className="inline-flex min-h-10 items-center px-3 text-sm font-semibold underline">
          Volver al inicio
        </a>
      </div>
    </main>
  );
}
