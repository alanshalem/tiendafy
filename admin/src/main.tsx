import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, ConfirmProvider, PromptProvider } from '@tiendafy/ui';
import App from './App';
import { BRAND } from './lib/runtime';

// El <title> del index.html es estático (se compila una vez); la marca de la
// instalación llega en runtime, así que el título se fija al arrancar.
document.title = `${BRAND} Admin`;
import { StoreProvider } from './context/StoreContext';
import { PermissionsProvider } from './context/PermissionsContext';
import { AuthProvider } from './context/AuthContext';
import { AuthGate } from './pages/Login';
import { applyMode, getInitialMode } from './lib/themeMode';
import { runtime } from './lib/runtime';
import './index.css';

// Sentry: activo solo si hay DSN (servidor). Sin DSN = cero overhead en dev.
// El ambiente sale de la config de runtime, así que los errores de staging y
// los de producción quedan separados aunque la imagen sea la misma.
if (runtime.sentryDsn) {
  import('@sentry/react').then((Sentry) => {
    Sentry.init({ dsn: runtime.sentryDsn, environment: runtime.envName, tracesSampleRate: 0.1 });
  });
}

// Aplicar el modo guardado antes del primer render (evita flash).
applyMode(getInitialMode());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <PromptProvider>
            <AuthProvider>
              <AuthGate>
                <StoreProvider>
                  <PermissionsProvider>
                    <BrowserRouter>
                      <App />
                    </BrowserRouter>
                  </PermissionsProvider>
                </StoreProvider>
              </AuthGate>
            </AuthProvider>
          </PromptProvider>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
