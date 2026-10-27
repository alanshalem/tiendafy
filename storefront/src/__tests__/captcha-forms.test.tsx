/**
 * Newsletter, "Avisame cuando ingrese" y escribir una opinión llevan el mismo
 * captcha que contacto y registro (Cloudflare Turnstile): con la plataforma
 * configurada, el botón espera el token y el token viaja con el envío; si el
 * servidor lo rechaza, se pide otro (un token de Turnstile sirve una vez).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewsletterForm } from '../components/store/NewsletterForm';
import { BackInStock } from '../components/store/BackInStock';
import { ReviewWriter } from '../components/store/ReviewWriter';
import { mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';

const user = () => userEvent.setup({ delay: null, pointerEventsCheck: 0 });

let api: MockApi;
let crashes: () => unknown[][];
let issued: number;

/** Turnstile "cargado": cada render del widget resuelve con un token nuevo. */
function turnstileOn() {
  api.on('GET', '/api/v1/captcha/config', { enabled: true, siteKey: '0x-site' });
  const script = document.createElement('script');
  script.id = 'cf-turnstile-script';
  document.head.appendChild(script);
  (window as unknown as { turnstile: unknown }).turnstile = {
    render: (_el: HTMLElement, opts: { callback: (t: string) => void }) => {
      issued += 1;
      setTimeout(() => opts.callback(`tok-${issued}`), 0);
    },
  };
}

beforeEach(() => {
  api = mockApi();
  crashes = watchCrashes();
  localStorage.clear();
  issued = 0;
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  document.getElementById('cf-turnstile-script')?.remove();
  delete (window as unknown as { turnstile?: unknown }).turnstile;
  vi.restoreAllMocks();
});

const bodyOf = (path: string) =>
  api.calls
    .filter((c) => c.method === 'POST' && c.path === path)
    .map((c) => c.body as Record<string, unknown>);

describe('newsletter', () => {
  it('arma el captcha al escribir y manda el token', async () => {
    turnstileOn();
    api.on('POST', '/api/v1/newsletter', { ok: true });
    const u = user();
    renderInStore(<NewsletterForm source="footer" />);
    await settle(1);
    // Sin escribir no se pide nada a Turnstile (el pie está en todas las páginas).
    expect(api.calls.some((c) => c.path === '/api/v1/captcha/config')).toBe(false);

    await u.type(screen.getByLabelText('Email'), 'ana@mail.com');
    const button = screen.getByRole('button', { name: 'Suscribirme' });
    await waitFor(() => expect(button).toBeEnabled());
    await u.click(button);

    expect(await screen.findByRole('status')).toHaveTextContent('¡Listo!');
    expect(bodyOf('/api/v1/newsletter')[0]).toMatchObject({ email: 'ana@mail.com', captcha: 'tok-1' });
  });

  it('si el servidor rechaza el captcha, pide otro token para el reintento', async () => {
    turnstileOn();
    api.on('POST', '/api/v1/newsletter', { title: 'Captcha.Failed' }, 400);
    const u = user();
    renderInStore(<NewsletterForm source="footer" />);
    await u.type(screen.getByLabelText('Email'), 'ana@mail.com');
    const button = screen.getByRole('button', { name: 'Suscribirme' });
    await waitFor(() => expect(button).toBeEnabled());
    await u.click(button);
    expect(await screen.findByText('No se pudo. Probá de nuevo.')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Suscribirme' })).toBeEnabled());
    await u.click(screen.getByRole('button', { name: 'Suscribirme' }));
    await settle(1);
    expect(bodyOf('/api/v1/newsletter').map((b) => b.captcha)).toEqual(['tok-1', 'tok-2']);
  });

  it('sin captcha configurado sale igual, sin token', async () => {
    api.on('POST', '/api/v1/newsletter', { ok: true });
    const u = user();
    renderInStore(<NewsletterForm source="footer" />);
    await u.type(screen.getByLabelText('Email'), 'ana@mail.com');
    const button = screen.getByRole('button', { name: 'Suscribirme' });
    await waitFor(() => expect(button).toBeEnabled());
    await u.click(button);
    expect(await screen.findByRole('status')).toHaveTextContent('¡Listo!');
    expect(bodyOf('/api/v1/newsletter')[0]).not.toHaveProperty('captcha');
  });
});

describe('avisame cuando ingrese', () => {
  it('espera el captcha y manda el token', async () => {
    turnstileOn();
    api.on('POST', '/api/v1/back-in-stock', { ok: true });
    const u = user();
    renderInStore(<BackInStock variantId="v-agotada" />);
    await u.type(screen.getByLabelText('Tu email para el aviso'), 'ana@mail.com');
    const button = screen.getByRole('button', { name: 'Avisarme' });
    await waitFor(() => expect(button).toBeEnabled());
    await u.click(button);

    expect(await screen.findByRole('status')).toHaveTextContent('ana@mail.com');
    expect(bodyOf('/api/v1/back-in-stock')[0]).toMatchObject({ variantId: 'v-agotada', captcha: 'tok-1' });
  });
});

describe('escribir una opinión', () => {
  it('manda el token del captcha con la opinión', async () => {
    turnstileOn();
    api.on('GET', '/api/v1/reviews/invite', {
      orderId: 'o1',
      authorName: 'Ana P.',
      items: [
        {
          orderItemId: 'i1',
          productId: 'p1',
          productName: 'Mate',
          productSlug: 'mate',
          image: null,
          variantLabel: null,
          canReview: true,
          review: null,
        },
      ],
    });
    api.on('POST', '/api/v1/reviews', { id: 'nuevo', status: 'approved' });
    const u = user();
    renderInStore(<ReviewWriter token="tok" orderId={null} />);
    expect(await screen.findByText('Ana P.')).toBeInTheDocument();

    await u.click(screen.getByRole('radio', { name: /5 estrellas/ }));
    await u.type(screen.getByLabelText('Tu opinión'), 'Excelente, lo recomiendo.');
    const button = screen.getByRole('button', { name: 'Publicar mi opinión' });
    await waitFor(() => expect(button).toBeEnabled());
    await u.click(button);

    expect(await screen.findByText('¡Gracias! Tu opinión ya está publicada.')).toBeInTheDocument();
    expect(bodyOf('/api/v1/reviews')[0]).toMatchObject({ token: 'tok', rating: 5, captcha: 'tok-1' });
  });
});
