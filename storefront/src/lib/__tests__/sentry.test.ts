/**
 * Sentry se baja solo si hay DSN. Con el import estático el SDK (~73 KB gzip)
 * viajaba a cada visitante; y el servidor leía una variable que el contenedor
 * no pasa, así que nunca reportaba.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }));
vi.mock('@sentry/nextjs', () => sentry);

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.resetModules();
  sentry.init.mockClear();
  sentry.captureException.mockClear();
  delete window.__TIENDAFY_CONFIG__;
});
afterEach(() => vi.unstubAllEnvs());

describe('browser', () => {
  it('sin DSN no inicializa nada', async () => {
    await import('../../instrumentation-client');
    await settle();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('con DSN inicializa con el ambiente de runtime', async () => {
    window.__TIENDAFY_CONFIG__ = { sentryDsn: 'https://k@o.ingest/1', envName: 'staging' };
    await import('../../instrumentation-client');
    await vi.waitFor(() =>
      expect(sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({ dsn: 'https://k@o.ingest/1', environment: 'staging' }),
      ),
    );
  });

  it('reportError: sin DSN no hace nada; con DSN manda el error', async () => {
    const { reportError } = await import('../report-error');
    reportError(new Error('x'), { tags: { area: 't' } });
    await settle();
    expect(sentry.captureException).not.toHaveBeenCalled();

    window.__TIENDAFY_CONFIG__ = { sentryDsn: 'https://k@o.ingest/1' };
    reportError(new Error('y'), { tags: { area: 't' } });
    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledTimes(1));
  });
});

describe('servidor', () => {
  it('toma el DSN de PUBLIC_SENTRY_DSN, el que pasa el contenedor', async () => {
    vi.stubEnv('PUBLIC_SENTRY_DSN', 'https://k@o.ingest/2');
    vi.stubEnv('APP_ENV', 'production');
    const { register } = await import('../../instrumentation');
    await register();
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://k@o.ingest/2', environment: 'production' }),
    );
  });

  it('sin DSN, nada', async () => {
    vi.stubEnv('PUBLIC_SENTRY_DSN', '');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    vi.stubEnv('SENTRY_DSN', '');
    const { register } = await import('../../instrumentation');
    await register();
    expect(sentry.init).not.toHaveBeenCalled();
  });
});
