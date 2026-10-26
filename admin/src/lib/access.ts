/**
 * Permisos del panel: qué pantalla pide qué permiso, en UN lugar.
 *
 * Las rutas, el menú lateral, el de Configuración y el buscador (Ctrl+K)
 * preguntan acá. Antes cada uno tenía su copia del permiso de cada pantalla y
 * se desincronizaban: "Dominios" se mostraba con un permiso y el backend pedía
 * otro, y la entrada de Configuración no contaba la Ficha técnica.
 *
 * Las claves son las del catálogo del backend (GET /api/v1/members/roles); un
 * test verifica que sean las mismas.
 */
export const PERMISSION_KEYS = [
  'stats.read',
  'costs.read',
  'orders.read',
  'orders.create',
  'orders.fulfill',
  'orders.refund',
  'quotes.manage',
  'meli.operate',
  'meli.publish',
  'meli.config',
  'catalog.write',
  'prices.manage',
  'inventory.read',
  'inventory.write',
  'purchasing.manage',
  'customers.read',
  'customers.write',
  'support.chat',
  'messages.read',
  'reviews.manage',
  'discounts.read',
  'discounts.write',
  'campaigns.manage',
  'social.publish',
  'ads.manage',
  'content.write',
  'finance.manage',
  'fiscal.emit',
  'fiscal.config',
  'payments.read',
  'payments.write',
  'shipping.config',
  'notifications.config',
  'store.config',
  'ai.config',
  'members.read',
  'members.manage',
  'roles.manage',
  'tenant.admin',
] as const;

export type Perm = (typeof PERMISSION_KEYS)[number];

/** Uno o varios permisos: con varios, alcanza con tener alguno. */
export type PermRequirement = Perm | readonly Perm[];

/** Base de las pantallas de Configuración. */
export const SETTINGS_BASE = '/configuracion';

/**
 * Pantallas de Configuración, en el orden en que conviene caer al entrar a
 * /configuracion (la primera que la persona puede ver).
 */
export const SETTINGS_PERMISSIONS = {
  'medios-de-pago': 'payments.read',
  'medios-de-envio': 'shipping.config',
  mercadolibre: 'meli.config',
  facturacion: 'fiscal.config',
  'datos-legales': 'store.config',
  'emails-automaticos': 'notifications.config',
  'whatsapp-automatico': 'notifications.config',
  'ficha-tecnica': 'catalog.write',
  busqueda: 'catalog.write',
  'alertas-de-stock': 'inventory.write',
  'opciones-del-checkout': 'store.config',
  usuarios: 'members.read',
  roles: 'members.read',
  dominios: 'tenant.admin',
  redirecciones: 'store.config',
  medicion: 'store.config',
  'inteligencia-artificial': 'ai.config',
} as const satisfies Record<string, PermRequirement>;

type SettingsPath = keyof typeof SETTINGS_PERMISSIONS;

/** Pantallas del panel principal. Las que no están acá son de todos (Inicio, Mis tiendas, Ayuda). */
const MAIN_PERMISSIONS: Record<string, PermRequirement> = {
  '/estadisticas': 'stats.read',
  '/estadisticas/productos': 'stats.read',
  '/estadisticas/ventas': 'stats.read',
  '/estadisticas/rentabilidad': 'costs.read',
  '/estadisticas/visitas': 'stats.read',
  '/estadisticas/tiempo-real': 'stats.read',
  '/estadisticas/cupones': 'stats.read',

  '/ventas': 'orders.read',
  '/ventas/carritos': 'orders.read',
  '/ventas/despacho': 'orders.fulfill',
  '/bandeja': ['messages.read', 'support.chat', 'meli.operate'],
  '/presupuestos': 'quotes.manage',
  '/mercadolibre': ['meli.operate', 'meli.publish'],

  '/productos': ['inventory.read', 'catalog.write'],
  '/productos/nuevo': 'catalog.write',
  '/productos/:id/editar': 'catalog.write',
  '/productos/exportar-importar': 'catalog.write',
  '/productos/fichas-ia': 'catalog.write',
  '/productos/fichas-ia/:jobId': 'catalog.write',
  '/productos/categorias': 'catalog.write',
  '/productos/kits': 'catalog.write',
  '/productos/inventario': 'inventory.read',
  '/productos/escaner': 'inventory.read',
  '/productos/stock-bajo': 'inventory.read',
  '/productos/esperando': 'inventory.read',
  '/productos/costos': 'costs.read',
  '/productos/listas-de-precios': 'prices.manage',
  '/compras': 'purchasing.manage',
  '/proveedores': 'purchasing.manage',

  '/clientes': 'customers.read',
  '/clientes/:id': 'customers.read',
  '/mensajes': 'messages.read',
  '/posventa': 'support.chat',
  '/resenas': 'reviews.manage',

  '/descuentos': 'discounts.read',
  '/marketing': 'campaigns.manage',
  '/redes': 'social.publish',

  '/canales/tienda-online': 'content.write',
  '/canales/tienda-online/disenios': 'content.write',
  '/paginas': 'content.write',

  '/tesoreria': 'finance.manage',
  '/cuentas-corrientes': 'finance.manage',
};

/** El permiso que pide una pantalla (path completo), o undefined si es de todos. */
export function routePerm(path: string): PermRequirement | undefined {
  if (path.startsWith(`${SETTINGS_BASE}/`))
    return SETTINGS_PERMISSIONS[path.slice(SETTINGS_BASE.length + 1) as SettingsPath];
  return MAIN_PERMISSIONS[path];
}

/** ¿Tiene ALGUNO de los permisos pedidos? Sin requisito, sí. */
export function satisfies(can: (perm: Perm) => boolean, req: PermRequirement | undefined): boolean {
  if (req === undefined) return true;
  return (typeof req === 'string' ? [req] : req).some(can);
}

/** La primera pantalla de Configuración que la persona puede ver, o null si ninguna. */
export function firstSettingsPath(can: (perm: Perm) => boolean): SettingsPath | null {
  const all = Object.keys(SETTINGS_PERMISSIONS) as SettingsPath[];
  return all.find((p) => satisfies(can, SETTINGS_PERMISSIONS[p])) ?? null;
}

// ---------------------------------------------------------------- la matriz

/** Un permiso del catálogo, como lo manda el backend. */
export interface PermissionInfo {
  key: Perm;
  group: string;
  label: string;
  description: string;
  sensitive: boolean;
  ownerOnly: boolean;
  /** Permiso sin el cual este no sirve. */
  requires: Perm | null;
}

/**
 * Tildar o destildar un permiso respetando los requisitos, igual que el
 * backend: al dar "Devolver plata" se da también "Ver las ventas", y al quitar
 * "Ver las ventas" se va todo lo que depende de él. Así lo que se ve tildado
 * es exactamente lo que se va a guardar.
 */
export function togglePermission(
  current: ReadonlySet<string>,
  key: Perm,
  on: boolean,
  catalog: readonly PermissionInfo[],
): Set<string> {
  const next = new Set(current);
  if (on) {
    next.add(key);
    const requires = catalog.find((p) => p.key === key)?.requires;
    if (requires) next.add(requires);
  } else {
    next.delete(key);
    for (const p of catalog) if (p.requires === key) next.delete(p.key);
  }
  return next;
}
