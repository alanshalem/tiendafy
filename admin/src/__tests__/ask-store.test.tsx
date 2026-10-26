/**
 * "Preguntale a tu tienda": el botón solo existe con estadísticas y con la IA armada, y la conversación vive
 * en la pestaña, por tienda, sin sumar las vueltas que fallaron.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixtureTenantId } from '../../../test-fixtures/mock-api';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

const ASK = '/api/v1/ai/assistant';
const BUTTON = { name: /Preguntale a tu tienda/ };

const ready = {
  tasks: [{ task: 'DataAssistant', available: true, reason: null, code: null }],
};

const perms = fixture<{ role: string; permissions: string[] }>('/api/v1/me/permissions');

interface Options {
  status?: unknown;
  permissions?: string[];
  setup?: (api: MockApi) => void;
}

async function open(path: string, { status = ready, permissions, setup }: Options = {}) {
  const api = mockApi();
  api.on('GET', '/api/v1/ai/status', status);
  if (permissions) api.on('GET', '/api/v1/me/permissions', { ...perms, permissions });
  setup?.(api);
  const user = userEvent.setup();
  renderApp(path);
  await settle(3);
  return { api, user };
}

const asks = (api: MockApi) => api.calls.filter((c) => c.method === 'POST' && c.path === ASK);

async function ask(user: ReturnType<typeof userEvent.setup>, question: string) {
  await user.type(await screen.findByRole('textbox', { name: 'Tu pregunta' }), question);
  await user.click(screen.getByRole('button', { name: 'Preguntar' }));
}

describe('Preguntale a tu tienda', () => {
  it.each(['/', '/estadisticas'])('sin stats.read no hay botón en %s', async (path) => {
    await open(path, { permissions: perms.permissions.filter((p) => p !== 'stats.read') });
    expect(screen.queryByRole('button', BUTTON)).toBeNull();
  });

  it.each(['/', '/estadisticas'])('con stats.read el botón está en %s', async (path) => {
    await open(path);
    expect(await screen.findByRole('button', BUTTON)).toBeEnabled();
  });

  it('no disponible queda deshabilitado con el motivo', async () => {
    await open('/', {
      status: {
        tasks: [
          {
            task: 'DataAssistant',
            available: false,
            reason: 'La inteligencia artificial está apagada en esta tienda.',
            code: 'Ai.Disabled',
          },
        ],
      },
    });
    const button = await screen.findByRole('button', BUTTON);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'La inteligencia artificial está apagada en esta tienda.');
  });

  it('sin la IA armada en la tienda no se muestra', async () => {
    await open('/', {
      status: {
        tasks: [{ task: 'DataAssistant', available: false, reason: 'x', code: 'Ai.TaskNotConfigured' }],
      },
    });
    expect(screen.queryByRole('button', BUTTON)).toBeNull();
  });

  it('pregunta y muestra la respuesta con sus fuentes', async () => {
    const { api, user } = await open('/', {
      setup: (a) =>
        a.on('POST', ASK, { answer: 'Hay **2** productos bajos.', sources: ['Stock bajo'], limited: false }),
    });
    await user.click(await screen.findByRole('button', BUTTON));
    await ask(user, '¿Qué se me acaba?');

    expect(await screen.findByText('Datos de: Stock bajo')).toBeInTheDocument();
    expect(screen.getByText('2').tagName).toBe('STRONG');
    expect(asks(api)[0]!.body).toEqual({ question: '¿Qué se me acaba?', history: [] });
    expect(screen.queryByText(/No llegué a una respuesta completa/)).toBeNull();
  });

  it('la segunda pregunta manda la primera en el historial', async () => {
    const { api, user } = await open('/', {
      setup: (a) => a.on('POST', ASK, { answer: 'Respuesta uno.', sources: [], limited: false }),
    });
    await user.click(await screen.findByRole('button', BUTTON));
    await ask(user, 'Primera');
    await screen.findByText('Respuesta uno.');
    await ask(user, 'Segunda');
    await waitFor(() => expect(asks(api)).toHaveLength(2));

    expect(asks(api)[1]!.body).toEqual({
      question: 'Segunda',
      history: [{ question: 'Primera', answer: 'Respuesta uno.' }],
    });
  });

  it('un error de la API se muestra y no entra al historial', async () => {
    const { api, user } = await open('/', {
      setup: (a) =>
        a.on(
          'POST',
          ASK,
          {
            title: 'Ai.Busy',
            detail: 'Ya hay una tarea de inteligencia artificial en curso. Esperá a que termine.',
          },
          409,
        ),
    });
    await user.click(await screen.findByRole('button', BUTTON));
    await ask(user, 'Hola');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya hay una tarea de inteligencia artificial en curso.',
    );
    // La pregunta quedó en el campo para reintentar y no hay vuelta nueva.
    expect(screen.getByRole('textbox', { name: 'Tu pregunta' })).toHaveValue('Hola');
    expect(screen.queryByText('Datos de:')).toBeNull();
    expect(sessionStorage.getItem(`tiendafy:asistente:${fixtureTenantId}`)).toBeNull();
    expect(asks(api)).toHaveLength(1);
  });

  it('una respuesta cortada avisa', async () => {
    const { user } = await open('/', {
      setup: (a) => a.on('POST', ASK, { answer: 'A medias.', sources: [], limited: true }),
    });
    await user.click(await screen.findByRole('button', BUTTON));
    await ask(user, 'Todo');

    expect(await screen.findByText(/No llegué a una respuesta completa/)).toBeInTheDocument();
  });

  it('la conversación sobrevive a navegar y "Empezar de nuevo" la borra', async () => {
    const { user } = await open('/', {
      setup: (a) => a.on('POST', ASK, { answer: 'Respuesta guardada.', sources: [], limited: false }),
    });
    await user.click(await screen.findByRole('button', BUTTON));
    await ask(user, 'Hola');
    await screen.findByText('Respuesta guardada.');
    expect(sessionStorage.getItem(`tiendafy:asistente:${fixtureTenantId}`)).toContain('Respuesta guardada.');

    await user.click(screen.getByRole('button', { name: 'Empezar de nuevo' }));
    expect(screen.queryByText('Respuesta guardada.')).toBeNull();
    expect(sessionStorage.getItem(`tiendafy:asistente:${fixtureTenantId}`)).toBe('[]');
  });

  it('retoma la conversación guardada de esta tienda', async () => {
    sessionStorage.setItem(
      `tiendafy:asistente:${fixtureTenantId}`,
      JSON.stringify([
        { question: 'Antes', answer: 'Lo de antes.', sources: ['Resumen de ventas'], limited: false },
      ]),
    );
    const { user } = await open('/');
    await user.click(await screen.findByRole('button', BUTTON));
    expect(await screen.findByText('Lo de antes.')).toBeInTheDocument();
    expect(screen.getByText('Datos de: Resumen de ventas')).toBeInTheDocument();
  });

  it('otra tienda empieza de cero', async () => {
    sessionStorage.setItem(
      `tiendafy:asistente:${fixtureTenantId}`,
      JSON.stringify([{ question: 'Antes', answer: 'Lo de la otra tienda.', sources: [], limited: false }]),
    );
    const other = '11111111-1111-4111-8111-111111111111';
    localStorage.setItem('tiendafy.selectedStore', other);
    const tenants = fixture<{ items: Record<string, unknown>[] }>('/api/v1/tenants');
    const { user } = await open('/', {
      setup: (a) =>
        a.on('GET', '/api/v1/tenants', {
          ...tenants,
          items: [
            ...tenants.items,
            { ...tenants.items[0], id: other, name: 'Otra tienda', subdomain: 'otra' },
          ],
        }),
    });
    await user.click(await screen.findByRole('button', BUTTON));
    await screen.findByRole('textbox', { name: 'Tu pregunta' });
    expect(screen.queryByText('Lo de la otra tienda.')).toBeNull();
  });
});
