/**
 * Renderizar el panel como en producción: los mismos providers que main.tsx
 * (React Query, toasts, confirmaciones, sesión, tienda activa, permisos) con
 * un router en memoria parado en la ruta pedida.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { ConfirmProvider, PromptProvider, ToastProvider } from '@tiendafy/ui';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import { PermissionsProvider } from '../context/PermissionsContext';
import { StoreProvider } from '../context/StoreContext';
import { AuthGate } from '../pages/Login';
import { preloadPages } from '../lib/lazyPage';

// Las pantallas se bajan recién al abrirse (lib/lazyPage). En los tests se
// bajan todas antes: un import lento no tiene que parecer una pantalla que no
// aparece.
await preloadPages();

export function Providers({ children, path = '/' }: { children: ReactNode; path?: string }) {
  // Un cliente por test: sin reintentos (un 404 de las fixtures es definitivo)
  // y sin cache compartido entre tests.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <PromptProvider>
            <AuthProvider>
              <AuthGate>
                <StoreProvider>
                  <PermissionsProvider>
                    <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
                  </PermissionsProvider>
                </StoreProvider>
              </AuthGate>
            </AuthProvider>
          </PromptProvider>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

/** El panel entero en esa ruta. */
export function renderApp(path: string) {
  return render(
    <Providers path={path}>
      <App />
    </Providers>,
  );
}

/** Un componente suelto con todos los providers del panel. */
export function renderWithProviders(ui: ReactElement, path = '/') {
  return render(<Providers path={path}>{ui}</Providers>);
}
