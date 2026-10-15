/**
 * Las claves de React Query de lib/queryKeys: cada una es EXACTAMENTE el array
 * que se escribía a mano antes de centralizarlas (más la tienda donde faltaba),
 * así el cache y las invalidaciones siguen coincidiendo como antes.
 */
import { partialMatchKey } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { qk } from '../lib/queryKeys';

const S = 'tienda-1';

describe('qk: las mismas claves de antes', () => {
  it.each([
    [qk.tenants(), ['tenants']],
    [qk.tenantsPage(2, 'deportes'), ['tenants', 'pagina', 2, 'deportes']],
    [qk.categories(S), ['categories', S]],
    [qk.products(S), ['products', S]],
    [qk.productsCount(S), ['products', S, 'count']],
    [qk.productsExportCount(S), ['products', S, 'export-count']],
    [
      qk.productsAdmin(S, 'pesa', { cat: 'x' }, 'name', 3),
      ['products', S, 'admin', 'pesa', { cat: 'x' }, 'name', 3],
    ],
    [qk.product(S, 'p1'), ['product', S, 'p1']],
    [qk.productsPage(S, 'q', 1, true), ['products-page', S, 'q', 1, true]],
    [qk.productsPage(S, 'q', 1, 'low'), ['products-page', S, 'q', 1, 'low']],
    [qk.catalogHealth(S), ['catalog-health', S]],
    [qk.inventory(S), ['inventory', S]],
    [qk.inventoryOf(S, 'v1,v2'), ['inventory', S, 'v1,v2']],
    [qk.inventoryOfProduct(S, 'v1'), ['inventory', S, 'product', 'v1']],
    [qk.variantCosts(S), ['variant-costs', S]],
    [qk.variantCosts(S, 'p1,p2'), ['variant-costs', S, 'p1,p2']],
    [qk.priceListsPicker(S), ['price-lists-picker', S]],
    [qk.orders(S), ['orders', S]],
    [qk.ordersList(S, 'estado=PAID'), ['orders', S, 'list', 'estado=PAID']],
    [qk.ordersPendingFulfillment(S), ['orders', S, 'pending-fulfillment']],
    [qk.order(S, 'o1'), ['orders', S, 'one', 'o1']],
    [qk.fulfillmentQueue(), ['fulfillment-queue']],
    [
      qk.fulfillmentQueue(S, 'andreani', '2026-10-01', ''),
      ['fulfillment-queue', S, 'andreani', '2026-10-01', ''],
    ],
    [qk.customers(S), ['customers', S]],
    [qk.customers(S, 'q=ana', 2), ['customers', S, 'q=ana', 2]],
    [qk.customerProfile(S, 'c1'), ['customer-profile', S, 'c1']],
    [qk.customerTags(S), ['customer-tags', S]],
    [qk.purchaseOrders(S), ['purchase-orders', S]],
    [qk.purchaseOrders(S, 1, 'x', 'DRAFT', ''), ['purchase-orders', S, 1, 'x', 'DRAFT', '']],
    [qk.purchaseOrder(S, 'po1'), ['purchase-order', S, 'po1']],
    [qk.reorderSuggestions(S, ''), ['reorder-suggestions', S, '']],
    [qk.financeAccounts(S), ['finance-accounts', S]],
    [qk.financeMovements(S), ['finance-movements', S]],
    [qk.financeMovements(S, 'a1', 2), ['finance-movements', S, 'a1', 2]],
    [qk.financeBalances(S), ['finance-balances', S]],
    [qk.financeBalances(S, 'customer', 1), ['finance-balances', S, 'customer', 1]],
    [qk.financeLedger(S), ['finance-ledger', S]],
    [qk.financeLedger(S, 'customer', 'c1'), ['finance-ledger', S, 'customer', 'c1']],
    [qk.financeLedger(S, 'supplier', 's1', 2), ['finance-ledger', S, 'supplier', 's1', 2]],
    [qk.financeReceipts(S), ['finance-receipts', S]],
    [qk.financeReceipts(S, 'collection'), ['finance-receipts', S, 'collection']],
    [qk.financeParties(S, 'customer', 'ana'), ['finance-parties', S, 'customer', 'ana']],
    [qk.financePending(S, 'customer', 'c1'), ['finance-pending', S, 'customer', 'c1']],
    [qk.stockAlerts(S), ['stock-alerts', S]],
    [qk.stockAlertsCount(S), ['stock-alerts-count', S]],
    [qk.stockAlertSettings(S), ['stock-alert-settings', S]],
    [qk.inboxCounts(S), ['inbox-counts', S]],
    [qk.pages(S), ['pages', S]],
    [qk.pages(S, 1, 'faq'), ['pages', S, 1, 'faq']],
    [qk.socialPosts(S), ['social-posts', S]],
    [qk.socialPosts(S, 'failed', 1), ['social-posts', S, 'failed', 1]],
    [qk.members(), ['members']],
    [qk.members(S, 1), ['members', S, 1]],
    [qk.teamActivity(), ['team-activity']],
    [qk.teamActivity(S, 1), ['team-activity', S, 1]],
    [qk.accessMatrix(S), ['access-matrix', S]],
  ])('%j', (key, literal) => {
    expect(key).toEqual(literal);
  });

  it('sin tienda elegida, la tienda queda undefined en su lugar (como store?.id)', () => {
    expect(qk.categories(undefined)).toEqual(['categories', undefined]);
    expect(qk.categories(undefined)).toHaveLength(2);
  });
});

describe('qk: invalidar por prefijo', () => {
  it('la familia de una tienda alcanza a todas sus variantes, y no a las de otra tienda', () => {
    const family = qk.products(S);
    for (const key of [
      qk.productsCount(S),
      qk.productsExportCount(S),
      qk.productsAdmin(S, '', {}, 'name', 1),
    ])
      expect(partialMatchKey(key, family)).toBe(true);
    expect(partialMatchKey(qk.productsCount('otra'), family)).toBe(false);
    // 'product' (uno) no es 'products' (la lista).
    expect(partialMatchKey(qk.product(S, 'p1'), family)).toBe(false);
  });

  it('los listados con filtros caen bajo su prefijo sin filtros', () => {
    const pairs: [readonly unknown[], readonly unknown[]][] = [
      [qk.inventoryOf(S, 'v1'), qk.inventory(S)],
      [qk.inventoryOfProduct(S, 'v1'), qk.inventory(S)],
      [qk.variantCosts(S, 'p1'), qk.variantCosts(S)],
      [qk.order(S, 'o1'), qk.orders(S)],
      [qk.ordersList(S, ''), qk.orders(S)],
      [qk.customers(S, '', 1), qk.customers(S)],
      [qk.purchaseOrders(S, 1, '', '', ''), qk.purchaseOrders(S)],
      [qk.financeLedger(S, 'customer', 'c1'), qk.financeLedger(S)],
      [qk.financeMovements(S, 'a1', 1), qk.financeMovements(S)],
      [qk.pages(S, 1, ''), qk.pages(S)],
      [qk.socialPosts(S, '', 1), qk.socialPosts(S)],
      [qk.fulfillmentQueue(S, '', '', ''), qk.fulfillmentQueue()],
      [qk.members(S, 1), qk.members()],
      [qk.teamActivity(S, 1), qk.teamActivity()],
      [qk.tenantsPage(1, ''), qk.tenants()],
    ];
    for (const [key, prefix] of pairs) expect(partialMatchKey(key, prefix)).toBe(true);
  });
});
