import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, Package, Receipt, ShoppingCart, UserRound } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { usePermissions } from '../context/PermissionsContext';
import { visibleMainNav, visibleSettingsNav } from '../config/navigation';
import { routePerm, satisfies, type Perm } from '../lib/access';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { ORDER_STATUS } from '../lib/orderStatus';
import { foldText } from '../lib/text';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { SearchPalette, type PaletteItem } from './SearchPalette';

/* ============================================================
   Buscador del panel (Ctrl/Cmd+K o el botón del encabezado):
   saltar a una pantalla, una venta, un cliente, un producto (por
   nombre o SKU), una compra o un proveedor tipeando.
   ============================================================ */

/** El evento con el que el botón del encabezado abre la paleta (vive montada en App). */
const OPEN_EVENT = 'tiendafy:abrir-buscador';

/** Abre el buscador desde cualquier lado (el botón del encabezado). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** "Ctrl K" o "⌘ K", según la compu: lo que se muestra al lado del botón. */
export function paletteShortcut(): string {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
  return mac ? '⌘ K' : 'Ctrl K';
}

interface NavCommand {
  label: string;
  to: string;
  /** Términos extra de búsqueda (sinónimos). */
  keywords?: string;
  group: string;
}

/** Sinónimos para encontrar cada pantalla con las palabras de cada uno. */
const KEYWORDS: Record<string, string> = {
  '/': 'home dashboard',
  '/productos': 'catalogo',
  '/productos/inventario': 'stock',
  '/ventas': 'ordenes pedidos',
  '/descuentos': 'descuentos cupon',
  '/mensajes': 'arrepentimiento consultas',
  '/posventa': 'chat soporte',
  '/resenas': 'opiniones estrellas comentarios valoraciones reviews',
  '/bandeja': 'inbox mensajes preguntas reclamos pendientes',
  '/ventas/despacho': 'enviar preparar etiquetas envios pendientes',
  '/productos/stock-bajo': 'reponer faltantes agotados alerta',
  '/productos/esperando': 'sin stock agotado reposicion demanda avisame interesados lista de espera',
  '/paginas': 'cms institucionales',
  '/canales/tienda-online': 'tema tienda online personalizar editor diseño',
  '/estadisticas': 'reportes analytics',
  '/tenants': 'tiendas sucursales',
  '/presupuestos': 'cotizacion',
  '/compras': 'importaciones ordenes de compra contenedor',
  '/tesoreria': 'caja banco cobros pagos',
  '/configuracion/medios-de-pago': 'mercado pago cobros payway',
  '/configuracion/medios-de-envio': 'correo envios andreani zipnova',
  '/configuracion/facturacion': 'afip arca factura fiscal',
  '/configuracion/usuarios': 'staff equipo',
  '/configuracion/roles': 'permisos matriz accesos',
};

/** Accesos que no son una entrada de menú. */
const EXTRA: NavCommand[] = [
  { label: 'Nuevo producto', to: '/productos/nuevo', keywords: 'crear agregar', group: 'Ir a' },
  {
    label: 'Diseños listos',
    to: '/canales/tienda-online/disenios',
    keywords: 'plantillas temas',
    group: 'Ir a',
  },
  { label: 'Centro de ayuda', to: '/ayuda', keywords: 'help soporte', group: 'Ir a' },
];

/**
 * Las pantallas que la persona puede abrir: las de sus menús (así el buscador
 * encuentra exactamente lo que el menú muestra) más algunos accesos directos.
 */
function navCommands(can: (perm: Perm) => boolean): NavCommand[] {
  const main: NavCommand[] = visibleMainNav(can).flatMap((s) =>
    s.items
      .flatMap((it) => [it, ...(it.children ?? [])])
      .map((it) => ({ label: it.label, to: it.to, group: 'Ir a' })),
  );
  const settings: NavCommand[] = visibleSettingsNav(can).flatMap((g) =>
    g.items.map((it) => ({ label: it.label, to: it.to, group: 'Configuración' })),
  );
  const extra = EXTRA.filter((c) => satisfies(can, routePerm(c.to)));
  const seen = new Set<string>();
  return [...main, ...extra, ...settings]
    .filter((c) => !seen.has(c.to) && seen.add(c.to))
    .map((c) => ({ ...c, keywords: KEYWORDS[c.to] ?? c.keywords }));
}

/** Match laxo: todas las palabras de la query aparecen en el texto (sin acentos). */
function matches(query: string, text: string): boolean {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  const hay = foldText(text);
  return words.every((w) => hay.includes(w));
}

/** Un resultado de GET /api/v1/search (ver SearchEndpoints en el backend). */
interface SearchHit {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  detail: string | null;
  amountMinor: number | null;
  currency: string | null;
  atUtc: string | null;
}

/** Null = sin permiso para ese grupo. */
interface SearchResults {
  orders: SearchHit[] | null;
  customers: SearchHit[] | null;
  products: SearchHit[] | null;
  purchaseOrders: SearchHit[] | null;
  suppliers: SearchHit[] | null;
}

/** Lo mínimo para buscar en el servidor: con una letra coincide media tienda. */
const MIN_REMOTE = 2;

/** Los permisos que cubre el buscador del servidor: sin ninguno, ni se le pregunta. */
const REMOTE_PERMS: Perm[] = [
  'orders.read',
  'customers.read',
  'catalog.write',
  'inventory.read',
  'purchasing.manage',
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  // Atajo global Ctrl/Cmd+K (y Esc para cerrar), y el botón del encabezado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // El diálogo se monta al abrir: arranca con la búsqueda vacía y el foco en
  // el campo cada vez, sin un efecto que lo limpie (y que, si dependiera de
  // los resultados, BORRARÍA lo que ya se tipeó: bug real cazado por el E2E).
  return open ? <PaletteDialog onClose={() => setOpen(false)} /> : null;
}

type Target = { to: string };

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { store } = useStore();
  const { can } = usePermissions();
  const [q, setQ] = useState('');
  const term = useDebouncedValue(q.trim(), 250);
  const remote = !!store && term.length >= MIN_REMOTE && REMOTE_PERMS.some(can);

  // Ventas, clientes, productos, compras y proveedores: los busca la base, con
  // pocos resultados por grupo y solo los grupos que la persona puede abrir.
  const search = useQuery({
    queryKey: ['global-search', store?.id, term],
    queryFn: () => api.get<SearchResults>(`/api/v1/search?q=${encodeURIComponent(term)}&limit=5`),
    enabled: remote,
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });

  // Cada ítem con su destino: la paleta compartida no sabe de rutas.
  const { items, targets } = useMemo(() => {
    const targets = new Map<string, Target>();
    const add = (item: PaletteItem, to: string) => {
      targets.set(item.key, { to });
      return item;
    };
    const r = remote && q.trim().length >= MIN_REMOTE ? search.data : undefined;
    const icon = (Icon: typeof Package) => (
      <Icon className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
    );

    const orders = (r?.orders ?? []).map((o) =>
      add(
        {
          key: `order-${o.id}`,
          group: 'Ventas',
          icon: icon(Receipt),
          label: o.title,
          detail: o.subtitle ? (ORDER_STATUS[o.subtitle]?.label ?? o.subtitle) : undefined,
          hint: o.amountMinor != null ? formatMoney(o.amountMinor, o.currency ?? undefined) : undefined,
        },
        `/ventas?order=${o.id}`,
      ),
    );
    const customers = (r?.customers ?? []).map((c) =>
      add(
        {
          key: `customer-${c.id}`,
          group: 'Clientes',
          icon: icon(UserRound),
          label: c.title,
          detail: c.subtitle ?? undefined,
          hint: c.detail ?? undefined,
        },
        `/clientes/${c.id}`,
      ),
    );
    // Sin permiso de catálogo no se puede abrir el formulario: lleva al
    // listado buscando ese producto (lo que sí puede ver quien maneja stock).
    const editProducts = can('catalog.write');
    const products = (r?.products ?? []).map((p) =>
      add(
        {
          key: `product-${p.id}`,
          group: 'Productos',
          icon: p.imageUrl ? (
            <img src={p.imageUrl} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
          ) : (
            icon(Package)
          ),
          label: p.title,
          detail: p.subtitle ?? undefined,
          hint: 'Producto',
        },
        editProducts ? `/productos/${p.id}/editar` : `/productos?q=${encodeURIComponent(p.title)}`,
      ),
    );
    const purchases = (r?.purchaseOrders ?? []).map((po) =>
      add(
        { key: `po-${po.id}`, group: 'Compras', icon: icon(ShoppingCart), label: po.title, hint: 'Compra' },
        `/compras?orden=${po.id}`,
      ),
    );
    const suppliers = (r?.suppliers ?? []).map((s) =>
      add(
        {
          key: `supplier-${s.id}`,
          group: 'Proveedores',
          icon: icon(Building2),
          label: s.title,
          detail: s.subtitle ?? undefined,
          hint: 'Proveedor',
        },
        `/proveedores?proveedor=${s.id}`,
      ),
    );

    const nav = navCommands(can)
      // El grupo cuenta: "configuración" trae todas las pantallas de Configuración.
      .filter((c) => !q || matches(q, `${c.label} ${c.keywords ?? ''} ${c.group}`))
      .slice(0, 8)
      .map((c) => add({ key: `nav-${c.to}`, group: c.group, label: c.label }, c.to));
    // Las pantallas, agrupadas por "Ir a" / "Configuración" sin intercalarse.
    nav.sort((a, b) => (a.group === b.group ? 0 : a.group === 'Ir a' ? -1 : 1));

    const items: PaletteItem[] = [...orders, ...customers, ...products, ...purchases, ...suppliers, ...nav];
    return { items, targets };
  }, [q, remote, search.data, can]);

  return (
    <SearchPalette
      label="Buscar en el panel"
      inputLabel="Buscar en el panel"
      placeholder="Buscar ventas, clientes, productos, SKU, pantallas…"
      query={q}
      onQueryChange={setQ}
      items={items}
      loading={remote && search.isFetching}
      onPick={(item) => {
        const target = targets.get(item.key);
        if (!target) return;
        onClose();
        navigate(target.to);
      }}
      onClose={onClose}
      idle="Escribí el número de una venta, un cliente, un producto o una pantalla."
      empty={remote && search.isFetching ? 'Buscando…' : `Sin resultados para «${q}».`}
      footer={<>↑↓ para moverte · Enter para abrir · Esc para cerrar</>}
    />
  );
}
