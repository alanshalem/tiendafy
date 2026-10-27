/**
 * Lo que la ficha suma alrededor de la compra: calcular el envío con el código
 * postal (y recordarlo), "Avisame cuando ingrese" en lo agotado, las
 * opiniones (resumen, filtro, orden, fotos, votos y denuncias), la página
 * para escribirlas y las estrellas en el JSON-LD y en las cards.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShippingEstimate } from '../components/store/ShippingEstimate';
import { BackInStock } from '../components/store/BackInStock';
import { ProductReviews } from '../components/store/ProductReviews';
import { ReviewWriter } from '../components/store/ReviewWriter';
import { CardRating } from '../components/store/ReviewStars';
import { reviewsJsonLd } from '../lib/product-json-ld';
import { postalCodeStorageKey } from '../lib/postal-code';
import type { ReviewsPage } from '../lib/reviews';
import { fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';
import { render } from '@testing-library/react';

const money = (amount: number) => ({ amount, currency: 'ARS' });
const user = () => userEvent.setup({ delay: null, pointerEventsCheck: 0 });

let api: MockApi;
let crashes: () => unknown[][];
beforeEach(() => {
  api = mockApi();
  crashes = watchCrashes();
  localStorage.clear();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

const METHODS = {
  items: [
    {
      id: 'retiro',
      name: 'Retiro por el Depósito (AMBA)',
      kind: 'PICKUP',
      price: money(0),
      description: null,
      pickupAddress: 'Av. Siempreviva 742',
    },
    { id: 'moto', name: 'Moto en CABA', kind: 'DELIVERY', price: money(350_000), description: 'En el día' },
  ],
  correoArgentino: { enabled: true, agency: true },
  zipnova: { enabled: true },
  andreani: { enabled: true },
};

describe('calcular envío en la ficha', () => {
  it('muestra el retiro gratis, cotiza con el código postal y lo recuerda', async () => {
    api.on('GET', '/api/v1/shipping/methods', METHODS);
    api.on('POST', '/api/v1/shipping/correo/quote', {
      options: [
        { token: 't', kind: 'D', name: 'Correo a domicilio', price: money(0), etaMin: '3', etaMax: '5' },
      ],
    });
    // Sin credenciales (como en desarrollo): falla, y los demás se muestran igual.
    api.on('POST', '/api/v1/shipping/andreani/quote', { detail: 'No pudimos cotizar con Andreani.' }, 400);
    const u = user();
    renderInStore(<ShippingEstimate variantId="v1" quantity={2} unitPrice={150_000} />);

    expect(await screen.findByText('Retiro gratis')).toBeInTheDocument();
    expect(screen.getByText(/Av\. Siempreviva 742/)).toBeInTheDocument();

    await u.type(screen.getByLabelText('Calcular envío'), '12');
    await u.click(screen.getByRole('button', { name: 'Calcular' }));
    expect(screen.getByRole('alert')).toHaveTextContent('código postal de 4 números');

    await u.clear(screen.getByLabelText('Calcular envío'));
    await u.type(screen.getByLabelText('Calcular envío'), '1636');
    await u.click(screen.getByRole('button', { name: 'Calcular' }));
    expect(await screen.findByText('Envío a CP 1636')).toBeInTheDocument();
    // Gratis primero (ordenado por precio), con su plazo; el medio propio también.
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Correo a domicilio');
    expect(rows[0]).toHaveTextContent('Gratis');
    expect(rows[0]).toHaveTextContent('Llega en 3 a 5 días hábiles');
    expect(rows[1]).toHaveTextContent('Moto en CABA');
    expect(screen.queryByText(/Andreani/)).not.toBeInTheDocument();
    // Zipnova pide la dirección completa: se aclara que hay más en el checkout.
    expect(screen.getByText(/Más opciones con tu dirección completa/)).toBeInTheDocument();

    // La cotización es de la variante y la cantidad elegidas.
    const quote = api.calls.find((c) => c.path === '/api/v1/shipping/correo/quote');
    expect(quote?.body).toMatchObject({
      postalCode: '1636',
      units: 2,
      items: [{ variantId: 'v1', quantity: 2 }],
    });
    expect(JSON.parse(localStorage.getItem(postalCodeStorageKey(fixtureTenantId))!)).toBe('1636');
  });

  it('con el código postal guardado cotiza solo, y si nadie cotiza lo dice sin asustar', async () => {
    localStorage.setItem(postalCodeStorageKey(fixtureTenantId), JSON.stringify('5000'));
    api.on('GET', '/api/v1/shipping/methods', {
      items: [],
      correoArgentino: { enabled: true },
      andreani: { enabled: false },
      zipnova: { enabled: false },
    });
    api.on('POST', '/api/v1/shipping/correo/quote', { detail: 'No pudimos cotizar…' }, 400);
    renderInStore(<ShippingEstimate variantId="v1" quantity={1} unitPrice={100_000} />);
    expect(await screen.findByText(/No pudimos calcular el envío/)).toBeInTheDocument();
    expect(screen.getByLabelText('Calcular envío')).toHaveValue('5000');
  });

  it('sin medios de envío no se muestra', async () => {
    api.on('GET', '/api/v1/shipping/methods', { items: [] });
    const { container } = renderInStore(<ShippingEstimate variantId="v1" quantity={1} unitPrice={100} />);
    await settle(2);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('avisame cuando ingrese', () => {
  it('deja el email para la variante y lo recuerda', async () => {
    const u = user();
    renderInStore(<BackInStock variantId="v-agotada" label="Rojo / S" />);
    await u.type(screen.getByLabelText('Tu email para el aviso'), 'ana@mail.com');
    await u.click(screen.getByRole('button', { name: 'Avisarme' }));
    expect(await screen.findByRole('status')).toHaveTextContent('ana@mail.com cuando ingrese Rojo / S');
    const call = api.calls.find((c) => c.path === '/api/v1/back-in-stock');
    expect(call?.body).toMatchObject({ variantId: 'v-agotada', email: 'ana@mail.com', website: '' });
  });

  it('muestra el motivo si la API no lo acepta', async () => {
    api.on('POST', '/api/v1/back-in-stock', { detail: '¡Ya hay stock! Podés comprarlo ahora.' }, 409);
    const u = user();
    renderInStore(<BackInStock variantId="v1" />);
    await u.type(screen.getByLabelText('Tu email para el aviso'), 'ana@mail.com');
    await u.click(screen.getByRole('button', { name: 'Avisarme' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya hay stock');
  });
});

const review = (id: string, rating: number, extra: Partial<ReviewsPage['items'][number]> = {}) => ({
  id,
  rating,
  title: `Título ${id}`,
  body: `Opinión ${id} con bastante texto.`,
  authorName: 'Ana P.',
  variantLabel: 'Rojo / M',
  photos: [] as string[],
  verified: true,
  helpfulCount: 0,
  reply: null,
  repliedAtUtc: null,
  createdAtUtc: '2026-10-01T12:00:00Z',
  ...extra,
});

const PAGE: ReviewsPage = {
  enabled: true,
  summary: { average: 4.5, count: 6, distribution: [0, 0, 1, 1, 4] },
  items: [
    review('r1', 5, {
      photos: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
      helpfulCount: 2,
    }),
    review('r2', 4, { reply: '¡Gracias por elegirnos!' }),
  ],
  total: 6,
  page: 1,
  totalPages: 2,
};

describe('opiniones de la ficha', () => {
  it('resumen, compra verificada, respuesta de la tienda, fotos y paginado', async () => {
    api.on('GET', '/api/v1/reviews/products/:id', { ...PAGE, page: 2, items: [review('r3', 3)] });
    const u = user();
    renderInStore(<ProductReviews productId="11111111-1111-1111-1111-111111111111" initial={PAGE} />);

    expect(screen.getByRole('heading', { name: 'Opiniones' })).toBeInTheDocument();
    expect(screen.getByText('4,5')).toBeInTheDocument();
    expect(screen.getByText('6 opiniones')).toBeInTheDocument();
    expect(screen.getAllByText('Compra verificada')).toHaveLength(2);
    expect(screen.getByText('¡Gracias por elegirnos!')).toBeInTheDocument();
    // La primera página vino del servidor: no se vuelve a pedir.
    expect(api.calls.some((c) => c.path.startsWith('/api/v1/reviews/products/'))).toBe(false);

    // Las fotos se amplían y se recorren.
    await u.click(screen.getByRole('button', { name: 'Ampliar la foto 2 de Ana P.' }));
    const viewer = screen.getByRole('dialog', { name: 'Fotos de la opinión' });
    expect(within(viewer).getByAltText('Foto 2 de 2')).toBeInTheDocument();
    await u.click(within(viewer).getByRole('button', { name: 'Foto siguiente' }));
    expect(within(viewer).getByAltText('Foto 1 de 2')).toBeInTheDocument();
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Más opiniones' }));
    expect(await screen.findByText('Título r3')).toBeInTheDocument();
    expect(api.calls.at(-1)?.path).toContain('page=2');
  });

  it('filtra por estrellas y cambia el orden', async () => {
    api.on('GET', '/api/v1/reviews/products/:id', { ...PAGE, items: [review('r9', 3)], totalPages: 1 });
    const u = user();
    renderInStore(<ProductReviews productId="11111111-1111-1111-1111-111111111111" initial={PAGE} />);

    // Sin opiniones de 1 estrella: no se puede filtrar por ahí.
    expect(screen.getByRole('button', { name: '1 estrellas: 0 opiniones' })).toBeDisabled();
    await u.click(screen.getByRole('button', { name: '3 estrellas: 1 opinión' }));
    await waitFor(() => expect(api.calls.at(-1)?.path).toContain('rating=3'));
    expect(await screen.findByRole('button', { name: /Solo 3 estrellas/ })).toBeInTheDocument();

    await u.selectOptions(screen.getByRole('combobox', { name: 'Ordenar por' }), 'recent');
    await waitFor(() => expect(api.calls.at(-1)?.path).toContain('sort=recent'));
  });

  it('"me sirvió" una vez y denunciar con motivo', async () => {
    api.on('POST', '/api/v1/reviews/r1/helpful', { helpfulCount: 3 });
    const u = user();
    renderInStore(<ProductReviews productId="11111111-1111-1111-1111-111111111111" initial={PAGE} />);

    const [helpful] = screen.getAllByRole('button', { name: /Me sirvió/ });
    await u.click(helpful!);
    expect(await screen.findByText('(3)')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /¡Gracias!/ })[0]).toBeDisabled();

    await u.click(screen.getAllByRole('button', { name: 'Denunciar' })[0]!);
    await u.selectOptions(screen.getByRole('combobox', { name: 'Motivo de la denuncia' }), 'Es ofensiva');
    await u.click(screen.getByRole('button', { name: 'Enviar denuncia' }));
    expect(screen.getByText('Gracias, la vamos a revisar.')).toBeInTheDocument();
    expect(api.calls.find((c) => c.path === '/api/v1/reviews/r1/report')?.body).toEqual({
      reason: 'Es ofensiva',
    });
  });

  it('sin opiniones lo dice; con la tienda sin reseñas, no hay sección', () => {
    const empty = { ...PAGE, summary: { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] }, items: [] };
    const { unmount } = renderInStore(<ProductReviews productId="p" initial={empty} />);
    expect(screen.getByText(/Todavía no hay opiniones/)).toBeInTheDocument();
    unmount();
    const { container } = renderInStore(
      <ProductReviews productId="p" initial={{ ...empty, enabled: false }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

const INVITE = {
  orderId: 'o1',
  authorName: 'Ana P.',
  items: [
    {
      orderItemId: 'i1',
      productId: 'p1',
      productName: 'Mate imperial',
      productSlug: 'mate-imperial',
      image: null,
      variantLabel: null,
      canReview: true,
      review: null,
    },
    {
      orderItemId: 'i2',
      productId: 'p2',
      productName: 'Bombilla',
      productSlug: 'bombilla',
      image: null,
      variantLabel: null,
      canReview: false,
      review: { rating: 4, status: 'pending' },
    },
  ],
};

describe('escribir una opinión', () => {
  it('con el link del email: estrellas, texto y fotos', async () => {
    api.on('GET', '/api/v1/reviews/invite', INVITE);
    api.on('POST', '/api/v1/reviews/photos', { url: 'https://cdn.example.com/foto.jpg' });
    api.on('POST', '/api/v1/reviews', { id: 'nuevo', status: 'approved' });
    const u = user();
    renderInStore(<ReviewWriter token="tok" orderId={null} />);

    expect(await screen.findByText('Ana P.')).toBeInTheDocument();
    // Lo ya opinado no se vuelve a ofrecer.
    expect(screen.getByText(/se publica cuando la tienda la revise/)).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Publicar mi opinión' }));
    // El submit espera el captcha antes de validar: la alerta llega en un tick posterior.
    expect(await screen.findByRole('alert')).toHaveTextContent('Elegí de 1 a 5 estrellas');
    await u.click(screen.getByRole('radio', { name: /5 estrellas: Excelente/ }));
    await u.type(screen.getByLabelText('Tu opinión'), 'Excelente, lo recomiendo.');
    const file = new File(['x'], 'foto.png', { type: 'image/png' });
    await u.upload(screen.getByLabelText(/Sumar/), file);
    expect(await screen.findByRole('button', { name: 'Quitar la foto' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Publicar mi opinión' }));

    expect(await screen.findByText('¡Gracias! Tu opinión ya está publicada.')).toBeInTheDocument();
    const sent = api.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/reviews');
    expect(sent?.body).toMatchObject({
      token: 'tok',
      orderItemId: 'i1',
      rating: 5,
      body: 'Excelente, lo recomiendo.',
      photos: ['https://cdn.example.com/foto.jpg'],
    });
  });

  it('desde la cuenta pide el link con la sesión; sin sesión, a iniciarla', async () => {
    api.on('GET', '/api/v1/shop/orders/o1/review-invite', {}, 401);
    renderInStore(<ReviewWriter token={null} orderId="o1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Iniciá sesión para opinar');
    expect(screen.getByRole('link', { name: 'Ir a mi cuenta' })).toBeInTheDocument();
  });

  it('una compra que todavía no se despachó lo explica', async () => {
    api.on('GET', '/api/v1/shop/orders/o2/review-invite', {
      eligible: false,
      reason: 'Vas a poder opinar cuando tu compra esté despachada.',
      token: null,
    });
    renderInStore(<ReviewWriter token={null} orderId="o2" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('cuando tu compra esté despachada');
  });

  it('un link vencido o adulterado', async () => {
    api.on('GET', '/api/v1/reviews/invite', { detail: 'El link para opinar no es válido o ya venció.' }, 400);
    renderInStore(<ReviewWriter token="malo" orderId={null} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('no es válido o ya venció');
  });
});

describe('estrellas en las cards y en Google', () => {
  it('la card muestra estrellas y cantidad solo si hay reseñas', () => {
    const { container, rerender } = render(<CardRating rating={{ average: 4.3, count: 12 }} />);
    expect(screen.getByRole('img', { name: '4,3 de 5 estrellas' })).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();
    rerender(<CardRating rating={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('aggregateRating y hasta cinco reseñas; sin reseñas, nada', () => {
    const ld = reviewsJsonLd(PAGE);
    expect(ld.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: '4.5',
      reviewCount: 6,
      bestRating: 5,
      worstRating: 1,
    });
    expect(ld.review).toEqual([
      expect.objectContaining({
        '@type': 'Review',
        author: { '@type': 'Person', name: 'Ana P.' },
        reviewRating: expect.objectContaining({ ratingValue: 5 }),
        datePublished: '2026-10-01',
      }),
      expect.anything(),
    ]);
    expect(reviewsJsonLd({ ...PAGE, summary: { ...PAGE.summary, count: 0 } })).toEqual({});
    expect(reviewsJsonLd(null)).toEqual({});
  });
});
