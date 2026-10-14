'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/report-error';

/**
 * Cuando falla el layout raíz (la tienda, el diseño o la config de runtime),
 * error.tsx no llega a ayudar: está DENTRO de ese layout. Sin este archivo el
 * visitante veía la pantalla genérica de Next, en inglés.
 *
 * Reemplaza al layout entero, así que trae su propio <html>/<body> y estilos
 * en línea: los globales de la tienda pueden no haber cargado.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError(error, { tags: { area: 'global-error' }, extra: { digest: error.digest } });
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', color: '#111', background: '#fff' }}>
        <title>Algo salió mal</title>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 16px',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 24, margin: 0 }}>Algo salió mal</h1>
          <p style={{ marginTop: 8, maxWidth: 360, fontSize: 14, color: '#4b5563' }}>
            Tuvimos un problema cargando la tienda. Probá de nuevo en un momento.
          </p>
          <button
            type="button"
            onClick={retry}
            style={{
              marginTop: 24,
              border: 0,
              borderRadius: 999,
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              background: '#111',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
