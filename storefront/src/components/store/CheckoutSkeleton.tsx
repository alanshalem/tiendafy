/**
 * El checkout mientras carga, con las medidas del checkout de verdad: la barra
 * de pasos, el resumen plegado del celular, los bloques del formulario y el
 * resumen al costado. Antes era un spinner en una caja de media pantalla y, al
 * llegar el formulario, todo saltaba (CLS de 0,28 medido). Lo usan la página
 * (mientras el servidor resuelve la tienda) y el checkout (mientras pide la
 * configuración y lee el carrito), así los dos estados ocupan lo mismo.
 */
export function CheckoutSkeleton() {
  const block = 'tf-skeleton rounded-lg';
  return (
    <main aria-busy="true" className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="sr-only">Finalizar compra</h1>
      <p className="sr-only" role="status" aria-label="Cargando el checkout…">
        Cargando el checkout…
      </p>
      {/* Pasos: tres círculos de 28 px con su etiqueta. */}
      <div className="mx-auto mb-8 flex h-[52px] max-w-md items-start justify-between" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex flex-col items-center gap-1">
            <span className={`h-7 w-7 rounded-full ${block}`} />
            <span className={`h-3 w-12 ${block}`} />
          </span>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]" aria-hidden="true">
        <div className="space-y-7">
          {/* El resumen plegado del celular, arriba del formulario. */}
          <div className={`h-12 lg:hidden ${block}`} />
          <div className="space-y-3">
            <div className={`h-6 w-44 ${block}`} />
            <div className={`h-11 ${block}`} />
          </div>
          <div className="space-y-3">
            <div className={`h-6 w-24 ${block}`} />
            <div className={`h-16 ${block}`} />
            <div className={`h-16 ${block}`} />
          </div>
          <div className="space-y-3">
            <div className={`h-6 w-52 ${block}`} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={`h-[68px] ${block}`} />
              <div className={`h-[68px] ${block}`} />
              <div className={`h-[68px] ${block}`} />
              <div className={`h-[68px] ${block}`} />
            </div>
          </div>
          <div className={`h-12 sm:max-w-xs ${block}`} />
        </div>
        <div className={`hidden h-72 lg:block ${block}`} />
      </div>
    </main>
  );
}
