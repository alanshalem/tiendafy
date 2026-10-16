'use client';

import Link from 'next/link';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PredictiveSearch } from './PredictiveSearch';
import { usePreviewHref } from './preview';

/**
 * Lo que Next tira a propósito para cortar el render (notFound(), un
 * redirect, pasar a render del cliente…): no son errores de la página y
 * tienen que seguir hasta las barreras de Next.
 */
const NEXT_CONTROL_FLOW = [
  'NEXT_REDIRECT',
  'NEXT_HTTP_ERROR_FALLBACK',
  'NEXT_NOT_FOUND',
  'BAILOUT_TO_CLIENT_SIDE_RENDERING',
  'DYNAMIC_SERVER_USAGE',
];

function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && NEXT_CONTROL_FLOW.some((d) => digest.startsWith(d));
}

/**
 * La barrera de errores del contenido de cada página, ADENTRO del marco de la
 * tienda. Antes un error en el contenido (la API que tarda o falla a mitad
 * de una ficha) caía en app/error.tsx, que reemplaza la página entera: el
 * comprador quedaba en una pantalla blanca, sin encabezado, sin buscador y
 * sin carrito. Ahora el encabezado y el pie siguen ahí.
 */
export class StoreErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isNextControlFlow(error)) return;
    // Que quede registrado como cualquier error del navegador (lo levanta el monitoreo).
    console.error(error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (isNextControlFlow(error)) throw error;
    return <StoreError onRetry={() => this.setState({ error: null })} />;
  }
}

function StoreError({ onRetry }: { onRetry: () => void }) {
  const router = useRouter();
  const href = usePreviewHref();
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
        Algo salió mal
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        Tuvimos un problema cargando esta página. Probá de nuevo en un momento, o buscá lo que querías.
      </p>
      <button
        type="button"
        onClick={() => {
          onRetry();
          router.refresh();
        }}
        className="mt-6 inline-flex min-h-10 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-fg"
      >
        Reintentar
      </button>
      <PredictiveSearch
        variant="page"
        align="start"
        placeholder="¿Qué estás buscando?"
        className="mt-8 text-left"
      />
      <Link
        href={href('/')}
        className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-primary-ink hover:underline"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
