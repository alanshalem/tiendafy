/**
 * La ficha de producto: elegir la variante (por opciones o por lista), la
 * cantidad, agregar al carrito o comprar ya, los datos que el comercio decide
 * mostrar (cuotas, precio en efectivo, SKU, stock, WhatsApp, medios de pago),
 * compartir, y la galería en sus tres estilos con lupa y visor a pantalla
 * completa.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductDetail } from '../components/store/ProductDetail';
import { cartStorageKey, type CartLine } from '../components/store/cart';
import { fixtureTenantId, mockApi } from '../test/api';
import { nav } from '../test/next';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';

const money = (amount: number) => ({ amount, currency: 'ARS' });
const variant = (id: string, sku: string, optionValues: string[], amount = 100_000) => ({
  id,
  sku,
  optionValues,
  price: money(amount),
  compareAtPrice: null,
});

const VARIANTS = [
  variant('v-rojo-s', 'REM-R-S', ['Rojo', 'S']),
  variant('v-rojo-m', 'REM-R-M', ['Rojo', 'M']),
  variant('v-azul-s', 'REM-A-S', ['Azul', 'S'], 120_000),
];
const OPTIONS = [
  { name: 'Color', values: ['Rojo', 'Azul'] },
  { name: 'Talle', values: ['S', 'M'] },
];
const IMAGES = [1, 2, 3].map((n) => ({
  url: `https://cdn.example.com/${n}.jpg`,
  altText: n === 1 ? 'Frente' : null,
}));

const CONFIG = {
  installmentsCount: 3,
  showPaymentLogos: true,
  askWhatsApp: true,
  showSku: true,
  showStock: true,
  galleryStyle: 'thumbs' as const,
  showRelated: false,
  cashDiscountPercent: 10,
};

type Props = Partial<Parameters<typeof ProductDetail>[0]>;

async function show(props: Props = {}) {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  const view = renderInStore(
    <ProductDetail
      name="Remera"
      description="Algodón"
      images={IMAGES}
      options={OPTIONS}
      variants={VARIANTS}
      config={CONFIG}
      paymentLogos={['visa', 'mastercard']}
      whatsappPhone="+54 9 11 5555-4444"
      {...props}
    />,
  );
  await settle(1);
  return { user, ...view };
}

const cart = () => JSON.parse(localStorage.getItem(cartStorageKey(fixtureTenantId)) ?? '[]') as CartLine[];

let crashes: () => unknown[][];
beforeEach(() => {
  mockApi();
  crashes = watchCrashes();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

describe('ficha de producto: comprar', () => {
  it('elige la variante por opciones y agrega la cantidad pedida', async () => {
    const { user } = await show();
    expect(screen.getByText('SKU: REM-R-S')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Azul' }));
    expect(screen.getByRole('button', { name: 'Azul' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('SKU: REM-A-S')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sumar' }));
    await user.click(screen.getByRole('button', { name: 'Sumar' }));
    await user.click(screen.getByRole('button', { name: 'Restar' }));
    const [desktop, mobileBar] = screen.getAllByRole('button', { name: 'Agregar al carrito' });
    await user.click(desktop!);
    await settle(1);
    expect(cart()).toEqual([
      expect.objectContaining({
        variantId: 'v-azul-s',
        productName: 'Remera',
        variantLabel: 'Azul / S',
        priceAmount: 120_000,
        quantity: 2,
        image: IMAGES[0]!.url,
      }),
    ]);

    // La barra fija del celular agrega lo mismo.
    await user.click(mobileBar!);
    await settle(1);
    expect(cart()[0]!.quantity).toBe(4);
  });

  it('cada opción es un grupo con nombre, que dice lo elegido', async () => {
    const { user } = await show();
    const color = screen.getByRole('group', { name: 'Color: Rojo' });
    await user.click(within(color).getByRole('button', { name: 'Azul' }));
    expect(screen.getByRole('group', { name: 'Color: Azul' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Talle/ })).toBeInTheDocument();
  });

  it('una combinación que no existe cae en la primera variante; restar no baja de 1', async () => {
    const { user } = await show();
    await user.click(screen.getByRole('button', { name: 'Azul' }));
    await user.click(screen.getByRole('button', { name: 'M' })); // Azul / M no existe
    expect(screen.getByText('SKU: REM-R-S')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restar' }));
    await user.click(screen.getByRole('button', { name: 'Comprar ahora' }));
    await settle(1);
    expect(cart()[0]).toMatchObject({ variantId: 'v-rojo-s', quantity: 1 });
    expect(nav.router.push).toHaveBeenCalledWith('/checkout');
  });

  it('sin opciones, las variantes se eligen de una lista', async () => {
    const { user } = await show({ options: [], variants: VARIANTS.map((v) => ({ ...v, optionValues: [] })) });
    await user.selectOptions(screen.getByLabelText('Variante'), 'v-rojo-m');
    await user.click(screen.getByRole('button', { name: 'Comprar ahora' }));
    await settle(1);
    expect(cart()[0]).toMatchObject({ variantId: 'v-rojo-m', variantLabel: 'Única' });
  });

  it('sin variantes no muestra nada', async () => {
    const { container } = await show({ variants: [] });
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ficha de producto: lo que muestra', () => {
  it('cuotas, precio en efectivo, stock, WhatsApp con el producto y medios de pago', async () => {
    const { container } = await show();
    expect(screen.getByText(/3 cuotas sin interés de/)).toBeInTheDocument();
    expect(screen.getByText('● En stock')).toBeInTheDocument();
    const wa = screen.getByRole('link', { name: /Consultar por este producto/ });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/5491155554444\?text=/);
    expect(decodeURIComponent(wa.getAttribute('href')!)).toContain('«Remera»');
    expect(container.querySelectorAll('img[src^="/payment-logos/"]')).toHaveLength(2);
  });

  it('el comercio puede apagar cada dato', async () => {
    await show({
      config: {
        ...CONFIG,
        installmentsCount: 0,
        showSku: false,
        showStock: false,
        askWhatsApp: false,
        showPaymentLogos: false,
        cashDiscountPercent: 0,
      },
    });
    expect(screen.queryByText(/cuotas sin interés/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SKU/)).not.toBeInTheDocument();
    expect(screen.queryByText('● En stock')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Consultar/ })).not.toBeInTheDocument();
  });

  it('compartir usa el menú del sistema si existe y si no copia el link', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const { user } = await show();
    await user.click(screen.getByRole('button', { name: /Compartir/ }));
    expect(share).toHaveBeenCalledWith({ title: 'Remera', url: window.location.href });

    // Sin share nativo: al portapapeles, con aviso.
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(screen.getByRole('button', { name: /Compartir/ }));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(screen.getByText('¡Link copiado!')).toBeInTheDocument();

    // Cancelar el compartir no es un error.
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(new Error('AbortError')),
      configurable: true,
    });
    await user.click(screen.getByRole('button', { name: /Compartir|copiado/ }));
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
});

describe('ficha de producto: galería', () => {
  it.each(['thumbs', 'thumbs-left'] as const)('%s: miniaturas, lupa y visor', async (galleryStyle) => {
    const { user } = await show({ config: { ...CONFIG, galleryStyle } });
    await user.click(screen.getByRole('button', { name: 'Ver imagen 2' }));
    const main = screen
      .getAllByRole('img')
      .find((i) => i.getAttribute('src') === IMAGES[1]!.url && i.getAttribute('alt'))!;
    expect(main).toHaveAttribute('alt', 'Remera'); // sin altText, el nombre

    // Lupa: al pasar el mouse aparece el panel de zoom.
    const box = main.parentElement!;
    box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 260, height: 260 }) as DOMRect;
    fireEvent.mouseEnter(box);
    fireEvent.mouseMove(box, { clientX: 250, clientY: 5 });
    expect(document.querySelector('[style*="background-size"]')).not.toBeNull();
    fireEvent.mouseLeave(box);

    // Visor a pantalla completa.
    await user.click(box);
    const viewer = screen.getByRole('dialog', { name: 'Remera' });
    expect(within(viewer).getByText('2 / 3')).toBeInTheDocument();
  });

  it('el visor: flechas, teclado, miniaturas, zoom y cerrar', async () => {
    const { user } = await show({ config: { ...CONFIG, galleryStyle: 'stacked' } });
    await user.click(screen.getByRole('img', { name: 'Frente' }));
    const viewer = () => screen.getByRole('dialog');
    const at = (text: string) => expect(within(viewer()).getByText(text)).toBeInTheDocument();
    at('1 / 3');

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    at('2 / 3');
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    at('3 / 3');
    await user.keyboard('{ArrowRight}');
    at('1 / 3');
    await user.keyboard('{ArrowLeft}');
    at('3 / 3');

    const big = within(viewer()).getAllByRole('img')[0]!;
    await user.click(big);
    big.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    fireEvent.mouseMove(big, { clientX: 25, clientY: 75 });
    expect(big.style.transform).toBe('scale(2.4)');
    expect(big.style.transformOrigin).toBe('25% 75%');

    const thumbs = within(viewer())
      .getAllByRole('button')
      .filter((b) => b.querySelector('img'));
    await user.click(thumbs[1]!);
    at('2 / 3');

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('img', { name: 'Frente' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['thumbs', 'thumbs-left', 'stacked'] as const)(
    '%s sin imágenes muestra la inicial',
    async (galleryStyle) => {
      await show({ images: [], config: { ...CONFIG, galleryStyle } });
      expect(screen.getAllByText('R').length).toBeGreaterThan(0);
    },
  );
});
