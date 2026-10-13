import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, Package } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { useProductSearch } from '../lib/useProductSearch';
import { usePermissions } from '../context/PermissionsContext';
import { visibleMainNav, visibleSettingsNav } from '../config/navigation';
import { routePerm, satisfies, type Perm } from '../lib/access';
import { foldText } from '../lib/text';

/* ============================================================
   Command palette (Ctrl/Cmd+K): saltar a cualquier pantalla del
   admin o a un producto tipeando. Navegación + búsqueda, sin mouse.
   ============================================================ */

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

interface ProductHit {
  id: string;
  name: string;
  image: string | null;
}

/** Lo que devuelve /products: alcanza con el nombre y la primera foto. */
interface ProductDto {
  id: string;
  name: string;
  images: { url: string }[];
}

/** Match laxo: todas las palabras de la query aparecen en el texto (sin acentos). */
function matches(query: string, text: string): boolean {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  const hay = foldText(text);
  return words.every((w) => hay.includes(w));
}

type Item = { kind: 'nav'; cmd: NavCommand } | { kind: 'product'; product: ProductHit };

export function CommandPalette() {
  const [open, setOpen] = useState(false);

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

  // El diálogo se monta al abrir: arranca con la búsqueda vacía y el foco en
  // el campo cada vez, sin un efecto que lo limpie (y que, si dependiera de
  // los resultados, BORRARÍA lo que ya se tipeó: bug real cazado por el E2E).
  return open ? <PaletteDialog onClose={() => setOpen(false)} /> : null;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Productos: los busca la base, sin tildes y con las palabras en cualquier
  // orden, igual que el filtro de abajo. Antes se traían los primeros cien y
  // se filtraba acá: en una tienda con miles, el producto ciento uno no
  // aparecía nunca en la paleta.
  const productQuery = q.trim().length >= 2 && can('catalog.write') ? q : '';
  const search = useProductSearch<ProductDto>(productQuery, { enabled: productQuery !== '' });
  const products = useMemo<ProductHit[]>(
    () =>
      (search.data?.items ?? []).map((p) => ({ id: p.id, name: p.name, image: p.images[0]?.url ?? null })),
    [search.data],
  );

  const items = useMemo<Item[]>(() => {
    const nav = navCommands(can)
      .filter((c) => !q || matches(q, `${c.label} ${c.keywords ?? ''}`))
      .map((cmd): Item => ({ kind: 'nav', cmd }));
    const prods = productQuery
      ? products.slice(0, 6).map((product): Item => ({ kind: 'product', product }))
      : [];
    return [...prods, ...nav].slice(0, 14);
  }, [q, productQuery, products, can]);

  const run = useCallback(
    (item: Item) => {
      onClose();
      if (item.kind === 'nav') navigate(item.cmd.to);
      else navigate(`/productos/${item.product.id}/editar`);
    },
    [navigate, onClose],
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

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
      onClick={onClose}
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
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0); // otra búsqueda, otra lista: se arranca por el primero
            }}
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
