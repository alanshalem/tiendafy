/**
 * El carrito: el drawer con sus líneas (sumar, restar, quitar), la barra de
 * envío gratis, los sugeridos, el cupón (que se revalida si cambia el
 * subtotal y se guarda para el checkout), el foco atrapado mientras está
 * abierto y — regresión — que cerrado no quede alcanzable con el teclado ni
 * para un lector de pantalla.
 */
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CartDrawer,
  cartStorageKey,
  couponStorageKey,
  useCart,
  type CartLine,
} from '../components/store/cart';
import { StoreOffersContext } from '../components/store/store-offers-context';
import type { StoreOffers } from '../lib/store-offers';
import { fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';

const LINE: CartLine = {
  variantId: 'v-1',
  productName: 'Mancuerna',
  variantLabel: '10 kg',
  priceAmount: 40_000_00,
  currency: 'ARS',
  image: 'https://cdn.example.com/m.jpg',
  quantity: 1,
};
const SUGGESTED = [
  {
    variantId: 'v-2',
    name: 'Soga',
    priceAmount: 5_000_00,
    currency: 'ARS',
    image: null,
    variantLabel: 'Única',
  },
];
const CONFIG = {
  showCoupon: true,
  showContinue: true,
  freeShippingBar: true,
  freeShippingThreshold: 100_000_00,
  checkoutButtonText: 'Ir a pagar',
  showSuggested: true,
  notice: 'Despachamos en 24 h.',
};

/** Un botón para abrir el carrito, como el del header. */
function Opener() {
  const { setOpen, count } = useCart();
  return <button onClick={() => setOpen(true)}>Abrir carrito ({count})</button>;
}

let api: MockApi;
let crashes: () => unknown[][];

async function show(lines: CartLine[] = [LINE], config: Partial<typeof CONFIG> = {}) {
  localStorage.setItem(cartStorageKey(fixtureTenantId), JSON.stringify(lines));
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderInStore(
    <>
      <Opener />
      <CartDrawer cart={{ ...CONFIG, ...config }} suggested={SUGGESTED} />
    </>,
  );
  await settle(1);
  await user.click(screen.getByRole('button', { name: /Abrir carrito/ }));
  return user;
}

const drawer = () => screen.getByRole('dialog', { name: 'Tu carrito' });
const saved = () => JSON.parse(localStorage.getItem(cartStorageKey(fixtureTenantId)) ?? '[]') as CartLine[];

beforeEach(() => {
  api = mockApi();
  crashes = watchCrashes();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

describe('carrito', () => {
  it('suma, resta y quita líneas, y lo guarda en el momento', async () => {
    const user = await show();
    const d = within(drawer());
    await user.click(d.getByRole('button', { name: 'Sumar' }));
    expect(saved()[0]!.quantity).toBe(2);
    await user.click(d.getByRole('button', { name: 'Restar' }));
    await user.click(d.getByRole('button', { name: 'Restar' })); // a cero: se va
    expect(saved()).toEqual([]);
    expect(d.getByText('Tu carrito está vacío.')).toBeInTheDocument();
  });

  it('quitar una línea', async () => {
    const user = await show([LINE, { ...LINE, variantId: 'v-9', productName: 'Barra' }]);
    const removeButtons = within(drawer()).getAllByRole('button', { name: /Quitar|Eliminar/ });
    await user.click(removeButtons[0]!);
    expect(saved().map((l) => l.variantId)).toEqual(['v-9']);
  });

  it('barra de envío gratis: cuánto falta y cuándo se llega', async () => {
    const user = await show();
    expect(within(drawer()).getByText(/Te faltan/)).toBeInTheDocument();
    await user.click(within(drawer()).getByRole('button', { name: 'Sumar' }));
    await user.click(within(drawer()).getByRole('button', { name: 'Sumar' }));
    expect(within(drawer()).getByText(/Tenés envío gratis/)).toBeInTheDocument();
  });

  it('un sugerido se agrega con un toque; el aviso del comercio y el botón propio se ven', async () => {
    const user = await show();
    await user.click(within(drawer()).getByRole('button', { name: /Soga/ }));
    expect(saved().map((l) => l.variantId)).toEqual(['v-1', 'v-2']);
    expect(within(drawer()).getByText('Despachamos en 24 h.')).toBeInTheDocument();
    expect(within(drawer()).getByRole('button', { name: 'Ir a pagar' })).toBeInTheDocument();
  });

  it('un sugerido agotado no se ofrece; uno con talles lleva a su ficha', async () => {
    localStorage.setItem(cartStorageKey(fixtureTenantId), JSON.stringify([LINE]));
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderInStore(
      <>
        <Opener />
        <CartDrawer
          cart={CONFIG}
          suggested={[
            { ...SUGGESTED[0]!, stock: 0 },
            { ...SUGGESTED[0]!, variantId: 'v-3', name: 'Guantes', slug: 'guantes', variantCount: 2 },
          ]}
        />
      </>,
    );
    await settle(1);
    await user.click(screen.getByRole('button', { name: /Abrir carrito/ }));
    expect(within(drawer()).queryByText('Soga')).not.toBeInTheDocument();
    expect(within(drawer()).getByRole('link', { name: /Guantes/ })).toHaveAttribute(
      'href',
      '/productos/guantes',
    );
  });

  it('cupón: se aplica, se guarda para el checkout, se revalida al cambiar el subtotal y se quita', async () => {
    api.on('POST', '/api/v1/coupons/validate', { valid: true, code: 'HOLA', discountAmount: 4_000_00 });
    const user = await show();
    const d = within(drawer());
    await user.type(d.getByLabelText('Cupón de descuento'), 'hola');
    await user.click(d.getByRole('button', { name: 'Aplicar' }));
    await settle(1);
    expect(d.getByText('Descuento (HOLA)')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(couponStorageKey(fixtureTenantId))!)).toMatchObject({
      code: 'HOLA',
    });

    const validations = () => api.calls.filter((c) => c.path === '/api/v1/coupons/validate').length;
    const before = validations();
    await user.click(d.getByRole('button', { name: 'Sumar' }));
    await settle(1);
    expect(validations()).toBe(before + 1);

    // El "Quitar" del cupón es el último (el de cada línea va antes).
    await user.click(d.getAllByRole('button', { name: 'Quitar' }).at(-1)!);
    expect(localStorage.getItem(couponStorageKey(fixtureTenantId))).toBeNull();
  });

  it('cupón inválido muestra el motivo; vaciar el carrito descarta el cupón', async () => {
    localStorage.setItem(
      couponStorageKey(fixtureTenantId),
      JSON.stringify({ code: 'VIEJO', discount: 1, freeShipping: true }),
    );
    api.on('POST', '/api/v1/coupons/validate', {
      valid: true,
      code: 'VIEJO',
      discountAmount: 0,
      freeShipping: true,
    });
    const user = await show();
    expect(within(drawer()).getByText(/VIEJO · envío gratis/)).toBeInTheDocument();
    await user.click(within(drawer()).getByRole('button', { name: 'Restar' }));
    await settle(1);
    expect(localStorage.getItem(couponStorageKey(fixtureTenantId))).toBeNull();
  });

  it('un cupón rechazado lo dice', async () => {
    api.on('POST', '/api/v1/coupons/validate', { valid: false, error: 'No existe.' });
    const user = await show();
    await user.type(within(drawer()).getByLabelText('Cupón de descuento'), 'X');
    await user.click(within(drawer()).getByRole('button', { name: 'Aplicar' }));
    await settle(1);
    expect(within(drawer()).getByText('No existe.')).toBeInTheDocument();
  });

  it('se cierra con Escape, con la X, con "seguir comprando" y tocando afuera', async () => {
    const user = await show();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Tu carrito' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Abrir carrito/ }));
    await user.click(within(drawer()).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog', { name: 'Tu carrito' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Abrir carrito/ }));
    await user.click(within(drawer()).getByRole('button', { name: /Seguir comprando/ }));
    expect(screen.queryByRole('dialog', { name: 'Tu carrito' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Abrir carrito/ }));
    await user.click(document.querySelector<HTMLElement>('.fixed.inset-0')!);
    expect(screen.queryByRole('dialog', { name: 'Tu carrito' })).not.toBeInTheDocument();
  });

  it('el comercio puede ocultar el cupón y "seguir comprando"', async () => {
    await show([LINE], { showCoupon: false, showContinue: false, checkoutButtonText: '' });
    expect(within(drawer()).getByRole('button', { name: 'Iniciar compra' })).toBeInTheDocument();
    expect(within(drawer()).queryByRole('button', { name: /Seguir comprando/ })).not.toBeInTheDocument();
  });

  it('regresión: cerrado no se alcanza con Tab ni lo anuncia un lector de pantalla', async () => {
    const user = await show();
    await user.keyboard('{Escape}');
    const aside = document.querySelector('[role="dialog"]')!;
    expect(aside).toHaveAttribute('aria-hidden', 'true');
    expect(aside).toHaveAttribute('inert');
    expect(screen.queryByRole('button', { name: 'Sumar' })).not.toBeInTheDocument();
  });

  it('al abrirse trae el precio de hoy, lo guarda y avisa qué cambió', async () => {
    api.on('GET', '/api/v1/products/variants', {
      items: [{ variantId: 'v-1', price: { amount: 45_000_00, currency: 'ARS' }, available: 1 }],
    });
    const user = await show();
    await settle(1);
    const d = within(drawer());
    expect(d.getByRole('status')).toHaveTextContent(
      /El precio de Mancuerna cambió de .*40\.000.* a .*45\.000/,
    );
    expect(saved()[0]!.priceAmount).toBe(45_000_00);
    expect(api.calls.some((c) => c.path === '/api/v1/products/variants?ids=v-1')).toBe(true);
    // Queda 1: no deja sumar más de lo que hay.
    expect(d.getByRole('button', { name: 'Sumar' })).toBeDisabled();
    expect(d.getByRole('button', { name: 'Ir a pagar' })).toBeEnabled();
    await user.click(d.getByRole('button', { name: 'Restar' }));
    expect(saved()).toEqual([]);
  });

  it('una línea agotada o despublicada se marca y no deja seguir hasta quitarla', async () => {
    api.on('GET', '/api/v1/products/variants', {
      items: [{ variantId: 'v-1', price: { amount: 40_000_00, currency: 'ARS' }, available: 0 }],
    });
    const user = await show([LINE, { ...LINE, variantId: 'v-9', productName: 'Barra' }]);
    await settle(1);
    const d = within(drawer());
    expect(d.getByText('Se quedó sin stock. Quitalo para seguir.')).toBeInTheDocument();
    expect(d.getByText('Ya no está a la venta. Quitalo para seguir.')).toBeInTheDocument();
    expect(d.getByText('Revisá los productos marcados para poder seguir.')).toBeInTheDocument();
    expect(d.getByRole('button', { name: 'Ir a pagar' })).toBeDisabled();
    expect(d.queryByRole('status')).not.toBeInTheDocument(); // ningún precio cambió

    const [first, second] = d.getAllByRole('button', { name: 'Quitar' });
    await user.click(second!);
    await user.click(first!);
    expect(saved()).toEqual([]);
  });

  it('si no se puede verificar, sigue con lo guardado sin bloquear', async () => {
    api.on('GET', '/api/v1/products/variants', {}, 503);
    await show();
    await settle(1);
    expect(within(drawer()).getByRole('button', { name: 'Ir a pagar' })).toBeEnabled();
    expect(saved()[0]!.priceAmount).toBe(LINE.priceAmount);
  });

  it('si otra pestaña cambia el carrito guardado, este se entera', async () => {
    const user = await show();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Abrir carrito (1)' })).toBeInTheDocument();

    // Otra pestaña de la misma tienda terminó la compra y lo vació.
    localStorage.removeItem(cartStorageKey(fixtureTenantId));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: cartStorageKey(fixtureTenantId) }));
    });
    expect(screen.getByRole('button', { name: 'Abrir carrito (0)' })).toBeInTheDocument();

    // Lo de otra tienda no le importa.
    localStorage.setItem(cartStorageKey(fixtureTenantId), JSON.stringify([LINE]));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tiendafy.cart.otra' }));
    });
    expect(screen.getByRole('button', { name: 'Abrir carrito (0)' })).toBeInTheDocument();
  });

  it('abierto, el Tab da la vuelta dentro del carrito', async () => {
    // jsdom no hace layout: se simula que los botones se ven.
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    const user = await show();
    const buttons = within(drawer()).getAllByRole('button');
    const focusables = Array.from(
      drawer().querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href]'),
    );
    expect(drawer()).toContainElement(document.activeElement as HTMLElement);

    act(() => focusables.at(-1)!.focus());
    await user.tab();
    expect(document.activeElement).toBe(focusables[0]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(focusables.at(-1));
    expect(buttons.length).toBeGreaterThan(2);
  });
});

describe('carrito: lo que promete la tienda', () => {
  const OFFERS: StoreOffers = {
    configured: true,
    transfer: { enabled: true, discountPercent: 10, holdHours: 48 },
    cashOnPickup: { enabled: false },
    installments: { max: 0, note: null },
    freeShipping: { from: { amount: 100_000_00, currency: 'ARS' }, methodName: 'Moto' },
    canCheckout: true,
  };

  async function showWith(offers: StoreOffers, lines: CartLine[] = [LINE], whatsapp?: string) {
    localStorage.setItem(cartStorageKey(fixtureTenantId), JSON.stringify(lines));
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderInStore(
      <StoreOffersContext.Provider value={offers}>
        <Opener />
        <CartDrawer cart={CONFIG} suggested={[]} whatsapp={whatsapp} />
      </StoreOffersContext.Provider>,
    );
    await settle(1);
    await user.click(screen.getByRole('button', { name: /Abrir carrito/ }));
    return user;
  }

  it('dice "Subtotal" y que el envío viene después; al llegar al monto, con qué medio es gratis', async () => {
    const user = await showWith(OFFERS);
    const d = within(drawer());
    expect(d.getByText('Subtotal')).toBeInTheDocument();
    expect(d.queryByText('Total')).not.toBeInTheDocument();
    expect(d.getByText('El envío se calcula en el próximo paso.')).toBeInTheDocument();
    await user.click(d.getByRole('button', { name: 'Sumar' }));
    await user.click(d.getByRole('button', { name: 'Sumar' }));
    expect(d.getByText(/Tenés envío gratis con Moto/)).toBeInTheDocument();
    expect(d.getByText('Envío gratis con Moto.')).toBeInTheDocument();
  });

  it('sin umbral en ningún medio de envío no muestra la barra', async () => {
    localStorage.setItem(cartStorageKey(fixtureTenantId), JSON.stringify([LINE]));
    renderInStore(
      <StoreOffersContext.Provider value={{ ...OFFERS, freeShipping: null }}>
        <Opener />
        <CartDrawer cart={{ ...CONFIG, freeShippingThreshold: 0 }} suggested={[]} />
      </StoreOffersContext.Provider>,
    );
    await settle(1);
    expect(screen.queryByText(/Te faltan/)).not.toBeInTheDocument();
  });

  it('si la tienda no cobra online, lo dice antes del checkout y ofrece WhatsApp', async () => {
    await showWith({ ...OFFERS, canCheckout: false }, [LINE], '11 5555-4444');
    const d = within(drawer());
    expect(d.getByText(/todavía no cobra online/)).toBeInTheDocument();
    expect(d.queryByRole('button', { name: 'Ir a pagar' })).not.toBeInTheDocument();
    expect(d.getByRole('link', { name: 'Comprar por WhatsApp' }).getAttribute('href')).toMatch(
      /^https:\/\/wa\.me\/1155554444\?text=.*Mancuerna/,
    );
  });
});
