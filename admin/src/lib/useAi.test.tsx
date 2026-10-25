import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/api';
import { useAiTask } from './useAi';

vi.mock('../context/StoreContext', () => ({ useStore: () => ({ store: { id: 'store-1' } }) }));

const DENIED = 'No tenés permiso para usar esta función.';

function setup(tasks: { task: string; available: boolean; reason: string | null }[]) {
  const api = mockApi();
  api.on('GET', '/api/v1/ai/status', { tasks });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { api, wrapper };
}

describe('useAiTask', () => {
  it('devuelve el motivo de una tarea no disponible, con el botón visible', async () => {
    const { wrapper } = setup([
      { task: 'ShortText', available: false, reason: 'Llegaste al tope de gasto del mes.' },
      { task: 'QuestionDraft', available: true, reason: null },
    ]);
    const { result } = renderHook(() => useAiTask('ShortText'), { wrapper });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current).toEqual({
      visible: true,
      available: false,
      reason: 'Llegaste al tope de gasto del mes.',
    });
  });

  it('una tarea disponible no trae motivo', async () => {
    const { wrapper } = setup([{ task: 'InvoiceRead', available: true, reason: null }]);
    const { result } = renderHook(() => useAiTask('InvoiceRead'), { wrapper });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current).toEqual({ visible: true, available: true, reason: null });
  });

  it('sin ninguna tarea disponible en la tienda (IA sin configurar), no se muestra', async () => {
    const { api, wrapper } = setup([
      { task: 'ShortText', available: false, reason: 'La IA no está configurada.' },
      { task: 'QuestionDraft', available: false, reason: 'La IA no está configurada.' },
    ]);
    const { result } = renderHook(() => useAiTask('ShortText'), { wrapper });
    await waitFor(() => expect(api.calls.some((c) => c.path === '/api/v1/ai/status')).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.visible).toBe(false);
  });

  it('sin el permiso de la función, no se muestra aunque la tienda use IA', async () => {
    const { api, wrapper } = setup([
      { task: 'ShortText', available: false, reason: DENIED },
      { task: 'QuestionDraft', available: true, reason: null },
    ]);
    const { result } = renderHook(() => useAiTask('ShortText'), { wrapper });
    await waitFor(() => expect(api.calls.some((c) => c.path === '/api/v1/ai/status')).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.visible).toBe(false);
  });
});
