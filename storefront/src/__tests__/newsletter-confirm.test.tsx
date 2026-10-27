/**
 * La página del link "Confirmá tu suscripción" (doble confirmación del
 * newsletter): confirma recién con el botón, saca el token de la URL y, si el
 * link no sirve, dice por qué.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewsletterConfirm } from '../components/store/NewsletterConfirm';
import { NewsletterForm } from '../components/store/NewsletterForm';
import { fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { nav } from '../test/next';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';
import { isUnmeasuredPage } from '../components/store/TrackingTags';

let api: MockApi;
let crashes: () => unknown[][];

beforeEach(() => {
  api = mockApi();
  crashes = watchCrashes();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function show() {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderInStore(<NewsletterConfirm />);
  await settle(2);
  return user;
}

describe('confirmar la suscripción', () => {
  it('confirma con el botón (no al abrir) y saca el token de la URL', async () => {
    nav.at('/suscripcion/confirmar?token=tok-news');
    api.on('POST', '/api/v1/newsletter/confirm', { ok: true });
    const user = await show();

    // Abrir la página no confirma nada: un filtro de correo que abre el link no suscribe a nadie.
    expect(api.calls.some((c) => c.path === '/api/v1/newsletter/confirm')).toBe(false);
    expect(window.location.search).not.toContain('tok-news');

    await user.click(screen.getByRole('button', { name: 'Confirmar suscripción' }));
    await settle(1);
    expect(api.calls.find((c) => c.path === '/api/v1/newsletter/confirm')?.body).toEqual({
      token: 'tok-news',
    });
    expect(screen.getByRole('status')).toHaveTextContent('ya estás suscripto');
  });

  it('un link usado o vencido muestra el motivo del servidor', async () => {
    nav.at('/suscripcion/confirmar?token=viejo');
    api.on(
      'POST',
      '/api/v1/newsletter/confirm',
      {
        title: 'Newsletter.TokenExpired',
        detail: 'El link venció. Volvé a suscribirte para recibir uno nuevo.',
      },
      400,
    );
    const user = await show();
    await user.click(screen.getByRole('button', { name: 'Confirmar suscripción' }));
    await settle(1);
    expect(
      screen.getByText('El link venció. Volvé a suscribirte para recibir uno nuevo.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar suscripción' })).toBeEnabled();
  });

  it('sin token no muestra el botón', async () => {
    nav.at('/suscripcion/confirmar');
    await show();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/Link inválido/)).toBeInTheDocument();
  });

  it('la página del link no carga la medición de terceros', () => {
    expect(isUnmeasuredPage('/suscripcion/confirmar')).toBe(true);
  });
});

describe('suscribirse', () => {
  it('avisa que hay que confirmar con el mail, también debajo del mensaje propio', async () => {
    api.on('POST', '/api/v1/newsletter', { ok: true });
    const user = userEvent.setup({ delay: null });
    renderInStore(
      <NewsletterForm source="home" tenantId={fixtureTenantId} successMessage="¡Gracias por sumarte!" />,
    );
    await user.type(screen.getByLabelText('Email'), 'ana@mail.com');
    const button = screen.getByRole('button', { name: 'Suscribirme' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('¡Gracias por sumarte!');
    expect(status).toHaveTextContent('Te mandamos un mail para confirmar tu suscripción');
  });
});
