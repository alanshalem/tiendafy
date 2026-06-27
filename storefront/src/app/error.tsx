'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold">Algo salió mal</h1>
      <p className="mt-2 max-w-sm text-sm opacity-60">
        Tuvimos un problema cargando esta página. Probá de nuevo en un momento.
      </p>
      <button
        onClick={reset}
        className="mt-6 inline-flex items-center rounded-full bg-black px-6 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03] dark:bg-white dark:text-black"
      >
        Reintentar
      </button>
    </main>
  );
}
