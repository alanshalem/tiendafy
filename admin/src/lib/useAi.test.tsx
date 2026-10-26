import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fixture, mockApi } from '../test/api';
import { useAiTask } from './useAi';

vi.mock('../context/StoreContext', () => ({ useStore: () => ({ store: { id: 'store-1' } }) }));

// Los textos y códigos que manda el backend (AiErrors y AiTaskPermissions).
const OFF = {
  reason:
    'La inteligencia artificial está apagada en esta tienda. Prendela en Configuración → Inteligencia artificial.',
  code: 'Ai.Disabled',
};
const NO_MODEL = {
  reason: 'Elegí un modelo para esta tarea en Configuración → Inteligencia artificial.',
  code: 'Ai.TaskNotConfigured',
};
const NO_KEY = { reason: 'Falta la clave de Anthropic.', code: 'Ai.TaskNotConfigured' };
const DENIED = { reason: 'No tenés permiso para usar esta función.', code: 'Ai.Denied' };
const OK = { reason: null, code: null };

type Why = { reason: string | null; code: string | null };
const item = (task: string, available: boolean, why: Why) => ({ task, available, ...why });

function setup(tasks: ReturnType<typeof item>[]) {
  const api = mockApi();
  api.on('GET', '/api/v1/ai/status', { tasks });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

/** Espera a que /ai/status llegue y se asiente en la caché. */
async function settled(client: QueryClient) {
  await waitFor(() => expect(client.getQueryState(['ai-status', 'store-1'])?.status).toBe('success'));
}

describe('useAiTask', () => {
  it('una tarea sin la clave del proveedor queda visible, no disponible y con su motivo', async () => {
    const { wrapper } = setup([item('ShortText', false, NO_KEY), item('QuestionDraft', true, OK)]);
    const { result } = renderHook(() => useAiTask('ShortText'), { wrapper });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current).toEqual({ visible: true, available: false, reason: NO_KEY.reason });
  });

  it('una tarea disponible no trae motivo', async () => {
    const { wrapper } = setup([item('InvoiceRead', true, OK)]);
    const { result } = renderHook(() => useAiTask('InvoiceRead'), { wrapper });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current).toEqual({ visible: true, available: true, reason: null });
  });

  it('con la IA apagada en la tienda, los botones quedan visibles y deshabilitados con el motivo', async () => {
    const { wrapper } = setup([item('ShortText', false, OFF), item('QuestionDraft', false, OFF)]);
    const { result } = renderHook(() => useAiTask('ShortText'), { wrapper });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current).toEqual({ visible: true, available: false, reason: OFF.reason });
  });

  it('en una tienda que nunca armó la IA (la respuesta real de la tienda sembrada), no se muestra', async () => {
    // Sin pisar /ai/status: la fixture es lo que devuelve el backend para una tienda sin AiSettings.
    const status = fixture<{ tasks: ReturnType<typeof item>[] }>('/api/v1/ai/status');
    expect(status.tasks.length).toBe(7);
    expect(status.tasks.every((t) => t.code === NO_MODEL.code)).toBe(true);
    mockApi();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAiTask('ShortText'), { wrapper });
    await settled(client);
    expect(result.current.visible).toBe(false);
  });

  it('si ninguna tarea tiene modelo y a otras les falta el permiso, no se muestra', async () => {
    const { client, wrapper } = setup([
      item('ShortText', false, NO_MODEL),
      item('QuestionDraft', false, DENIED),
    ]);
    const { result } = renderHook(() => useAiTask('ShortText'), { wrapper });
    await settled(client);
    expect(result.current.visible).toBe(false);
  });

  it('sin el permiso de la función, no se muestra aunque la tienda use IA', async () => {
    const { client, wrapper } = setup([item('ShortText', false, DENIED), item('QuestionDraft', true, OK)]);
    const { result } = renderHook(() => useAiTask('ShortText'), { wrapper });
    await settled(client);
    expect(result.current.visible).toBe(false);
  });

  it('con la IA apagada, la tarea sin permiso se oculta y las otras quedan deshabilitadas', async () => {
    const { client, wrapper } = setup([item('ShortText', false, DENIED), item('QuestionDraft', false, OFF)]);
    const denied = renderHook(() => useAiTask('ShortText'), { wrapper });
    const other = renderHook(() => useAiTask('QuestionDraft'), { wrapper });
    await settled(client);
    expect(denied.result.current.visible).toBe(false);
    expect(other.result.current).toEqual({ visible: true, available: false, reason: OFF.reason });
  });
});
