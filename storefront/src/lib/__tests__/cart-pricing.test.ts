import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CartLine } from '@/components/store/cart';
import {
  fetchVariantSnapshots,
  issueText,
  lineIssue,
  mergePriceChanges,
  reprice,
  type VariantSnapshot,
} from '../cart-pricing';

const line = (variantId: string, priceAmount: number, quantity = 1): CartLine => ({
  variantId,
  productName: `Producto ${variantId}`,
  variantLabel: 'Única',
  priceAmount,
  currency: 'ARS',
  image: null,
  quantity,
});
const snap = (variantId: string, amount: number, available = 10): VariantSnapshot => ({
  variantId,
  price: { amount, currency: 'ARS' },
  available,
});

afterEach(() => vi.unstubAllGlobals());

describe('reprice', () => {
  it('actualiza los precios que cambiaron, avisa cuáles y anota el stock', () => {
    const r = reprice(
      [line('a', 100), line('b', 200), line('c', 300)],
      new Map([
        ['a', snap('a', 150, 2)],
        ['b', snap('b', 200, 0)],
      ]),
    );
    expect(r.lines.map((l) => l.priceAmount)).toEqual([150, 200, 300]);
    expect(r.changes).toEqual([
      { variantId: 'a', productName: 'Producto a', from: 100, to: 150, currency: 'ARS' },
    ]);
    // c no volvió: ya no se vende.
    expect(r.availability).toEqual({ a: 2, b: 0, c: null });
  });
});

describe('mergePriceChanges', () => {
  const change = (from: number, to: number) => ({
    variantId: 'a',
    productName: 'A',
    from,
    to,
    currency: 'ARS',
  });

  it('conserva el precio original si cambió dos veces y lo descarta si volvió', () => {
    expect(mergePriceChanges([change(100, 150)], [change(150, 180)])).toEqual([change(100, 180)]);
    expect(mergePriceChanges([change(100, 150)], [change(150, 100)])).toEqual([]);
    expect(mergePriceChanges([change(100, 150)], [])).toEqual([change(100, 150)]);
  });
});

describe('lineIssue', () => {
  it('sin consultar no hay problema; después, despublicada, agotada o con menos stock', () => {
    expect(lineIssue(line('a', 1, 2), null)).toBeNull();
    expect(lineIssue(line('a', 1, 2), { b: 3 })).toBeNull();
    expect(lineIssue(line('a', 1, 2), { a: null })).toEqual({ kind: 'gone' });
    expect(lineIssue(line('a', 1, 2), { a: 0 })).toEqual({ kind: 'out' });
    expect(lineIssue(line('a', 1, 2), { a: 1 })).toEqual({ kind: 'short', available: 1 });
    expect(lineIssue(line('a', 1, 2), { a: 2 })).toBeNull();
  });

  it('cada problema se explica con lo que hay que hacer', () => {
    expect(issueText({ kind: 'gone' })).toMatch(/Ya no está a la venta/);
    expect(issueText({ kind: 'out' })).toMatch(/sin stock/);
    expect(issueText({ kind: 'short', available: 1 })).toMatch(/Queda 1 sola unidad/);
    expect(issueText({ kind: 'short', available: 3 })).toMatch(/Quedan 3 unidades/);
  });
});

describe('fetchVariantSnapshots', () => {
  const respond = (body: unknown, status = 200) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));

  it('pide cada variante una vez y devuelve lo vigente por id', async () => {
    respond({ items: [snap('a', 150)] });
    const result = await fetchVariantSnapshots('t-1', ['a', 'a', 'b']);
    expect(result?.get('a')?.price.amount).toBe(150);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/v1\/products\/variants\?ids=a,b$/);
    expect((init as RequestInit).headers).toMatchObject({ 'X-Tenant-Id': 't-1' });
  });

  it('sin líneas no pregunta nada', async () => {
    respond({ items: [] });
    expect(await fetchVariantSnapshots('t-1', [])).toEqual(new Map());
    expect(fetch).not.toHaveBeenCalled();
  });

  it('si no se puede saber (error, respuesta rara, sin red), devuelve null', async () => {
    respond({}, 500);
    expect(await fetchVariantSnapshots('t-1', ['a'])).toBeNull();
    respond({ nada: true });
    expect(await fetchVariantSnapshots('t-1', ['a'])).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await fetchVariantSnapshots('t-1', ['a'])).toBeNull();
  });
});
