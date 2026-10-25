/**
 * Las claves de React Query que se comparten entre pantallas (las que se
 * piden en una y se invalidan desde otra). Antes cada una se escribía a mano
 * en cada lugar, y una que no coincidía ('stores' por 'tenants', una sin la
 * tienda) invalidaba algo que no existía sin que nadie se enterara.
 *
 * Reglas:
 * - Lo que es de una tienda lleva la tienda en el segundo lugar: cambiar de
 *   tienda no vacía el cache, cambia la clave.
 * - Invalidar es por prefijo: `qk.products(tienda)` refresca todas las
 *   consultas de productos de esa tienda (`productsCount`, `productsAdmin`…).
 *   Por eso las variantes de una familia empiezan igual que la familia.
 * - Los filtros de un listado van al final y son opcionales: sin ellos, la
 *   clave es el prefijo que se invalida.
 *
 * Las claves de una sola pantalla pueden quedar escritas ahí mismo.
 */

/** La tienda activa (`store?.id`); undefined mientras no hay una elegida. */
type StoreId = string | undefined;

export const qk = {
  /* ---------- Tiendas (las de la cuenta: no son de una tienda) ---------- */
  tenants: () => ['tenants'] as const,
  tenantsPage: (page: number, q: string) => ['tenants', 'pagina', page, q] as const,

  /* ---------- Inteligencia artificial ---------- */
  /** Qué tareas de IA puede usar esta persona en esta tienda (disponibilidad y motivo). */
  aiStatus: (store: StoreId) => ['ai-status', store] as const,

  /* ---------- Catálogo ---------- */
  categories: (store: StoreId) => ['categories', store] as const,
  products: (store: StoreId) => ['products', store] as const,
  productsCount: (store: StoreId) => ['products', store, 'count'] as const,
  productsExportCount: (store: StoreId) => ['products', store, 'export-count'] as const,
  productsAdmin: (store: StoreId, search: string, filters: object, sort: string, page: number) =>
    ['products', store, 'admin', search, filters, sort, page] as const,
  product: (store: StoreId, id: string | undefined) => ['product', store, id] as const,
  /** Una página del catálogo (Costos filtra por sin costo; Inventario, por stock). */
  productsPage: (store: StoreId, q: string, page: number, filter: boolean | string) =>
    ['products-page', store, q, page, filter] as const,
  catalogHealth: (store: StoreId) => ['catalog-health', store] as const,
  inventory: (store: StoreId) => ['inventory', store] as const,
  /** Stock de esas variantes (ids separados por coma). */
  inventoryOf: (store: StoreId, variantIds: string) => ['inventory', store, variantIds] as const,
  /** Stock de las variantes de un producto (la edición). */
  inventoryOfProduct: (store: StoreId, variantIds: string) =>
    ['inventory', store, 'product', variantIds] as const,
  /** El historial de movimientos de una variante: guardar stock lo refresca (mismo prefijo). */
  inventoryLedger: (store: StoreId, variantId: string) => ['inventory', store, 'ledger', variantId] as const,
  variantCosts: (store: StoreId, ...page: [] | [productIds: string]) =>
    ['variant-costs', store, ...page] as const,
  priceListsPicker: (store: StoreId) => ['price-lists-picker', store] as const,

  /* ---------- Ventas ---------- */
  orders: (store: StoreId) => ['orders', store] as const,
  ordersList: (store: StoreId, params: string) => ['orders', store, 'list', params] as const,
  ordersPendingFulfillment: (store: StoreId) => ['orders', store, 'pending-fulfillment'] as const,
  order: (store: StoreId, id: string | null) => ['orders', store, 'one', id] as const,
  /** Sin argumentos: la cola de todas las tiendas (la que invalida el escáner de despacho). */
  fulfillmentQueue: (...filters: [] | [store: StoreId, carrier: string, from: string, to: string]) =>
    ['fulfillment-queue', ...filters] as const,

  /* ---------- Clientes ---------- */
  customers: (store: StoreId, ...list: [] | [query: string, page: number]) =>
    ['customers', store, ...list] as const,
  customerProfile: (store: StoreId, id: string) => ['customer-profile', store, id] as const,
  customerTags: (store: StoreId) => ['customer-tags', store] as const,

  /* ---------- Compras ---------- */
  purchaseOrders: (
    store: StoreId,
    ...list: [] | [page: number, search: string, status: string, group: string]
  ) => ['purchase-orders', store, ...list] as const,
  purchaseOrder: (store: StoreId, id: string | null) => ['purchase-order', store, id] as const,
  /** `leadParam` es el querystring del plazo de reposición ('' = el de la tienda). */
  reorderSuggestions: (store: StoreId, leadParam: string) =>
    ['reorder-suggestions', store, leadParam] as const,

  /* ---------- Finanzas ---------- */
  financeAccounts: (store: StoreId) => ['finance-accounts', store] as const,
  financeMovements: (store: StoreId, ...list: [] | [accountId: string, page: number]) =>
    ['finance-movements', store, ...list] as const,
  financeBalances: (store: StoreId, ...list: [] | [partyKind: string, page: number]) =>
    ['finance-balances', store, ...list] as const,
  /** La cuenta de alguien: con página (Cuentas corrientes) o los últimos movimientos (la ficha). */
  financeLedger: (
    store: StoreId,
    ...party: [] | [partyKind: string, partyId: string] | [partyKind: string, partyId: string, page: number]
  ) => ['finance-ledger', store, ...party] as const,
  financeReceipts: (store: StoreId, ...list: [] | [kind: string]) =>
    ['finance-receipts', store, ...list] as const,
  financeParties: (store: StoreId, partyKind: string, q: string) =>
    ['finance-parties', store, partyKind, q] as const,
  financePending: (store: StoreId, partyKind: string, partyId: string | undefined) =>
    ['finance-pending', store, partyKind, partyId] as const,

  /* ---------- Avisos y bandeja ---------- */
  stockAlerts: (store: StoreId) => ['stock-alerts', store] as const,
  stockAlertsCount: (store: StoreId) => ['stock-alerts-count', store] as const,
  stockAlertSettings: (store: StoreId) => ['stock-alert-settings', store] as const,
  inboxCounts: (store: StoreId) => ['inbox-counts', store] as const,

  /* ---------- Contenido y redes ---------- */
  pages: (store: StoreId, ...list: [] | [page: number, q: string]) => ['pages', store, ...list] as const,
  socialPosts: (store: StoreId, ...list: [] | [status: string, page: number]) =>
    ['social-posts', store, ...list] as const,

  /* ---------- Equipo ---------- */
  /** Sin tienda: un cambio de permisos invalida el equipo de todas. */
  members: (...list: [] | [store: StoreId, page: number]) => ['members', ...list] as const,
  teamActivity: (...list: [] | [store: StoreId, page: number]) => ['team-activity', ...list] as const,
  /** La matriz de roles de la tienda. */
  accessMatrix: (store: StoreId) => ['access-matrix', store] as const,
};
