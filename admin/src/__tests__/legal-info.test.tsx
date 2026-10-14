/**
 * Datos legales de la tienda (quién vende, QR de Data Fiscal y la leyenda de
 * "precio sin impuestos nacionales") y el número de pedido con el que el
 * panel nombra cada venta.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';
import { orderLabel, orderNumber } from '../lib/orderNumber';

const SAVED = {
  configured: false,
  legalName: null,
  cuit: null,
  address: null,
  condition: 'RESPONSABLE_INSCRIPTO',
  vatRatePercent: 21,
  otherNationalTaxesPercent: 0,
  showPriceWithoutTaxes: true,
  dataFiscalUrl: null,
  dataFiscalImageUrl: null,
  fromInvoicing: {
    legalName: 'Importadora Test S.A.',
    cuit: '30712345671',
    condition: 'RESPONSABLE_INSCRIPTO',
  },
};

describe('datos legales', () => {
  it('sugiere lo de Facturación, muestra el ejemplo y guarda', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/store-legal/', SAVED);
    api.on('PUT', '/api/v1/admin/store-legal/', (body) => ({
      ...SAVED,
      ...(body as object),
      configured: true,
    }));
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/configuracion/datos-legales');
    await settle(4);

    expect(screen.getByLabelText('Razón social (o nombre y apellido)')).toHaveValue('Importadora Test S.A.');
    // $12.100 con IVA 21 % → $10.000.
    expect(screen.getByText(/Precio sin impuestos nacionales: \$\s?10\.000/)).toBeInTheDocument();

    await user.click(screen.getByLabelText('Monotributo'));
    expect(screen.getByText(/Precio sin impuestos nacionales: \$\s?12\.100/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Domicilio'), 'Av. Corrientes 1234');
    await user.click(screen.getByRole('button', { name: /Guardar/ }));
    await settle(2);

    const put = api.calls.filter((c) => c.method === 'PUT' && c.path === '/api/v1/admin/store-legal/').at(-1);
    expect(put?.body).toMatchObject({
      legalName: 'Importadora Test S.A.',
      cuit: '30712345671',
      address: 'Av. Corrientes 1234',
      condition: 'MONOTRIBUTO',
      showPriceWithoutTaxes: true,
    });
  });
});

describe('número de pedido', () => {
  it('nombra la venta por su número y cae al id corto sin número', () => {
    const id = '3f2a9c1e-0000-0000-0000-000000000000';
    expect(orderLabel({ id, number: 1042 })).toBe('#1042');
    expect(orderLabel({ id })).toBe('#3F2A9C1E');
    expect(orderLabel({ id, number: 0 })).toBe(orderNumber(id));
  });
});
