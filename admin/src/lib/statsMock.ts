/**
 * Mock data determinístico para los dashboards de estadísticas.
 * Seed fija → mismos números entre renders (no parpadea). Reemplazable
 * por queries reales cuando exista el módulo de analytics.
 */

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function series(seed: number, length: number, min: number, max: number): number[] {
  const rng = seeded(seed);
  return Array.from({ length }, () => Math.round(min + rng() * (max - min)));
}

export const last7Labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const last12hLabels = Array.from({ length: 12 }, (_, i) => `${(i * 2).toString().padStart(2, '0')}h`);

export function formatArs(cents: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

export function formatArsShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${value}`;
}

/** Mock de "Vista general". */
export const overviewMock = {
  visits: { value: 1842, spark: series(11, 14, 40, 220) },
  sales: { value: 47, spark: series(22, 14, 0, 9) },
  revenue: { value: 238_4500_00, spark: series(33, 14, 0, 400) },
  avgTicket: { value: 50_7340_0, spark: series(44, 14, 30, 90) },
  visitorBehavior: [
    { label: 'Total de visitas', value: 1842 },
    { label: 'Vista de categoría', value: 612 },
    { label: 'Vista de producto', value: 938 },
    { label: 'Carritos creados', value: 121 },
  ],
  checkoutBehavior: [
    { label: 'Checkout iniciado', value: 121 },
    { label: 'Etapa de entrega', value: 98 },
    { label: 'Etapa de pago', value: 71 },
    { label: 'Pedidos creados', value: 53 },
    { label: 'Pedidos pagos', value: 47 },
  ],
  visitToSale: 2.55,
  visitToCart: 6.57,
};

/** Mock de "Productos" (estadísticas). */
export const productsStatsMock = {
  topSold: [
    { label: 'Zapatillas Air Jordan', value: 34 },
    { label: 'Campera 2 en 1 Hombre', value: 28 },
    { label: 'Remera Mercedes AMG', value: 21 },
    { label: 'Camperón Nike Air', value: 18 },
    { label: 'Vaso Cervecero Inox', value: 15 },
    { label: 'Chaleco Jordan Térmico', value: 12 },
  ],
  topRevenue: [
    { label: 'Zapatillas Air Jordan', value: 3_379_600 },
    { label: 'Campera 2 en 1 Hombre', value: 1_568_000 },
    { label: 'Camperón Jordan Importado', value: 756_000 },
    { label: 'The North Face 700', value: 924_000 },
    { label: 'Chaleco Jordan Térmico', value: 453_600 },
  ],
  variantDetail: [
    { name: 'Zapatillas Air Jordan', variant: '42', sold: 14, revenue: 1_391_600 },
    { name: 'Zapatillas Air Jordan', variant: '43', sold: 12, revenue: 1_192_800 },
    { name: 'Campera 2 en 1 Hombre', variant: 'Negro / M', sold: 9, revenue: 504_000 },
    { name: 'Remera Mercedes AMG', variant: 'L', sold: 8, revenue: 106_400 },
    { name: 'Camperón Nike Air', variant: 'Blanco / L', sold: 7, revenue: 294_000 },
  ],
  reservedStock: [
    { name: 'Zapatillas Air Jordan', variant: '41', reserved: 2 },
    { name: 'Camperón Jordan Importado', variant: 'Blanco / XL', reserved: 1 },
  ],
};

/** Mock de "Ventas y clientes". */
export const salesMock = {
  orders: { value: 53, spark: series(51, 14, 0, 11) },
  revenue: { value: 238_4500_00, spark: series(52, 14, 0, 360) },
  avgTicket: { value: 50_7340_0, spark: series(53, 14, 40, 80) },
  byPaymentStatus: {
    categories: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    paid: series(61, 7, 2, 9),
    pending: series(62, 7, 0, 3),
  },
  customers: [
    { name: 'Sofía Martínez', email: 'sofia.m@mail.com', location: 'CABA', orders: 4, total: 312_400 },
    { name: 'Bruno Torres', email: 'bruno.t@mail.com', location: 'Córdoba', orders: 3, total: 268_900 },
    { name: 'Camila Ríos', email: 'camila.r@mail.com', location: 'Rosario', orders: 2, total: 184_500 },
    { name: 'Diego Paz', email: 'diego.p@mail.com', location: 'Mendoza', orders: 2, total: 156_000 },
    { name: 'Lucía Fernández', email: 'lucia.f@mail.com', location: 'La Plata', orders: 1, total: 98_900 },
  ],
  byMethod: { categories: ['Tarjeta', 'Transf.', 'Efectivo', 'Mercado Pago'], values: series(71, 4, 30, 220) },
  byInstallments: [
    { label: '1 cuota', value: 42, tint: 1 },
    { label: '3 cuotas', value: 28, tint: 0.7 },
    { label: '6 cuotas', value: 19, tint: 0.45 },
    { label: '12 cuotas', value: 11, tint: 0.25 },
  ],
  installmentsEvolution: { categories: last7Labels, values: series(72, 7, 20, 180) },
  shipping: { categories: last7Labels, paid: series(73, 7, 1, 7), free: series(74, 7, 0, 4) },
  topProvincesRevenue: [
    { label: 'Buenos Aires', value: 1_240_000 },
    { label: 'Córdoba', value: 680_000 },
    { label: 'Santa Fe', value: 520_000 },
    { label: 'Mendoza', value: 310_000 },
    { label: 'Tucumán', value: 180_000 },
  ],
  topProvincesSales: [
    { label: 'Buenos Aires', value: 24 },
    { label: 'Córdoba', value: 12 },
    { label: 'Santa Fe', value: 9 },
    { label: 'Mendoza', value: 5 },
    { label: 'Tucumán', value: 3 },
  ],
};

/** Mock de "Visitas". */
export const visitsMock = {
  total: 1842,
  spark: series(81, 14, 40, 220),
  topCatalog: [
    { label: 'Zapatillas Air Jordan', value: 312 },
    { label: 'Campera 2 en 1 Hombre', value: 248 },
    { label: 'Remera Mercedes AMG', value: 196 },
    { label: 'Camperón Nike Air', value: 154 },
    { label: 'Vaso Cervecero Inox', value: 121 },
  ],
  recurrence: { categories: last7Labels, nuevos: series(82, 7, 20, 90), recurrentes: series(83, 7, 10, 50) },
  byDevice: { categories: last7Labels, mobile: series(84, 7, 40, 160), desktop: series(85, 7, 10, 70) },
  byEvents: [
    { label: 'Vista de home', value: 1842 },
    { label: 'Vista de categoría', value: 612 },
    { label: 'Vista de producto', value: 938 },
    { label: 'Carrito creado', value: 121 },
    { label: 'Checkout iniciado', value: 71 },
  ],
  eventsDistribution: series(86, 14, 10, 90),
  utmSource: { categories: ['Instagram', 'Google', 'Directo', 'Facebook'], values: series(87, 4, 60, 320) },
  utmMedium: { categories: ['Orgánico', 'CPC', 'Social', 'Email'], values: series(88, 4, 40, 260) },
  utmCampaign: { categories: ['Hot Sale', 'Invierno', 'Lanzam.', 'Remarketing'], values: series(89, 4, 30, 200) },
};

/** Mock de "Tiempo real". */
export const realtimeMock = {
  behavior: [
    { label: 'Navegando', value: 12 },
    { label: 'Vista de producto', value: 8 },
    { label: 'En el carrito', value: 3 },
    { label: 'En checkout', value: 1 },
  ],
  activeVisitors: 24,
  accessDistribution: series(91, 24, 2, 28),
  recurrence: [
    { label: 'Nuevos', value: 62, tint: 1 },
    { label: 'Recurrentes', value: 38, tint: 0.4 },
  ],
  byOrigin: [
    { origin: 'Instagram', medium: 'Social', visitors: 9 },
    { origin: 'Google', medium: 'Orgánico', visitors: 7 },
    { origin: 'Directo', medium: '—', visitors: 5 },
    { origin: 'Facebook', medium: 'Social', visitors: 3 },
  ],
  todayVisits: 412,
  todayOrders: 8,
  todayRevenue: 386_550_0,
};

/** Mock de "Reporte de cupones". */
export const couponsMock = {
  topCoupons: [
    { label: 'BIENVENIDA10', value: 142 },
    { label: 'INVIERNO20', value: 98 },
    { label: 'ENVIOGRATIS', value: 76 },
    { label: 'HOTSALE30', value: 54 },
    { label: 'CUMPLE15', value: 31 },
  ],
  salesByCoupon: [
    { code: 'BIENVENIDA10', type: '10% OFF', uses: 142, discount: 184_300, revenue: 1_658_700 },
    { code: 'INVIERNO20', type: '20% OFF', uses: 98, discount: 312_900, revenue: 1_251_600 },
    { code: 'ENVIOGRATIS', type: 'Envío gratis', uses: 76, discount: 91_200, revenue: 988_400 },
    { code: 'HOTSALE30', type: '30% OFF', uses: 54, discount: 486_000, revenue: 1_134_000 },
    { code: 'CUMPLE15', type: '15% OFF', uses: 31, discount: 69_750, revenue: 395_250 },
  ],
};
