import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, ConfirmProvider, PromptProvider } from '@tiendafy/ui';
import App from './App';
import { StoreProvider } from './context/StoreContext';
import { AuthProvider } from './context/AuthContext';
import { AuthGate } from './pages/Login';
import { applyMode, getInitialMode } from './lib/themeMode';
import './index.css';

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
                <BrowserRouter>
                  <App />
                </BrowserRouter>
              </StoreProvider>
            </AuthGate>
          </AuthProvider>
          </PromptProvider>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
