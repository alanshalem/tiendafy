/**
 * Integraciones de Configuración, flujo por flujo: WhatsApp automático
 * (conectar la Cloud API, mensaje de prueba, plantillas), e-mails automáticos
 * (activar, editar con vista previa) y Mercado Libre (conectar, sincronizar
 * stock y precios, facturar solo, importar ventas, vuelta del OAuth).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function open(path: string, heading: string, setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  expect(await screen.findByRole('heading', { name: heading }, { timeout: 5000 })).toBeInTheDocument();
  await settle(4);
  return { api, user };
}

const dialog = async (name?: string) => within(await screen.findByRole('dialog', name ? { name } : {}));
const lastBody = (api: MockApi, method: string, path: string) =>
  api.calls.filter((c) => c.method === method && c.path === path).at(-1)?.body;

describe('WhatsApp automático', () => {
  const WA = '/api/v1/whatsapp';
  const PATH = '/configuracion/whatsapp-automatico';
  const connected = {
    connected: true,
    phoneNumberId: '123456789012345',
    displayPhoneNumber: '+54 9 11 5555-4444',
    connectedAtUtc: '2026-10-01T00:00:00Z',
  };
  const templates = fixture<{ items: { type: string; label: string; enabled: boolean }[] }>(
    `${WA}/templates`,
  );
  const first = templates.items[0]!;

  it('conectar pide el Phone Number ID y el token; sin conexión no se activan mensajes', async () => {
    const { api, user } = await open(PATH, 'WhatsApp automático', (a) =>
      a.on('PUT', `${WA}/connection`, { detail: 'Meta rechazó el token.' }, 400),
    );
    expect(screen.getByText('Conectá WhatsApp primero para poder activar los mensajes.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: `Activar «${first.label}»` })).toBeDisabled();

    const connect = screen.getByRole('button', { name: 'Conectar' });
    expect(connect).toBeDisabled();
    await user.type(screen.getByLabelText('Phone Number ID'), ' 123456789012345 ');
    await user.type(screen.getByLabelText('Access token permanente'), 'EAAG-token');
    await user.click(connect);
    expect(await screen.findByText('Meta rechazó el token.')).toBeInTheDocument();
    expect(lastBody(api, 'PUT', `${WA}/connection`)).toEqual({
      phoneNumberId: '123456789012345',
      accessToken: 'EAAG-token',
    });

    api.on('PUT', `${WA}/connection`, {});
    await user.type(screen.getByLabelText('Número visible'), '+54 9 11 5555-4444');
    await user.click(connect);
    expect(await screen.findByText('¡WhatsApp conectado!')).toBeInTheDocument();
    expect(lastBody(api, 'PUT', `${WA}/connection`)).toMatchObject({
      displayPhoneNumber: '+54 9 11 5555-4444',
    });
  });

  it('conectado: mensaje de prueba, actualizar credenciales y desconectar', async () => {
    const { api, user } = await open(PATH, 'WhatsApp automático', (a) => {
      a.on('GET', `${WA}/connection`, connected);
      a.on('POST', `${WA}/test`, { detail: 'El número no está registrado como tester.' }, 400);
    });
    expect(screen.getByText('+54 9 11 5555-4444')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Enviar mensaje de prueba/ }));
    let d = await dialog('Enviar mensaje de prueba');
    const send = d.getByRole('button', { name: /Enviar/ });
    await user.click(send); // sin número no hace nada
    expect(api.calls.some((c) => c.path === `${WA}/test`)).toBe(false);
    await user.type(d.getByLabelText('Número de destino'), '+5491155554444');
    await user.click(send);
    expect(await screen.findByText('El número no está registrado como tester.')).toBeInTheDocument();
    api.on('POST', `${WA}/test`, { sent: true, to: '+5491155554444' });
    await user.click(send);
    expect(await screen.findByText('Mensaje de prueba enviado a +5491155554444')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Actualizar credenciales: el formulario vuelve con lo cargado, y se puede cancelar.
    await user.click(screen.getByRole('button', { name: /Actualizar credenciales/ }));
    expect(screen.getByLabelText('Phone Number ID')).toHaveValue('123456789012345');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText('Phone Number ID')).not.toBeInTheDocument();

    api.on('DELETE', `${WA}/connection`, { detail: 'No se pudo hablar con Meta.' }, 502);
    await user.click(screen.getByRole('button', { name: /Desconectar/ }));
    d = await dialog();
    await user.click(d.getByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByText('No se pudo hablar con Meta.')).toBeInTheDocument();
    api.on('DELETE', `${WA}/connection`, {});
    await user.click(screen.getByRole('button', { name: /Desconectar/ }));
    await user.click((await dialog()).getByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByText('WhatsApp desconectado')).toBeInTheDocument();
  });

  it('activar un mensaje y configurar su plantilla de Meta', async () => {
    const { api, user } = await open(PATH, 'WhatsApp automático', (a) => {
      a.on('GET', `${WA}/connection`, connected);
      a.on('PUT', `${WA}/templates/${first.type}`, {});
    });
    await user.click(screen.getByRole('switch', { name: `Activar «${first.label}»` }));
    expect(
      await screen.findByText(first.enabled ? 'Mensaje desactivado' : 'Mensaje activado'),
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /Configurar plantilla/ })[0]!);
    const d = await dialog(`Configurar: ${first.label}`);
    const name = d.getByLabelText('Nombre de la plantilla en Meta');
    await user.clear(name);
    await user.type(name, ' compra_ok ');
    await user.clear(d.getByLabelText('Idioma'));
    await user.click(d.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Plantilla guardada')).toBeInTheDocument();
    // Sin idioma queda el de Argentina.
    expect(lastBody(api, 'PUT', `${WA}/templates/${first.type}`)).toMatchObject({
      metaTemplateName: 'compra_ok',
      languageCode: 'es_AR',
    });

    api.on('PUT', `${WA}/templates/${first.type}`, { detail: 'Plantilla no aprobada.' }, 400);
    await user.click(screen.getByRole('switch', { name: `Activar «${first.label}»` }));
    expect(await screen.findByText('Plantilla no aprobada.')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Configurar plantilla/ })[0]!);
    await user.click((await dialog()).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('e-mails automáticos', () => {
  const PATH = '/configuracion/emails-automaticos';
  const templates = fixture<{ items: { type: string; label: string; enabled: boolean }[] }>(
    '/api/v1/email-templates',
  );
  const first = templates.items[0]!;

  it('activar, editar el asunto con vista previa y guardar', async () => {
    const { api, user } = await open(PATH, 'E-mails automáticos', (a) => {
      a.on('PUT', `/api/v1/email-templates/${first.type}`, {});
      a.on('POST', '/api/v1/email-templates/preview', { subject: 'Vista previa', html: '<p>Hola</p>' });
    });
    await user.click(screen.getByRole('switch', { name: `Activar «${first.label}»` }));
    expect(
      await screen.findByText(first.enabled ? 'Email desactivado' : 'Email activado'),
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /Editar contenido/ })[0]!);
    const d = await dialog(`Editar: ${first.label}`);
    const subject = d.getByLabelText('Asunto');
    await user.clear(subject);
    await user.type(subject, 'Volvé a tu carrito');
    await waitFor(
      () =>
        expect(
          (lastBody(api, 'POST', '/api/v1/email-templates/preview') as { subject: string } | undefined)
            ?.subject,
        ).toBe('Volvé a tu carrito'),
      { timeout: 3000 },
    );
    await user.click(d.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Plantilla guardada')).toBeInTheDocument();
    expect(lastBody(api, 'PUT', `/api/v1/email-templates/${first.type}`)).toMatchObject({
      subject: 'Volvé a tu carrito',
    });
  });

  it('los emails de seguridad de la cuenta no tienen interruptor: salen siempre', async () => {
    const tpl = (type: string, label: string, alwaysOn: boolean) => ({
      type,
      group: 'Cuenta de usuarios',
      label,
      description: 'x',
      enabled: true,
      alwaysOn,
      subject: 'Asunto',
      bodyHtml: '<p>x</p>',
    });
    await open(PATH, 'E-mails automáticos', (a) =>
      a.on('GET', '/api/v1/email-templates', {
        items: [
          tpl('activacion-cuenta', 'Activación de cuenta', true),
          { ...tpl('carritos-abandonados', 'Carritos abandonados', false), group: 'Promociones' },
        ],
      }),
    );
    expect(screen.queryByRole('switch', { name: 'Activar «Activación de cuenta»' })).not.toBeInTheDocument();
    expect(screen.getByText('Siempre se envía')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Activar «Carritos abandonados»' })).toBeInTheDocument();
    // El texto se edita igual.
    expect(screen.getAllByRole('button', { name: /Editar contenido/ })).toHaveLength(2);
  });

  it('si guardar falla, lo dice; si la vista previa falla, no rompe', async () => {
    const { user } = await open(PATH, 'E-mails automáticos', (a) => {
      a.on('PUT', `/api/v1/email-templates/${first.type}`, {}, 500);
      a.on('POST', '/api/v1/email-templates/preview', {}, 500);
    });
    await user.click(screen.getByRole('switch', { name: `Activar «${first.label}»` }));
    expect(await screen.findByText('No se pudo guardar')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Editar contenido/ })[0]!);
    const d = await dialog();
    await settle(30);
    await user.click(d.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Mercado Libre (configuración)', () => {
  const MELI = '/api/v1/admin/meli';
  const PATH = '/configuracion/mercadolibre';
  type Conn = Record<string, unknown>;
  const demo = fixture<Conn>(`${MELI}/connection`);
  const real: Conn = {
    ...demo,
    isDemo: false,
    connectedAtUtc: '2026-10-01T00:00:00Z',
    linkedItems: 0,
    ordersImported: 5,
    lastOrderAtUtc: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    lastNotificationAtUtc: null,
    stuckNotifications: 2,
  };

  it('sin conectar: conectar inicia el OAuth (y sin app configurada no se puede)', async () => {
    const { api, user } = await open(PATH, 'Mercado Libre', (a) => {
      a.on('GET', `${MELI}/connection`, { ...demo, connected: false, isDemo: false });
      a.on('POST', `${MELI}/connect`, { detail: 'La app de ML no está aprobada.' }, 400);
    });
    const connect = screen.getAllByRole('button').find((b) => /Conectar/.test(b.textContent ?? ''))!;
    await user.click(connect);
    expect(await screen.findByText('La app de ML no está aprobada.')).toBeInTheDocument();
    api.on('POST', `${MELI}/connect`, { authUrl: 'https://auth.mercadolibre.com.ar/authorization' });
    await user.click(connect);
    await waitFor(() => expect(api.calls.filter((c) => c.path === `${MELI}/connect`)).toHaveLength(2));
  });

  it('sin la app configurada en la plataforma, lo explica', async () => {
    await open(PATH, 'Mercado Libre', (a) =>
      a.on('GET', `${MELI}/connection`, { ...demo, connected: false, isDemo: false, available: false }),
    );
    expect(screen.getByText(/La integración todavía no está configurada/)).toBeInTheDocument();
  });

  it('conectada: sincronizar stock y precios, colchón, recargo y facturación', async () => {
    const { api, user } = await open(PATH, 'Mercado Libre', (a) => {
      a.on('GET', `${MELI}/connection`, real);
      a.on('PUT', `${MELI}/settings`, {});
    });
    expect(screen.getByText(/Hay 2 avisos de Mercado Libre/)).toBeInTheDocument();
    expect(screen.getByText('Hace 3 días')).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: /Sincronizar stock/ }));
    expect(await screen.findByText('Configuración guardada')).toBeInTheDocument();
    // Encendida sin publicaciones vinculadas: avisa que no va a pasar nada.
    expect(screen.getByText(/no hay ninguna publicación vinculada/)).toBeInTheDocument();

    const buffer = screen.getByLabelText('Colchón anti-sobreventa (unidades)');
    await user.clear(buffer);
    await user.type(buffer, '3');
    await user.tab();
    await waitFor(() =>
      expect(lastBody(api, 'PUT', `${MELI}/settings`)).toMatchObject({ stockBufferUnits: 3 }),
    );

    await user.click(screen.getByRole('switch', { name: /Sincronizar precios/ }));
    const markup = await screen.findByLabelText('Recargo para Mercado Libre (%)');
    await user.clear(markup);
    await user.type(markup, '15');
    await user.tab();
    await waitFor(() =>
      expect(lastBody(api, 'PUT', `${MELI}/settings`)).toMatchObject({ priceMarkupPct: 15 }),
    );

    // Salir del campo sin cambiar el valor no guarda de nuevo.
    const saves = api.calls.filter((c) => c.path === `${MELI}/settings`).length;
    await user.click(markup);
    await user.tab();
    expect(api.calls.filter((c) => c.path === `${MELI}/settings`)).toHaveLength(saves);

    await user.click(screen.getByRole('switch', { name: /Facturar automáticamente/ }));
    await waitFor(() =>
      expect(lastBody(api, 'PUT', `${MELI}/settings`)).toMatchObject({ autoInvoiceEnabled: true }),
    );

    api.on('PUT', `${MELI}/settings`, { detail: 'Falta configurar la facturación.' }, 400);
    await user.click(screen.getByRole('switch', { name: /Facturar automáticamente/ }));
    expect(await screen.findByText('Falta configurar la facturación.')).toBeInTheDocument();
  });

  it('importar las últimas ventas: nuevas, al día, demo o error', async () => {
    const { api, user } = await open(PATH, 'Mercado Libre', (a) => {
      a.on('GET', `${MELI}/connection`, real);
      a.on('POST', `${MELI}/orders/refresh`, { imported: 4, demo: false });
    });
    const refresh = screen.getByRole('button', { name: /Importar últimas ventas/ });
    await user.click(refresh);
    expect(await screen.findByText('Se importaron 4 ventas de Mercado Libre.')).toBeInTheDocument();
    api.on('POST', `${MELI}/orders/refresh`, { imported: 0, demo: false });
    await user.click(refresh);
    expect(await screen.findByText('Ya estabas al día: no había ventas nuevas.')).toBeInTheDocument();
    api.on('POST', `${MELI}/orders/refresh`, { imported: 0, demo: true });
    await user.click(refresh);
    expect(await screen.findByText(/Cuenta de ejemplo: no hay nada que traer/)).toBeInTheDocument();
    api.on('POST', `${MELI}/orders/refresh`, { detail: 'Mercado Libre no responde.' }, 502);
    await user.click(refresh);
    expect(await screen.findByText('Mercado Libre no responde.')).toBeInTheDocument();
  });

  it('desconectar pide confirmación; si falla, lo dice', async () => {
    const { api, user } = await open(PATH, 'Mercado Libre', (a) => {
      a.on('DELETE', `${MELI}/connection`, { detail: 'No se pudo.' }, 500);
    });
    expect(screen.getByText(/Esta cuenta es de demostración/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desconectar' }));
    await user.click((await dialog()).getByRole('button', { name: 'Cancelar' }));
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Desconectar' }));
    await user.click((await dialog()).getByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByText('No se pudo.')).toBeInTheDocument();
    api.on('DELETE', `${MELI}/connection`, {});
    await user.click(screen.getByRole('button', { name: 'Desconectar' }));
    await user.click((await dialog()).getByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByText('Cuenta desconectada')).toBeInTheDocument();
  });

  it('la vuelta del OAuth avisa; si la conexión no carga, ofrece reintentar', async () => {
    await open(`${PATH}?meli=connected`, 'Mercado Libre');
    expect(await screen.findByText('¡Cuenta de Mercado Libre conectada!')).toBeInTheDocument();
  });

  it('la vuelta del OAuth con error lo dice', async () => {
    await open(`${PATH}?meli=error`, 'Mercado Libre');
    expect(await screen.findByText('No se pudo conectar la cuenta de Mercado Libre.')).toBeInTheDocument();
  });

  it('si la conexión no carga, lo dice y deja reintentar', async () => {
    const { api, user } = await open(PATH, 'Mercado Libre', (a) =>
      a.on('GET', `${MELI}/connection`, { detail: 'Servicio caído.' }, 503),
    );
    expect(screen.getByText('Servicio caído.')).toBeInTheDocument();
    api.on('GET', `${MELI}/connection`, demo);
    await user.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText(/Esta cuenta es de demostración/)).toBeInTheDocument();
  });
});
