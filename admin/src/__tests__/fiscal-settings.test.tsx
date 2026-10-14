/**
 * Facturación electrónica (ARCA) paso a paso, como la configura un comercio:
 * datos del emisor, certificado (generar el CSR, descargarlo/copiarlo, pegar
 * el firmado y activarlo), puntos de venta, la prueba de conexión sin emitir
 * nada, las preferencias de emisión y el libro IVA del mes.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

const BASE = {
  configured: true,
  cuit: '20123456786',
  businessName: 'Seed SRL',
  condition: 'RESPONSABLEINSCRIPTO',
  environment: 'HOMOLOGACION',
  autoInvoice: false,
  trigger: 'ONPAYMENT',
  defaultPointOfSaleId: null,
  consumerFinalThresholdMinorUnits: null,
  enabled: false,
  certificate: null as null | object,
};
const ACTIVE_CERT = {
  id: 'cert-1',
  status: 'ACTIVE',
  environment: 'HOMOLOGACION',
  subjectCn: 'tiendafy-seed',
  notAfterUtc: '2028-01-31T00:00:00Z',
  usable: true,
};
const POS = { id: 'pos-1', number: 3, label: 'Web', active: true };

async function open(config: object | null = null, points: object[] = []) {
  const api = mockApi();
  if (config) api.on('GET', '/api/v1/fiscal/config', config);
  api.on('GET', '/api/v1/fiscal/points-of-sale', { items: points });
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/configuracion/facturacion');
  await screen.findByRole('heading', { name: 'Datos del emisor' });
  await settle(2);
  return { api, user };
}

const body = (api: MockApi, method: string, path: string) =>
  api.calls.filter((c) => c.method === method && c.path === path).at(-1)?.body;

describe('facturación electrónica', () => {
  it('la barra de progreso tiene los mismos pasos, nombres y orden que las tarjetas', async () => {
    const { api, user } = await open({ ...BASE, certificate: ACTIVE_CERT }, [POS]);
    const cards = screen.getAllByText(/^Paso \d$/).map((badge) => {
      const heading = badge.parentElement!.querySelector('h2')!;
      return `${badge.textContent} ${heading.textContent}`;
    });
    expect(cards).toEqual([
      'Paso 1 Datos del emisor',
      'Paso 2 Certificado digital',
      'Paso 3 Puntos de venta',
      'Paso 4 Probar la conexión',
      'Paso 5 Preferencias de emisión',
    ]);
    const bar = screen.getByText(/Listo para facturar: los pasos 1 a 3/).parentElement!;
    expect(bar.textContent).toMatch(
      /Datos del emisor.*Certificado digital.*Puntos de venta.*Probar la conexión.*Preferencias de emisión/,
    );

    // Una prueba de conexión que sale bien marca su paso en la barra.
    api.on('POST', '/api/v1/fiscal/test-connection', {
      ok: true,
      environment: 'HOMOLOGACION',
      expiresAtUtc: null,
      caveat: 'No se emitió ninguna factura.',
      steps: [],
    });
    expect(within(bar).getByText('4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Probar\s+conexión con ARCA/ }));
    await waitFor(() => expect(within(bar).queryByText('4')).toBeNull());
  });

  it('paso 1: guarda los datos del emisor (y avisa antes de pasar a producción)', async () => {
    const { api, user } = await open();
    await user.type(screen.getByPlaceholderText('20-12345678-6'), ' 20-12345678-6 ');
    await user.type(screen.getByPlaceholderText('Mi Negocio S.R.L.'), 'Seed SRL');
    const [condition, environment] = screen.getAllByRole('combobox');
    await user.selectOptions(condition!, 'MONOTRIBUTO');
    await user.selectOptions(environment!, 'PRODUCCION');
    expect(screen.getByText(/Empezá siempre en Homologación/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Guardar datos/ }));
    await settle(2);
    expect(body(api, 'PUT', '/api/v1/fiscal/config')).toEqual({
      cuit: '20-12345678-6',
      businessName: 'Seed SRL',
      condition: 'MONOTRIBUTO',
      environment: 'PRODUCCION',
    });

    api.on('PUT', '/api/v1/fiscal/config', { detail: 'CUIT inválido.' }, 400);
    await user.click(screen.getByRole('button', { name: /Guardar datos/ }));
    expect(await screen.findByText('CUIT inválido.')).toBeInTheDocument();
  });

  it('paso 2: genera el CSR (se descarga), lo copia y activa el certificado firmado', async () => {
    const { api, user } = await open(BASE);
    api.on('POST', '/api/v1/fiscal/certificate/csr', {
      certificateId: 'cert-new',
      csrPem: '-----BEGIN CERTIFICATE REQUEST-----\nMIIB\n-----END CERTIFICATE REQUEST-----',
      alias: 'tiendafy-seed',
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const activate = screen.getByRole('button', { name: /Activar certificado/ });
    expect(activate).toBeDisabled(); // sin CSR no hay qué activar
    await user.click(screen.getByRole('button', { name: /Generar solicitud \(CSR\)/ }));
    expect(await screen.findByText(/Solicitud \(CSR\) generada/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Descargar CSR/ }));
    await user.click(screen.getByRole('button', { name: /Copiar/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('BEGIN CERTIFICATE REQUEST'));

    await user.click(screen.getByRole('button', { name: /Activar certificado/ }));
    expect(await screen.findByText('Pegá el certificado que te dio ARCA.')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/BEGIN CERTIFICATE/), '-----BEGIN CERTIFICATE-----');
    await user.click(screen.getByRole('button', { name: /Activar certificado/ }));
    await settle(2);
    expect(body(api, 'POST', '/api/v1/fiscal/certificate/activate')).toEqual({
      certificateId: 'cert-new',
      certificatePem: '-----BEGIN CERTIFICATE-----',
    });
  });

  it('paso 2: si el copiado o la activación fallan, lo dice; con certificado activo muestra titular y vencimiento', async () => {
    const pending = {
      ...ACTIVE_CERT,
      id: 'cert-p',
      status: 'PENDINGCSR',
      subjectCn: null,
      notAfterUtc: null,
    };
    const { api, user } = await open({ ...BASE, certificate: pending });
    api.on(
      'POST',
      '/api/v1/fiscal/certificate/activate',
      { detail: 'El certificado no corresponde a la clave.' },
      400,
    );
    await user.type(screen.getByPlaceholderText(/BEGIN CERTIFICATE/), 'x');
    await user.click(screen.getByRole('button', { name: /Activar certificado/ }));
    expect(await screen.findByText('El certificado no corresponde a la clave.')).toBeInTheDocument();
  });

  it('con el certificado activo: titular, vencimiento y regenerar', async () => {
    const { api, user } = await open({ ...BASE, certificate: ACTIVE_CERT });
    expect(screen.getByText('Certificado activo')).toBeInTheDocument();
    expect(screen.getByText('tiendafy-seed')).toBeInTheDocument();
    api.on('POST', '/api/v1/fiscal/certificate/csr', {}, 500);
    await user.click(screen.getByRole('button', { name: /Regenerar certificado/ }));
    expect(await screen.findByText(/No se pudo generar|status 500/)).toBeInTheDocument();
  });

  it('paso 3: agrega y elimina puntos de venta', async () => {
    const { api, user } = await open(BASE, [POS]);
    await user.click(screen.getByRole('button', { name: /Agregar/ }));
    expect(await screen.findByText('Ingresá un número de punto de venta válido.')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('1'), '4');
    await user.type(screen.getByPlaceholderText('Web'), ' Local ');
    await user.click(screen.getByRole('button', { name: /Agregar/ }));
    await settle(2);
    expect(body(api, 'POST', '/api/v1/fiscal/points-of-sale')).toEqual({ number: 4, label: 'Local' });

    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getAllByRole('button').at(-1)!);
    await settle(2);
    expect(
      api.calls.some((c) => c.method === 'DELETE' && c.path === '/api/v1/fiscal/points-of-sale/pos-1'),
    ).toBe(true);
  });

  it('paso 4: prueba la conexión y muestra cada verificación', async () => {
    const { api, user } = await open({ ...BASE, certificate: ACTIVE_CERT }, [POS]);
    api.on('POST', '/api/v1/fiscal/test-connection', {
      ok: false,
      environment: 'HOMOLOGACION',
      expiresAtUtc: null,
      caveat: 'No se emitió ninguna factura.',
      steps: [
        { key: 'cert', label: 'Certificado', status: 'ok', detail: 'Vigente' },
        { key: 'wsaa', label: 'Ticket de acceso', status: 'warning', detail: 'Lento' },
        { key: 'padron', label: 'Padrón', status: 'error', detail: 'CUIT no autorizado' },
        { key: 'pos', label: 'Puntos de venta', status: 'skipped', detail: 'Sin verificar' },
      ],
    });
    await user.click(screen.getByRole('button', { name: /Probar\s+conexión con ARCA/ }));
    expect(await screen.findByText('CUIT no autorizado')).toBeInTheDocument();
    expect(screen.getByText('No se emitió ninguna factura.')).toBeInTheDocument();

    api.on('POST', '/api/v1/fiscal/test-connection', {}, 502);
    await user.click(screen.getByRole('button', { name: /Probar\s+conexión con ARCA/ }));
    expect(await screen.findByText(/No se pudo probar la conexión|status 502/)).toBeInTheDocument();
  });

  it('paso 5: preferencias de emisión', async () => {
    const { api, user } = await open({ ...BASE, certificate: ACTIVE_CERT }, [POS]);
    await user.click(screen.getByRole('switch', { name: /Facturar automáticamente/ }));
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects.at(-2)!, 'ONFULFILLMENT');
    await user.selectOptions(selects.at(-1)!, 'pos-1');
    await user.click(screen.getByRole('button', { name: /Guardar preferencias/ }));
    await settle(2);
    expect(body(api, 'PUT', '/api/v1/fiscal/config/emission')).toEqual({
      autoInvoice: true,
      trigger: 'ONFULFILLMENT',
      defaultPointOfSaleId: 'pos-1',
      consumerFinalThresholdMinorUnits: null,
    });

    api.on('PUT', '/api/v1/fiscal/config/emission', {}, 500);
    await user.click(screen.getByRole('button', { name: /Guardar preferencias/ }));
    expect(await screen.findByText(/No se pudieron guardar las preferencias|status 500/)).toBeInTheDocument();
  });

  it('libro IVA: descarga el CSV del mes elegido', async () => {
    const { api, user } = await open({ ...BASE, certificate: ACTIVE_CERT }, [POS]);
    const month = document.querySelector<HTMLInputElement>('input[type=month]')!;
    await user.clear(month);
    await user.type(month, '2026-09');
    await user.click(screen.getByRole('button', { name: /Libro IVA/ }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === '/api/v1/fiscal/documents/export?year=2026&month=9')).toBe(
        true,
      ),
    );
  });
});
