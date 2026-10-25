/**
 * Cambiar de tienda con la configuración de la otra ya en el cache: lo tipeado y no guardado
 * (la clave, el tope) es de la tienda donde se tipeó y no puede aparecer ni guardarse en la otra.
 * El store se simula para cambiarlo sin que el panel desmonte la pantalla por el camino
 * (al cambiar de tienda los permisos recargan y eso, en el panel real, la remonta).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmProvider, ToastProvider } from '@tiendafy/ui';
import { describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/api';
import { settle } from '../../test/explore';
import { AiSettingsPage } from './AiSettings';

const current = vi.hoisted(() => ({ id: 'store-a' }));
vi.mock('../../context/StoreContext', () => ({
  useStore: () => ({ store: { id: current.id, name: current.id }, stores: [] }),
}));

const config = {
  providers: ['Anthropic', 'OpenAI', 'Google', 'Groq'].map((provider) => ({
    provider,
    configured: false,
    last4: null,
    lastTestOk: null,
    lastTestAt: null,
  })),
  assignments: [],
  settings: { enabled: false, monthlyBudgetUsd: 0, alertThresholdPct: 80 },
  tasks: [],
};

describe('AiSettingsPage al cambiar de tienda', () => {
  it('la clave y el tope tipeados en una tienda no pasan a la otra, y nada de la primera se manda', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/ai/config', config);
    api.on('GET', '/api/v1/ai/config/usage', {
      month: '2026-10',
      scope: 'store',
      budgetMicroUsd: 0,
      spentMicroUsd: 0,
      byDay: [],
      byTask: [],
      byModel: [],
      byUser: [],
      stores: null,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = () => (
      <QueryClientProvider client={client}>
        <ToastProvider>
          <ConfirmProvider>
            <AiSettingsPage />
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    );
    const user = userEvent.setup({ delay: null });

    // La configuración de la tienda B ya está en el cache.
    current.id = 'store-b';
    const first = render(ui());
    await screen.findByLabelText('Clave de Anthropic');
    first.unmount();

    current.id = 'store-a';
    const { rerender } = render(ui());
    await user.type(await screen.findByLabelText('Clave de Anthropic'), 'sk-test-sin-guardar');
    await user.type(screen.getByLabelText('Tope mensual (US$)'), '50');

    current.id = 'store-b';
    rerender(ui());
    await settle(2);

    expect(screen.getByLabelText('Clave de Anthropic')).toHaveValue('');
    expect(screen.getByLabelText('Tope mensual (US$)')).toHaveValue('');
    expect(api.calls.some((c) => c.method !== 'GET')).toBe(false);
  });
});
