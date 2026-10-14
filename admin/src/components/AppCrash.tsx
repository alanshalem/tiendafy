import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { useRouteError } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@tiendafy/ui';
import { reportError } from '../lib/reportError';
import { isStaleChunk } from './ScreenBoundary';

/*
 * La última red del panel. ScreenBoundary ataja lo que falla DENTRO de una
 * pantalla; lo que queda por fuera (los providers de main.tsx, el menú, el
 * CommandPalette, AdminLayout, SettingsLayout) dejaba la página en blanco.
 * Acá no hay router ni providers garantizados: solo HTML, un botón y un link
 * común.
 */

export function AppCrashScreen({ stale }: { stale: boolean }) {
  return (
    <main role="alert" className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning">
          {stale ? <RefreshCw className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
        </span>
        <h1 className="mt-4 text-lg font-semibold text-fg">
          {stale ? 'Hay una versión nueva del panel' : 'El panel no pudo cargar'}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {stale
            ? 'Recargá para seguir: no se pierde nada de lo que ya está guardado.'
            : 'Ya nos llegó el aviso. Recargá la página; si sigue pasando, probá en unos minutos.'}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Recargar</Button>
          {!stale && (
            <a
              href="/"
              className="inline-flex h-10 items-center rounded-md border border-border-strong px-4 text-sm font-medium text-fg hover:bg-bg-muted"
            >
              Ir al inicio
            </a>
          )}
        </div>
      </div>
    </main>
  );
}

/** errorElement del router: lo que tira el menú, los layouts o el CommandPalette. */
export function RouteCrash() {
  const error = useRouteError();
  const stale = isStaleChunk(error);
  useEffect(() => {
    if (!stale) reportError(error, { area: 'router' });
  }, [error, stale]);
  return <AppCrashScreen stale={stale} />;
}

/** Por encima de todo (providers incluidos), en main.tsx. */
export class RootBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (!isStaleChunk(error))
      reportError(error, { area: 'root', componentStack: info.componentStack ?? undefined });
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return <AppCrashScreen stale={isStaleChunk(this.state.error)} />;
  }
}
