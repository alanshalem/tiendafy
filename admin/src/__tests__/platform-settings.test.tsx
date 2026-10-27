import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixture, mockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';
import type { PlatformSettingsView } from '../pages/PlatformSettings';

const me = fixture<{ id: string; email: string; name: string }>('/api/v1/auth/me');

beforeEach(() => localStorage.clear());
afterEach(() => window.history.replaceState(null, '', '/'));

describe('Configuración de la plataforma (/plataforma)', () => {
  it('un dueño común no ve la entrada en el menú ni puede editar la pantalla', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/auth/me', { ...me, isSuperAdmin: false });

    renderApp('/plataforma');
    await settle(4);

    expect(
      await screen.findByRole('heading', { name: 'Solo para el superadministrador de la plataforma' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Configuración de la plataforma' })).not.toBeInTheDocument();
    expect(api.calls.some((c) => c.path.startsWith('/api/v1/admin/platform-settings'))).toBe(false);
  });

  it('el superadministrador ve las palancas, credenciales e infraestructura fija y guarda en vivo', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/auth/me', { ...me, isSuperAdmin: true });
    const initial = fixture<PlatformSettingsView>('/api/v1/admin/platform-settings');

    const user = userEvent.setup();
    renderApp('/plataforma');
    await settle(4);

    expect(await screen.findByRole('heading', { name: 'Palancas de operación' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Credenciales de servicios de la plataforma' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Base de datos PostgreSQL')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configuración de la plataforma' })).toBeInTheDocument();

    // Prender el corte de emergencia de IA y cargar una API Key de Resend.
    const aiSwitch = screen.getByRole('switch', {
      name: /Apagar la inteligencia artificial en todas las tiendas/i,
    });
    await user.click(aiSwitch);

    const resendInput = screen.getByLabelText(/API Key de Resend/i);
    await user.type(resendInput, 're_live_nueva_9988');

    api.on('PUT', '/api/v1/admin/platform-settings', (body: unknown) => ({
      ...initial,
      switches: {
        ...initial.switches,
        aiDisabled: {
          ...initial.switches.aiDisabled,
          value: true,
          source: 'database',
        },
      },
      services: {
        ...initial.services,
        email: {
          ...initial.services.email,
          resendApiKey: {
            ...initial.services.email.resendApiKey,
            configured: true,
            last4: '9988',
            source: 'database',
          },
        },
      },
      updatedByEmail: (body as Record<string, unknown>) ? me.email : null,
    }));

    const saveBtn = screen.getByRole('button', { name: /Guardar configuración de la plataforma/i });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    await waitFor(() => {
      const putCall = api.calls.find(
        (c) => c.method === 'PUT' && c.path === '/api/v1/admin/platform-settings',
      );
      expect(putCall).toBeDefined();
      expect(putCall?.body).toEqual({
        aiDisabled: true,
        values: {
          'Email:ResendApiKey': 're_live_nueva_9988',
        },
      });
    });

    expect(await screen.findByText('…9988')).toBeInTheDocument();
  });
});
