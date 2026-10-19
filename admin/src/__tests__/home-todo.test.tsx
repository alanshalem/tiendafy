/**
 * "Para hacer hoy" del Inicio: las colas reales del día (despachar,
 * arrepentimientos con su plazo, preguntas de ML, mensajes, transferencias,
 * ML sin facturar), cada una con el link a su listado filtrado y contadas en
 * el servidor (no sobre un listado recortado a 50).
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';
import { repentanceDaysLeft, REPENTANCE_DAYS } from '../pages/Home';

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000 - 60_000).toISOString();

async function home(todo: object) {
  const api = mockApi();
  api.on('GET', '/api/v1/home/todo', todo);
  renderApp('/');
  await screen.findByText(/Para hacer hoy/);
  await settle(2);
  return api;
}

const link = (name: RegExp) => screen.getByRole('link', { name });

describe('Inicio: para hacer hoy', () => {
  it('cada cola con su número y su link filtrado', async () => {
    const api = await home({
      toDispatch: 45,
      pendingTransfers: 2,
      messages: { unreadContact: 3, repentance: 1, oldestRepentanceAtUtc: daysAgo(3) },
      mercadoLibre: { unbilled: 137, unanswered: 4 },
      fiscalReady: true,
    });
    expect(screen.getByText('45 ventas cobradas para despachar.')).toBeInTheDocument();
    expect(link(/Despachar/)).toHaveAttribute('href', '/ventas?estado=PAID');
    expect(
      screen.getByText(/1 arrepentimiento sin atender \(plazo legal\): quedan 7 días/),
    ).toBeInTheDocument();
    expect(link(/Atender/)).toHaveAttribute('href', '/mensajes?filtro=repentance');
    expect(screen.getByText('4 preguntas de Mercado Libre sin responder.')).toBeInTheDocument();
    expect(link(/Responder/)).toHaveAttribute('href', '/mercadolibre?tab=preguntas');
    expect(screen.getByText('3 mensajes de contacto sin leer.')).toBeInTheDocument();
    expect(link(/Revisar/)).toHaveAttribute('href', '/ventas?estado=PENDINGPAYMENT&cobro=transfer');
    // El contador real, no el tope de un listado de 50.
    expect(screen.getByText('137 ventas de Mercado Libre pagadas sin facturar.')).toBeInTheDocument();
    expect(link(/^Facturar$/)).toHaveAttribute('href', '/mercadolibre?tab=ventas&estado=sin-facturar');
    expect(api.calls.some((c) => c.path.startsWith('/api/v1/admin/meli/orders'))).toBe(false);
  });

  it('sin la facturación lista, el aviso de ML lleva a configurarla; lo que no aplica no se muestra', async () => {
    await home({
      toDispatch: 0,
      pendingTransfers: 0,
      messages: null,
      mercadoLibre: { unbilled: 5, unanswered: null },
      fiscalReady: false,
    });
    expect(link(/Configurá la facturación/)).toHaveAttribute('href', '/configuracion/facturacion');
    expect(screen.queryByText(/para despachar/)).toBeNull();
    expect(screen.queryByText(/transferencia/)).toBeNull();
  });

  it('las ventas pagadas para revisar van arriba y llevan al listado filtrado', async () => {
    await home({
      toDispatch: 0,
      pendingTransfers: 0,
      toReview: 2,
      messages: null,
      mercadoLibre: null,
      fiscalReady: null,
    });
    expect(
      screen.getByText('2 ventas pagadas para revisar: se cobraron sin stock o figuraban canceladas.'),
    ).toBeInTheDocument();
    expect(link(/Revisar/)).toHaveAttribute('href', '/ventas?revisar=1');
  });

  it('un arrepentimiento vencido lo dice', async () => {
    await home({
      toDispatch: null,
      pendingTransfers: null,
      messages: { unreadContact: 0, repentance: 2, oldestRepentanceAtUtc: daysAgo(12) },
      mercadoLibre: null,
      fiscalReady: null,
    });
    expect(screen.getByText(/2 arrepentimientos sin atender .*vencida hace 2 días/)).toBeInTheDocument();
  });
});

describe('plazo del arrepentimiento', () => {
  it('cuenta días corridos desde la solicitud', () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    expect(repentanceDaysLeft('2026-10-14T09:00:00Z', now)).toBe(REPENTANCE_DAYS);
    expect(repentanceDaysLeft('2026-10-04T11:00:00Z', now)).toBe(0);
    expect(repentanceDaysLeft('2026-10-01T12:00:00Z', now)).toBe(-3);
  });
});
