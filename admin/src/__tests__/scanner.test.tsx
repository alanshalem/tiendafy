/**
 * El escáner del depósito, en sus tres modos: buscar un código y ajustar
 * stock/ubicación (o asignarle el EAN a una variante), preparar un pedido
 * escaneando cada unidad (con alarma si se agarra el producto equivocado) y
 * contar una estantería. La cámara se simula con un BarcodeDetector falso;
 * el ingreso manual hace exactamente lo mismo.
 */
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

interface Hit {
  productId: string;
  productName: string;
  variantId: string;
  sku: string;
  available: number;
  location: string | null;
}
interface Order {
  id: string;
  status: string;
  fulfilledAtUtc: string | null;
  items: { variantId: string; productName: string; quantity: number }[];
}

const hit = fixture<Hit>('/api/v1/products/by-code/SEED-01');
const paid = fixture<{ items: Order[] }>('/api/v1/orders').items.find(
  (o) => o.status === 'PAID' && !o.fulfilledAtUtc,
)!;
const item = paid.items[0]!;

async function open(tab?: string) {
  const api = mockApi();
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/productos/escaner');
  await screen.findByRole('heading', { name: 'Escáner' });
  if (tab) await user.click(screen.getByRole('button', { name: tab, pressed: false }));
  await settle(2);
  return { api, user };
}

const put = (api: MockApi, path: string) =>
  api.calls.filter((c) => c.method === 'PUT' && c.path === path).map((c) => c.body);

afterEach(() => {
  delete (window as { BarcodeDetector?: unknown }).BarcodeDetector;
  vi.useRealTimers();
});

describe('escáner: buscar y ajustar', () => {
  it('encuentra por SKU y guarda stock y ubicación', async () => {
    const { api, user } = await open();
    await user.type(screen.getByPlaceholderText('Código de barras o SKU…'), 'SEED-01{Enter}');
    expect(await screen.findByText(hit.productName)).toBeInTheDocument();

    const stock = screen.getByDisplayValue(String(hit.available));
    expect(screen.getByRole('button', { name: 'Guardar stock' })).toBeDisabled(); // sin cambios
    await user.clear(stock);
    await user.type(stock, '40');
    await user.click(screen.getByRole('button', { name: 'Guardar stock' }));
    await user.type(screen.getAllByRole('textbox').at(-1)!, 'B3');
    await user.click(screen.getByRole('button', { name: 'Guardar ubicación' }));
    await settle(2);

    expect(put(api, `/api/v1/inventory/${hit.variantId}`)[0]).toMatchObject({ available: 40 });
    expect(put(api, `/api/v1/inventory/${hit.variantId}/location`)[0]).toEqual({ location: 'B3' });
  });

  it('un código desconocido se puede asignar a una variante por su SKU', async () => {
    const { api, user } = await open();
    await user.type(screen.getByPlaceholderText('Código de barras o SKU…'), '7790001234567{Enter}');
    expect(await screen.findByText(/Ningún producto tiene el código/)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('SKU de la variante'), 'SEED-01');
    await user.click(screen.getByRole('button', { name: 'Asignar código' }));
    await settle(2);
    expect(put(api, `/api/v1/products/${hit.productId}/variants/${hit.variantId}/barcode`)[0]).toEqual({
      barcode: '7790001234567',
    });

    // Un SKU que no existe avisa.
    await user.type(screen.getByPlaceholderText('Código de barras o SKU…'), '{selectall}999{Enter}');
    await user.type(await screen.findByPlaceholderText('SKU de la variante'), 'NO-EXISTE');
    await user.click(screen.getByRole('button', { name: 'Asignar código' }));
    expect(await screen.findByText(/No encontrado|No se encontró/)).toBeInTheDocument();
  });

  it('con la cámara: lee el código, no repite el mismo en el momento y se apaga', async () => {
    const detect = vi.fn().mockResolvedValue([{ rawValue: 'SEED-01' }]);
    (window as { BarcodeDetector?: unknown }).BarcodeDetector = class {
      detect = detect;
    };
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);

    const { api, user } = await open();
    await user.click(screen.getByRole('button', { name: /Escanear con la cámara/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Apagar cámara/ })).toBeInTheDocument());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800)); // dos lecturas del mismo código
    });
    expect(await screen.findByText(hit.productName)).toBeInTheDocument();
    expect(api.calls.filter((c) => c.path.endsWith('/by-code/SEED-01')).length).toBe(1);

    await user.click(screen.getByRole('button', { name: /Apagar cámara/ }));
    expect(stop).toHaveBeenCalled();
  });

  it('sin permiso de cámara sigue con el ingreso manual; sin BarcodeDetector lo explica', async () => {
    (window as { BarcodeDetector?: unknown }).BarcodeDetector = class {};
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: /Escanear con la cámara/ }));
    await settle(1);
    expect(screen.getByRole('button', { name: /Escanear con la cámara/ })).toBeInTheDocument();
  });

  it('sin BarcodeDetector lo explica', async () => {
    await open();
    expect(screen.getByText(/Este navegador no lee códigos con la cámara/)).toBeInTheDocument();
  });
});

describe('escáner: preparar pedido', () => {
  it('verifica cada unidad, avisa del producto equivocado y despacha con seguimiento', async () => {
    const { api, user } = await open('Preparar pedido');
    api.on('GET', '/api/v1/products/by-code/OK', {
      ...hit,
      variantId: item.variantId,
      productName: item.productName,
    });
    api.on('GET', '/api/v1/products/by-code/OTRO', {
      ...hit,
      variantId: 'otra-variante',
      productName: 'Banco',
    });

    await user.selectOptions(screen.getByRole('combobox'), paid.id);
    const manual = () => screen.getByPlaceholderText('…o ingresá el código a mano');

    await user.type(manual(), 'OTRO{Enter}');
    expect(await screen.findByText('⚠ Banco NO va en este pedido')).toBeInTheDocument();
    await user.type(manual(), 'NADA{Enter}');
    expect(await screen.findByText('Código desconocido')).toBeInTheDocument();

    for (const i of paid.items) {
      api.on('GET', `/api/v1/products/by-code/${i.variantId}`, {
        ...hit,
        variantId: i.variantId,
        productName: i.productName,
      });
      for (let n = 0; n < i.quantity; n++) {
        await user.type(manual(), `${i.variantId}{Enter}`);
        await settle(1);
      }
    }
    expect(await screen.findByText('Pedido completo y verificado.')).toBeInTheDocument();

    await user.type(manual(), `${item.variantId}{Enter}`);
    expect(await screen.findByText(new RegExp(`Ya juntaste las ${item.quantity}`))).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Número de seguimiento (opcional)'), 'TRK-9');
    await user.click(screen.getByRole('button', { name: /enviado|Despachar|Marcar/i }));
    await settle(2);
    expect(api.calls.find((c) => c.path === `/api/v1/orders/${paid.id}/fulfill`)?.body).toEqual({
      tracking: 'TRK-9',
    });
  });
});

describe('escáner: conteo', () => {
  it('cuenta unidades, muestra la diferencia y aplica el ajuste', async () => {
    const { api, user } = await open('Conteo');
    const manual = () => screen.getByPlaceholderText('…o ingresá el código a mano');
    await user.type(manual(), 'SEED-01{Enter}');
    await user.type(manual(), 'SEED-01{Enter}');
    await settle(1);
    expect(screen.getByDisplayValue('2')).toBeInTheDocument();
    expect(screen.getByText('1 diferencia(s) contra el sistema.')).toBeInTheDocument();

    await user.type(manual(), 'NADA{Enter}');
    expect(await screen.findByText('Código desconocido')).toBeInTheDocument();

    const counted = screen.getByDisplayValue('2');
    await user.clear(counted);
    await user.type(counted, '45');
    await user.click(screen.getByRole('button', { name: 'Aplicar ajustes' }));
    await settle(2);
    expect(put(api, `/api/v1/inventory/${hit.variantId}`)[0]).toEqual({
      available: 45,
      reason: 'Conteo cíclico (escáner)',
    });
    expect(await screen.findByText('Conteo aplicado: 1 ajuste(s)')).toBeInTheDocument();
  });
});
