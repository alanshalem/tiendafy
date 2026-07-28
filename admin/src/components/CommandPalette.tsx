import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, Package } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { api } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { usePermissions } from '../context/PermissionsContext';

/* ============================================================
   Command palette (Ctrl/Cmd+K): saltar a cualquier pantalla del
   admin o a un producto tipeando. Navegación + búsqueda, sin mouse.
   ============================================================ */

interface NavCommand {
  label: string;
  to: string;
  /** Permiso requerido (alguno de la lista). Sin permiso no se lista. */
  perm?: string | string[];
  /** Términos extra de búsqueda (sinónimos). */
  keywords?: string;
  group: string;
}

const NAV: NavCommand[] = [
  { label: 'Inicio', to: '/', keywords: 'home dashboard', group: 'Ir a' },
  {
    label: 'Productos',
    to: '/productos',
    perm: ['inventory.read', 'catalog.write'],
    keywords: 'catalogo',
    group: 'Ir a',
  },
  {
    label: 'Nuevo producto',
    to: '/productos/nuevo',
    perm: 'catalog.write',
    keywords: 'crear agregar',
    group: 'Ir a',
  },
  { label: 'Categorías', to: '/productos/categorias', perm: 'catalog.write', group: 'Ir a' },
  {
    label: 'Inventario',
    to: '/productos/inventario',
    perm: 'inventory.read',
    keywords: 'stock',
    group: 'Ir a',
  },
  { label: 'Ventas', to: '/ventas', perm: 'orders.read', keywords: 'ordenes pedidos', group: 'Ir a' },
  { label: 'Carritos abandonados', to: '/ventas/carritos', perm: 'orders.read', group: 'Ir a' },
  { label: 'Clientes', to: '/clientes', perm: 'customers.read', group: 'Ir a' },
  { label: 'Descuentos', to: '/descuentos', perm: 'discounts.read', keywords: 'cupones', group: 'Ir a' },
  { label: 'Mensajes', to: '/mensajes', perm: 'messages.read', group: 'Ir a' },
  { label: 'Posventa', to: '/posventa', perm: 'support.chat', keywords: 'chat soporte', group: 'Ir a' },
  { label: 'Páginas', to: '/paginas', perm: 'content.write', group: 'Ir a' },
  {
    label: 'Editor de diseño',
    to: '/canales/tienda-online',
    perm: 'content.write',
    keywords: 'tema tienda online personalizar',
    group: 'Ir a',
  },
  {
    label: 'Diseños listos',
    to: '/canales/tienda-online/disenios',
    perm: 'content.write',
    keywords: 'plantillas temas',
    group: 'Ir a',
  },
  {
    label: 'Estadísticas',
    to: '/estadisticas',
    perm: 'stats.read',
    keywords: 'reportes analytics',
    group: 'Ir a',
  },
  { label: 'Mis tiendas', to: '/tenants', keywords: 'tiendas sucursales', group: 'Ir a' },
  { label: 'Centro de ayuda', to: '/ayuda', keywords: 'help soporte', group: 'Ir a' },
  {
    label: 'Medios de pago',
    to: '/configuracion/medios-de-pago',
    perm: 'payments.read',
    keywords: 'mercado pago cobros',
    group: 'Configuración',
  },
  {
    label: 'Medios de envío',
    to: '/configuracion/medios-de-envio',
    perm: 'settings.write',
    keywords: 'correo envios',
    group: 'Configuración',
  },
  {
    label: 'Emails automáticos',
    to: '/configuracion/emails-automaticos',
    perm: 'settings.write',
    group: 'Configuración',
  },
  {
    label: 'WhatsApp automático',
    to: '/configuracion/whatsapp-automatico',
    perm: 'settings.write',
    group: 'Configuración',
  },
  {
    label: 'Opciones del checkout',
    to: '/configuracion/opciones-del-checkout',
    perm: 'settings.write',
    group: 'Configuración',
  },
  {
    label: 'Facturación (ARCA)',
    to: '/configuracion/facturacion',
    perm: 'fiscal.config',
    keywords: 'afip factura fiscal',
    group: 'Configuración',
  },
  {
    label: 'Usuarios y notificaciones',
    to: '/configuracion/usuarios',
    perm: 'members.read',
    keywords: 'staff equipo',
    group: 'Configuración',
  },
  { label: 'Dominios', to: '/configuracion/dominios', perm: 'settings.write', group: 'Configuración' },
];

interface ProductHit {
  id: string;
  name: string;
  image: string | null;
}

/** Match laxo: todas las palabras de la query aparecen en el texto (sin acentos). */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function matches(query: string, text: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const hay = fold(text);
  return words.every((w) => hay.includes(w));
}

type Item = { kind: 'nav'; cmd: NavCommand } | { kind: 'product'; product: ProductHit };

export function CommandPalette() {
  const navigate = useNavigate();
  const { store } = useStore();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [products, setProducts] = useState<ProductHit[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Atajo global Ctrl/Cmd+K (y Esc para cerrar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Al abrir: limpiar búsqueda y foco al input. SOLO depende de `open`: si
  // dependiera de `products`, al resolver la carga re-ejecutaría y BORRARÍA
  // lo que el usuario ya tipeó (bug real cazado por el E2E).
  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Carga (una vez por tienda) de productos para buscar por nombre.
  useEffect(() => {
    if (open && products === null && store && can('catalog.write')) {
      api
        .get<{ items: { id: string; name: string; images: { url: string }[] }[] }>(
          '/api/v1/products?limit=100',
        )
        .then((r) =>
          setProducts(r.items.map((p) => ({ id: p.id, name: p.name, image: p.images[0]?.url ?? null }))),
        )
        .catch(() => setProducts([]));
    }
  }, [open, products, store, can]);

  // Cache de productos por tienda: al cambiar de tienda se re-carga.
  useEffect(() => {
    setProducts(null);
  }, [store?.id]);

  const items = useMemo<Item[]>(() => {
    const nav = NAV.filter((c) => !c.perm || (Array.isArray(c.perm) ? c.perm.some(can) : can(c.perm)))
      .filter((c) => !q || matches(q, `${c.label} ${c.keywords ?? ''}`))
      .map((cmd): Item => ({ kind: 'nav', cmd }));
    const prods =
      q.trim().length >= 2
        ? (products ?? [])
            .filter((p) => matches(q, p.name))
            .slice(0, 6)
            .map((product): Item => ({ kind: 'product', product }))
        : [];
    return [...prods, ...nav].slice(0, 14);
  }, [q, products, can]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  const run = useCallback(
    (item: Item) => {
      setOpen(false);
      if (item.kind === 'nav') navigate(item.cmd.to);
      else navigate(`/productos/${item.product.id}/editar`);
    },
    [navigate],
  );

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      run(items[active]);
    }
  };

  // Mantener la opción activa a la vista al navegar con flechas.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Buscar en el panel"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-fg-subtle" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Buscar pantallas o productos…"
            aria-label="Buscar pantallas o productos"
            className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[0.65rem] text-fg-subtle">
            Esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5" role="listbox">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-fg-muted">Sin resultados para «{q}».</p>
          )}
          {items.map((item, i) => (
            <button
              key={item.kind === 'nav' ? item.cmd.to : item.product.id}
              data-active={i === active}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(item)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm',
                i === active ? 'bg-primary/10 text-fg' : 'text-fg-muted',
              )}
            >
              {item.kind === 'product' ? (
                <>
                  {item.product.image ? (
                    <img src={item.product.image} alt="" className="h-6 w-6 rounded object-cover" />
                  ) : (
                    <Package className="h-4 w-4 shrink-0 text-fg-subtle" />
                  )}
                  <span className="flex-1 truncate">{item.product.name}</span>
                  <span className="shrink-0 text-xs text-fg-subtle">Producto</span>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate">{item.cmd.label}</span>
                  <span className="shrink-0 text-xs text-fg-subtle">{item.cmd.group}</span>
                </>
              )}
              {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />}
            </button>
          ))}
        </div>
        <div className="border-t border-border px-4 py-2 text-[0.7rem] text-fg-subtle">
          ↑↓ para moverte · Enter para abrir · Ctrl+K para cerrar
        </div>
      </div>
    </div>
  );
}
