/**
 * La medición de terceros de la tienda montada de verdad: el aviso de
 * consentimiento, qué scripts se cargan (y con qué identificador), las
 * páginas vistas al navegar, la venta en la pantalla de "listo" — y las tres
 * reglas que no se negocian: nada en la página de pago, nada sin permiso si
 * el comercio lo pide, y la señal "no me rastreen" del navegador es un no.
 *
 * La regla en sí (shouldLoad / shouldAskConsent) tiene su test unitario en
 * lib/__tests__/tracking.test.ts; acá se prueba el componente que la aplica.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackingTags } from '../components/store/TrackingTags';
import { fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { nav } from '../test/next';
import { settle } from '../test/explore';

const TAGS = {
  requireConsent: true,
  ga4Id: 'G-ABC1234',
  googleAdsId: 'AW-1234567',
  metaPixelId: '1234567890',
  clarityId: 'abc12def',
};

type Win = Window & {
  dataLayer?: IArguments[];
  gtag?: unknown;
  fbq?: { queue: unknown[][] };
  _fbq?: unknown;
  clarity?: { q?: unknown[][] };
  navigator: Navigator & { globalPrivacyControl?: boolean };
};
const win = window as unknown as Win;

let api: MockApi;

async function mount(config: object | null = TAGS, path = '/') {
  nav.at(path);
  if (config) api.on('GET', '/api/v1/tracking', config);
  const view = render(<TrackingTags tenantId={fixtureTenantId} />);
  await settle(2);
  const go = async (to: string) => {
    nav.at(to);
    view.rerender(<TrackingTags tenantId={fixtureTenantId} />);
    await settle(1);
  };
  return { ...view, go };
}

const script = (id: string) => document.getElementById(id) as HTMLScriptElement | null;
const gtagCalls = () => (win.dataLayer ?? []).map((args) => Array.from(args));
const fbqCalls = () => win.fbq?.queue ?? [];

beforeEach(() => {
  api = mockApi();
});
afterEach(() => {
  for (const id of ['tf-gtag', 'tf-fbq', 'tf-clarity']) script(id)?.remove();
  delete win.dataLayer;
  delete win.gtag;
  delete win.fbq;
  delete win._fbq;
  delete win.clarity;
  delete win.navigator.globalPrivacyControl;
  vi.restoreAllMocks();
});

describe('medición con consentimiento', () => {
  it('pregunta antes de cargar nada; al aceptar carga cada herramienta con su id', async () => {
    await mount();
    expect(screen.getByRole('dialog', { name: 'Preferencias de medición' })).toBeInTheDocument();
    expect(script('tf-gtag')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--tf-consent-h')).toMatch(/px$/);

    await userEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    await settle(1);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(`tiendafy.consent.${fixtureTenantId}`)).toBe('granted');
    expect(script('tf-gtag')!.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-ABC1234');
    expect(script('tf-fbq')!.src).toBe('https://connect.facebook.net/en_US/fbevents.js');
    expect(script('tf-clarity')!.src).toBe('https://www.clarity.ms/tag/abc12def');
    expect(gtagCalls()).toEqual(
      expect.arrayContaining([
        ['config', 'G-ABC1234'],
        ['config', 'AW-1234567'],
      ]),
    );
    expect(fbqCalls()).toEqual([
      ['init', '1234567890'],
      ['track', 'PageView'],
    ]);
    expect(document.documentElement.style.getPropertyValue('--tf-consent-h')).toBe('');
  });

  it('al rechazar no carga nada y no vuelve a preguntar', async () => {
    const { unmount } = await mount();
    await userEvent.click(screen.getByRole('button', { name: 'No, gracias' }));
    await settle(1);
    expect(script('tf-gtag')).toBeNull();
    unmount();

    await mount();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(script('tf-gtag')).toBeNull();
  });

  it('con la decisión ya guardada carga directo', async () => {
    localStorage.setItem(`tiendafy.consent.${fixtureTenantId}`, 'granted');
    await mount();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(script('tf-gtag')).not.toBeNull();
  });

  it('la señal "no me rastreen" del navegador es un no, sin preguntar', async () => {
    win.navigator.globalPrivacyControl = true;
    await mount();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(script('tf-gtag')).toBeNull();
  });

  it('si el comercio no pide consentimiento, carga sin preguntar', async () => {
    await mount({ ...TAGS, requireConsent: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(script('tf-gtag')).not.toBeNull();
  });
});

describe('medición: reglas', () => {
  it('nunca en la página de pago: ni aviso ni scripts', async () => {
    localStorage.setItem(`tiendafy.consent.${fixtureTenantId}`, 'granted');
    await mount(TAGS, '/checkout');
    expect(script('tf-gtag')).toBeNull();
    expect(script('tf-fbq')).toBeNull();

    localStorage.clear();
    await mount(TAGS, '/checkout');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un identificador con forma rara no se usa nunca', async () => {
    await mount({
      requireConsent: false,
      ga4Id: 'G-<script>',
      googleAdsId: 'AW-x',
      metaPixelId: '123',
      clarityId: 'A B',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelectorAll('script[id^="tf-"]')).toHaveLength(0);
  });

  it('solo Ads usa gtag con su id; sin configuración no hace nada', async () => {
    await mount({
      requireConsent: false,
      ga4Id: null,
      googleAdsId: 'AW-1234567',
      metaPixelId: null,
      clarityId: null,
    });
    expect(script('tf-gtag')!.src).toContain('id=AW-1234567');
    expect(script('tf-fbq')).toBeNull();
  });

  it('si la configuración no llega, no carga nada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await mount(null);
    expect(document.querySelectorAll('script[id^="tf-"]')).toHaveLength(0);
  });
});

describe('medición: navegación y venta', () => {
  it('cuenta cada pantalla al navegar y la venta una sola vez en "listo"', async () => {
    localStorage.setItem(`tiendafy.consent.${fixtureTenantId}`, 'granted');
    const { go } = await mount();

    await go('/productos');
    expect(gtagCalls()).toContainEqual(['event', 'page_view', { page_path: '/productos' }]);
    expect(fbqCalls().filter(([e]) => e === 'track')).toHaveLength(2);

    sessionStorage.setItem(
      'tiendafy.purchase',
      JSON.stringify({ orderId: 'o-1', value: 3000, currency: 'ARS' }),
    );
    await go('/checkout/success');
    expect(gtagCalls()).toContainEqual([
      'event',
      'purchase',
      { transaction_id: 'o-1', value: 3000, currency: 'ARS' },
    ]);
    expect(fbqCalls()).toContainEqual(['track', 'Purchase', { value: 3000, currency: 'ARS' }]);
    expect(sessionStorage.getItem('tiendafy.purchase')).toBeNull();

    // Recargar "listo" no la mide de nuevo; un dato roto tampoco.
    await go('/');
    sessionStorage.setItem('tiendafy.purchase', '{"value":"mucho"}');
    await go('/checkout/success');
    expect(gtagCalls().filter(([, e]) => e === 'purchase')).toHaveLength(1);
  });

  it('Clarity encola sus llamadas hasta que baja el script', async () => {
    await mount({ ...TAGS, requireConsent: false });
    (win.clarity as unknown as (...a: unknown[]) => void)('set', 'tienda', 'seed');
    expect(win.clarity!.q).toEqual([['set', 'tienda', 'seed']]);
  });
});
