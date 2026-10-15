/**
 * Lo que llega a Sentry (del panel o de la tienda) no lleva los secretos que
 * viajan en una URL: el link de restablecer la clave, el link firmado del
 * seguimiento, la vista previa del editor, un token de Telegram o de Meta.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { redactSecrets, scrubSentryBreadcrumb, scrubSentryEvent } from '@tiendafy/types';

const sentry = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }));
vi.mock('@sentry/react', () => sentry);

const BOT = '123456789:AAH-x_YzSecretoDelBot0123456789abcd';

describe('redactSecrets', () => {
  it('tapa el token del bot de Telegram en el path', () => {
    expect(redactSecrets(`https://api.telegram.org/bot${BOT}/sendMessage`)).toBe(
      'https://api.telegram.org/bot[Filtered]/sendMessage',
    );
  });

  it('tapa el access_token de Meta y deja el resto de la query', () => {
    expect(redactSecrets('https://graph.facebook.com/v21.0/me?fields=id&access_token=EAAG&limit=5')).toBe(
      'https://graph.facebook.com/v21.0/me?fields=id&access_token=[Filtered]&limit=5',
    );
  });

  it.each([
    [
      'https://tienda.test/seguimiento?t=CfDJ8firmado&pedido=1001',
      'https://tienda.test/seguimiento?t=[Filtered]&pedido=1001',
    ],
    ['https://tienda.test/preview?pt=firmado', 'https://tienda.test/preview?pt=[Filtered]'],
    [
      'https://panel.test/restablecer?email=a%40b.com&token=CfDJ8',
      'https://panel.test/restablecer?email=a%40b.com&token=[Filtered]',
    ],
    [
      'https://x.test/a?client_secret=s&key=k&password=p',
      'https://x.test/a?client_secret=[Filtered]&key=[Filtered]&password=[Filtered]',
    ],
  ])('%s', (url, expected) => {
    expect(redactSecrets(url)).toBe(expected);
  });

  it.each([
    'https://tienda.test/productos?categoria=remeras&page=2&sort=price',
    'https://tienda.test/bottles/botines?keyword=rojo&monkey=1',
    'https://api.telegram.org/getMe',
    'Algo salió mal',
    '',
  ])('una URL sin secretos queda igual: %s', (text) => {
    expect(redactSecrets(text)).toBe(text);
  });
});

describe('scrubbers', () => {
  it('el breadcrumb de una navegación o un fetch sale sin secretos', () => {
    const nav = scrubSentryBreadcrumb({
      category: 'navigation',
      data: { from: '/cuenta', to: '/cuenta/reset?token=CfDJ8' },
    });
    expect(nav.data).toEqual({ from: '/cuenta', to: '/cuenta/reset?token=[Filtered]' });

    const fetch = scrubSentryBreadcrumb({
      category: 'fetch',
      data: { url: `https://api.telegram.org/bot${BOT}/getMe`, method: 'GET', status_code: 200 },
    });
    expect(fetch.data).toEqual({
      url: 'https://api.telegram.org/bot[Filtered]/getMe',
      method: 'GET',
      status_code: 200,
    });
  });

  it('el error sale sin secretos en la URL, la query, los headers, la excepción ni los spans', () => {
    const event = scrubSentryEvent({
      request: {
        url: 'https://tienda.test/seguimiento?t=CfDJ8',
        query_string: [
          ['t', 'CfDJ8'],
          ['pedido', '1001'],
        ] as [string, string][],
        headers: { Authorization: 'Bearer x', Referer: 'https://tienda.test/preview?pt=firmado' },
      },
      exception: { values: [{ value: 'Falló https://x.test/a?access_token=EAAG' }] },
      breadcrumbs: [{ data: { url: 'https://x.test/a?secret=s' } }],
      spans: [{ description: 'GET https://x.test/a?token=x', data: { 'http.query': 'token=x&a=1' } }],
    });

    expect(event.request!.url).toBe('https://tienda.test/seguimiento?t=[Filtered]');
    expect(event.request!.query_string).toEqual([
      ['t', '[Filtered]'],
      ['pedido', '1001'],
    ]);
    expect(event.request!.headers).toEqual({
      Authorization: '[Filtered]',
      Referer: 'https://tienda.test/preview?pt=[Filtered]',
    });
    expect(event.exception!.values![0]!.value).toBe('Falló https://x.test/a?access_token=[Filtered]');
    expect(event.breadcrumbs![0]!.data).toEqual({ url: 'https://x.test/a?secret=[Filtered]' });
    expect(event.spans![0]).toEqual({
      description: 'GET https://x.test/a?token=[Filtered]',
      data: { 'http.query': 'token=[Filtered]&a=1' },
    });
  });
});

describe('initSentry', () => {
  afterEach(() => {
    delete window.__TIENDAFY_CONFIG__;
    vi.resetModules();
  });

  it('sin DSN no inicializa nada', async () => {
    vi.resetModules();
    const { initSentry } = await import('../lib/reportError');
    expect(initSentry()).toBeUndefined();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('con DSN inicializa con los scrubbers enganchados', async () => {
    vi.resetModules();
    window.__TIENDAFY_CONFIG__ = { sentryDsn: 'https://k@o.ingest/1', envName: 'staging' };
    const { initSentry } = await import('../lib/reportError');
    await initSentry();

    expect(sentry.init).toHaveBeenCalledTimes(1);
    const options = sentry.init.mock.calls[0]![0] as {
      dsn: string;
      environment: string;
      beforeSend: (e: { request: { url: string } }) => { request: { url: string } };
      beforeBreadcrumb: unknown;
      beforeSendTransaction: unknown;
    };
    expect(options).toMatchObject({ dsn: 'https://k@o.ingest/1', environment: 'staging' });
    expect(options.beforeBreadcrumb).toBeTypeOf('function');
    expect(options.beforeSendTransaction).toBeTypeOf('function');
    expect(
      options.beforeSend({ request: { url: 'https://panel.test/restablecer?token=x' } }).request.url,
    ).toBe('https://panel.test/restablecer?token=[Filtered]');
  });
});
