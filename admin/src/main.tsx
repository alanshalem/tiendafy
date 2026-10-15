import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
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
import { createQueryClient } from './lib/queryClient';
import { QueryErrorToasts } from './components/QueryErrorToasts';
import { RootBoundary, RouteCrash } from './components/AppCrash';
import { installStaleChunkReload } from './lib/staleChunkReload';
import { initSentry } from './lib/reportError';
import './index.css';

// Sentry: activo solo si hay DSN (servidor). Sin DSN = cero overhead en dev.
void initSentry();

// Pestaña abierta de antes de un deploy: recarga una vez en vez de fallar.
installStaleChunkReload();

// Aplicar el modo guardado antes del primer render (evita flash).
applyMode(getInitialMode());

const queryClient = createQueryClient();

// Router "de datos" con una sola ruta comodín que dibuja la tabla de rutas de
// App (<Routes>): con BrowserRouter no existe useBlocker, y sin él no hay
// forma de frenar un cambio de pantalla con un formulario a medio cargar
// (ver lib/useUnsavedChanges).
// errorElement: lo que tira por fuera de una pantalla (el menú, los layouts,
// el CommandPalette) mostraba la página en blanco.
const router = createBrowserRouter([{ path: '*', element: <App />, errorElement: <RouteCrash /> }]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <QueryErrorToasts />
          <ConfirmProvider>
            <PromptProvider>
              <AuthProvider>
                <AuthGate>
                  <StoreProvider>
                    <PermissionsProvider>
                      <RouterProvider router={router} />
                    </PermissionsProvider>
                  </StoreProvider>
                </AuthGate>
              </AuthProvider>
            </PromptProvider>
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    </RootBoundary>
  </StrictMode>,
);
