import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ExternalLink, LifeBuoy, LogOut, Settings } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { canAny, usePermissions } from '../context/PermissionsContext';
import { ThemeModeToggle } from './ThemeModeToggle';
import { StoreSwitcher } from './StoreSwitcher';
import { isNavVisible } from '../config/features';
import { LogoMark } from './LogoMark';

interface NavChild {
  to: string;
  label: string;
  soon?: boolean;
  /** Permiso RBAC requerido (string o lista: alcanza con uno). Sin `perm` = siempre visible. */
  perm?: string | string[];
}

interface NavItem {
  to: string;
  label: string;
  soon?: boolean;
  /** Permiso RBAC requerido (string o lista: alcanza con uno). Sin `perm` = siempre visible. */
  perm?: string | string[];
  children?: NavChild[];
}

interface NavSection {
  heading: string | null;
  items: NavItem[];
}

/**
 * Arquitectura de información: Inicio/Estadísticas + Gestión + Canales + Apps.
 * `soon` = módulo del checklist todavía no implementado; la página existe
 * con empty state para que la estructura completa sea navegable desde hoy.
 */
const sections: NavSection[] = [
  {
    heading: null,
    items: [
      { to: '/', label: 'Inicio' },
      {
        to: '/estadisticas',
        label: 'Estadísticas',
        perm: 'stats.read',
        children: [
          { to: '/estadisticas', label: 'Visión general', perm: 'stats.read' },
          { to: '/estadisticas/productos', label: 'Productos', perm: 'stats.read' },
          { to: '/estadisticas/ventas', label: 'Ventas y clientes', perm: 'stats.read' },
          { to: '/estadisticas/rentabilidad', label: 'Rentabilidad', perm: 'stats.read' },
          { to: '/estadisticas/visitas', label: 'Visitas', perm: 'stats.read' },
          { to: '/estadisticas/tiempo-real', label: 'Tiempo real', perm: 'stats.read' },
          { to: '/estadisticas/cupones', label: 'Reporte de cupones', perm: 'stats.read' },
        ],
      },
    ],
  },
  {
    heading: 'Gestión',
    items: [
      {
        to: '/ventas',
        label: 'Ventas',
        perm: 'orders.read',
        children: [
          { to: '/ventas', label: 'Lista de ventas', perm: 'orders.read' },
          { to: '/ventas/carritos', label: 'Carritos abandonados', perm: 'orders.read' },
        ],
      },
      {
        to: '/productos',
        label: 'Productos',
        perm: ['inventory.read', 'catalog.write'],
        children: [
          { to: '/productos', label: 'Lista de productos', perm: ['inventory.read', 'catalog.write'] },
          { to: '/productos/inventario', label: 'Inventario', perm: 'inventory.read' },
          { to: '/productos/costos', label: 'Costos', perm: 'catalog.write' },
          { to: '/productos/categorias', label: 'Categorías', perm: 'catalog.write' },
        ],
      },
      { to: '/clientes', label: 'Clientes', perm: 'customers.read' },
      { to: '/mensajes', label: 'Mensajes', perm: 'messages.read' },
      { to: '/posventa', label: 'Chat posventa', perm: 'support.chat' },
      { to: '/descuentos', label: 'Descuentos', perm: 'discounts.read' },
      { to: '/marketing', label: 'Marketing', perm: 'settings.write' },
    ],
  },
  {
    heading: 'Canales de venta',
    items: [
      { to: '/canales/tienda-online', label: 'Tienda online', perm: 'content.write' },
      { to: '/mercadolibre', label: 'Mercado Libre', perm: 'orders.read' },
      { to: '/paginas', label: 'Páginas', perm: 'content.write' },
    ],
  },
  {
    heading: 'Plataforma',
    items: [{ to: '/tenants', label: 'Mis tiendas' }],
  },
];
// Fuera del menú hasta que existan de verdad (las rutas stub siguen vivas):
// Marketing, Instagram/Facebook, Google Shopping, Marketplaces, Aplicaciones.

function SoonBadge() {
  return (
    <span className="ml-auto rounded-full bg-fg/10 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider opacity-70">
      Pronto
    </span>
  );
}

function SidebarItem({ item }: { item: NavItem }) {
  const location = useLocation();
  const isSectionActive =
    item.children?.some((c) => location.pathname === c.to) ?? location.pathname === item.to;
  const [open, setOpen] = useState(isSectionActive);

  const linkClass = (isActive: boolean) =>
    cn(
      'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'bg-primary text-primary-fg' : 'text-accent-fg/60 hover:bg-fg/5 hover:text-accent-fg',
    );

  if (!item.children) {
    return (
      <NavLink to={item.to} end className={({ isActive }) => linkClass(isActive)}>
        {item.label}
        {item.soon && <SoonBadge />}
      </NavLink>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={linkClass(false)}>
        {item.label}
        {item.soon && <SoonBadge />}
        <svg
          className={cn(
            'ml-auto h-3.5 w-3.5 shrink-0 transition-transform',
            open && 'rotate-90',
            item.soon && 'ml-1',
          )}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="m8 6 4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
          {item.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              end
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-[0.82rem] transition-colors',
                  isActive ? 'font-semibold text-primary' : 'text-accent-fg/50 hover:text-accent-fg',
                )
              }
            >
              {child.label}
              {child.soon && <SoonBadge />}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminLayout() {
  const { store } = useStore();
  const { user, logout } = useAuth();
  const { can } = usePermissions();

  // Visible si pasa el flag de features Y el permiso RBAC (si el item declara uno).
  const allowed = (x: { to: string; perm?: string | string[] }) =>
    isNavVisible(x.to) && (!x.perm || canAny(can, x.perm));

  // Filtra el menú por flags de config/features.ts + permisos del rol.
  // Si una sección queda sin items visibles, no se muestra el heading.
  const visibleSections = sections
    .map((s) => ({
      ...s,
      items: s.items
        .filter(allowed)
        .map((it) => (it.children ? { ...it, children: it.children.filter(allowed) } : it))
        .filter((it) => !it.children || it.children.length > 0),
    }))
    .filter((s) => s.items.length > 0);

  // La entrada Configuración se muestra si puede ver ALGO adentro.
  const showSettings = canAny(can, ['settings.write', 'payments.read', 'members.read']);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-sidebar shrink-0 flex-col border-r border-border bg-accent/80 text-accent-fg backdrop-blur-xl">
        <div className="flex h-header items-center gap-2.5 border-b border-border px-4">
          <LogoMark className="h-7 w-7" />
          <span className="text-lg font-bold">tiendafy</span>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {visibleSections.map((section) => (
            <div key={section.heading ?? 'top'}>
              {section.heading && (
                <div className="px-3 pb-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-accent-fg/40">
                  {section.heading}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <SidebarItem key={item.to} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-0.5 border-t border-border p-3">
          <a
            href="/ayuda"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-accent-fg/60 hover:bg-fg/5 hover:text-accent-fg"
          >
            <LifeBuoy className="h-4 w-4" />
            Centro de ayuda
          </a>
          {showSettings && (
            <NavLink
              to="/configuracion"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
                  isActive
                    ? 'bg-primary text-primary-fg'
                    : 'text-accent-fg/60 hover:bg-fg/5 hover:text-accent-fg',
                )
              }
            >
              <Settings className="h-4 w-4" />
              Configuración
            </NavLink>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-header items-center justify-between border-b border-border bg-surface/80 px-6 backdrop-blur-xl">
          <StoreSwitcher />

          <div className="flex items-center gap-3">
            {store && (
              <a
                href={`http://${store.subdomain}.localhost:3000`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Ver mi tienda <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <ThemeModeToggle />
            <div className="flex items-center gap-2 border-l border-border pl-3">
              <span className="hidden max-w-[8rem] truncate text-sm text-fg-muted sm:inline">
                {user?.name}
              </span>
              <button
                type="button"
                onClick={() => logout()}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="text-fg-subtle hover:text-fg"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
        <main className="p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
