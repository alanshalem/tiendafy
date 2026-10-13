import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@tiendafy/ui';
import { reportError } from '../lib/reportError';
import { ScreenSkeleton } from './Skeleton';

/**
 * El marco de cada pantalla del panel: mientras se baja su código, un
 * esqueleto; si falla al dibujarse, un aviso con "Reintentar" en el lugar de
 * esa pantalla —el menú y el resto del panel siguen andando— y el error va a
 * Sentry.
 *
 * Antes no había ninguna barrera: un error en cualquier pantalla tiraba el
 * panel entero y quedaba en blanco (así se vio el "panel en negro" del primer
 * deploy).
 */
export function ScreenBoundary({ children }: { children: ReactNode }) {
  // Cambiar de pantalla limpia el error: el aviso es de la que falló.
  const { pathname } = useLocation();
  return (
    <ErrorBarrier resetKey={pathname}>
      <Suspense fallback={<ScreenSkeleton />}>{children}</Suspense>
    </ErrorBarrier>
  );
}

/**
 * El código de una pantalla ya no está en el servidor: se publicó una versión
 * nueva del panel mientras esta pestaña seguía abierta. No es un error de la
 * pantalla; se arregla recargando.
 */
export function isStaleChunk(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically/i.test(
    message,
  );
}

interface BarrierProps {
  resetKey: string;
  children: ReactNode;
}

class ErrorBarrier extends Component<BarrierProps, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (!isStaleChunk(error)) reportError(error, { componentStack: info.componentStack ?? undefined });
  }

  componentDidUpdate(prev: BarrierProps) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ScreenError stale={isStaleChunk(error)} onRetry={() => this.setState({ error: null })} />;
  }
}

function ScreenError({ stale, onRetry }: { stale: boolean; onRetry: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning">
        {stale ? <RefreshCw className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
      </span>
      <h1 className="mt-4 text-lg font-semibold text-fg">
        {stale ? 'Hay una versión nueva del panel' : 'Algo falló en esta pantalla'}
      </h1>
      <p className="mt-1 text-sm text-fg-muted">
        {stale
          ? 'Recargá para seguir: no se pierde nada de lo que ya está guardado.'
          : 'El resto del panel sigue andando. Ya nos llegó el aviso; probá de nuevo o volvé al inicio.'}
      </p>
      <div className="mt-5 flex justify-center gap-2">
        {stale ? (
          <Button onClick={() => window.location.reload()}>Recargar</Button>
        ) : (
          <>
            <Button onClick={onRetry}>Reintentar</Button>
            <Link
              to="/"
              className="inline-flex h-10 items-center rounded-md border border-border-strong px-4 text-sm font-medium text-fg hover:bg-bg-muted"
            >
              Ir al inicio
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
