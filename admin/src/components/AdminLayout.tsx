import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Dropdown, cn } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { ThemeModeToggle } from './ThemeModeToggle';

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g transform="rotate(-4 32 32)">
        <rect x="6" y="6" width="52" height="52" rx="10" fill="#e8501e" stroke="#1b1510" strokeWidth="3" />
        <text x="32" y="46" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontWeight="700" fontSize="40" fill="#faf5ed">
          t
        </text>
      </g>
    </svg>
  );
}

interface NavChild {
  to: string;
  label: string;
  soon?: boolean;
}

interface NavItem {
  to: string;
  label: string;
  soon?: boolean;
  children?: NavChild[];
}

interface NavSection {
  heading: string | null;
  items: NavItem[];
}

/**
 * IA estilo Tiendanube: Inicio/Estadísticas + Gestión + Canales + Apps.
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
        children: [
          { to: '/estadisticas', label: 'Visión general' },
          { to: '/estadisticas/productos', label: 'Productos' },
          { to: '/estadisticas/ventas', label: 'Ventas y clientes' },
          { to: '/estadisticas/visitas', label: 'Visitas' },
          { to: '/estadisticas/tiempo-real', label: 'Tiempo real' },
          { to: '/estadisticas/cupones', label: 'Reporte de cupones' },
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
        soon: true,
        children: [
          { to: '/ventas', label: 'Lista de ventas', soon: true },
          { to: '/ventas/carritos', label: 'Carritos abandonados', soon: true },
        ],
      },
      {
        to: '/productos',
        label: 'Productos',
        children: [
          { to: '/productos', label: 'Lista de productos' },
          { to: '/productos/inventario', label: 'Inventario' },
          { to: '/productos/categorias', label: 'Categorías' },
        ],
      },
      { to: '/clientes', label: 'Clientes' },
      { to: '/descuentos', label: 'Descuentos' },
      { to: '/marketing', label: 'Marketing', soon: true },
    ],
  },
  {
    heading: 'Canales de venta',
    items: [
      { to: '/canales/tienda-online', label: 'Tienda online' },
      { to: '/paginas', label: 'Páginas' },
      { to: '/canales/redes', label: 'Instagram y Facebook', soon: true },
      { to: '/canales/google', label: 'Google Shopping', soon: true },
      { to: '/canales/marketplaces', label: 'Marketplaces', soon: true },
    ],
  },
  {
    heading: 'Plataforma',
    items: [
      { to: '/tenants', label: 'Mis tiendas' },
      { to: '/aplicaciones', label: 'Aplicaciones', soon: true },
    ],
  },
];

function SoonBadge() {
  return (
    <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider opacity-70">
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
      isActive
        ? 'bg-primary text-primary-fg'
        : 'text-accent-fg/60 hover:bg-white/10 hover:text-accent-fg',
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
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={linkClass(false)}
      >
        {item.label}
        {item.soon && <SoonBadge />}
        <svg
          className={cn('ml-auto h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-90', item.soon && 'ml-1')}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path d="m8 6 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
          {item.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              end
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-[0.82rem] transition-colors',
                  isActive
                    ? 'font-semibold text-primary'
                    : 'text-accent-fg/50 hover:text-accent-fg',
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
  const { store, stores, selectStore } = useStore();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-sidebar shrink-0 flex-col bg-accent text-accent-fg">
        <div className="flex h-header items-center gap-2.5 border-b border-white/10 px-4">
          <LogoMark className="h-7 w-7" />
          <span className="text-lg font-bold">tiendafy</span>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {sections.map((section) => (
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

        <div className="border-t border-white/10 p-3">
          <NavLink
            to="/configuracion"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
                isActive ? 'bg-primary text-primary-fg' : 'text-accent-fg/60 hover:bg-white/10 hover:text-accent-fg',
              )
            }
          >
            Configuración
          </NavLink>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex h-header items-center justify-between border-b border-border bg-surface px-6">
          {stores.length === 0 ? (
            <button
              type="button"
              disabled
              className="inline-flex h-9 cursor-not-allowed items-center rounded-md border border-border bg-bg-subtle px-3 text-sm font-medium text-fg-subtle"
            >
              Sin tiendas
            </button>
          ) : (
            <Dropdown>
              <Dropdown.Trigger>{store ? store.name : 'Elegir tienda'}</Dropdown.Trigger>
              <Dropdown.Menu>
                {stores.map((s) => (
                  <Dropdown.Item key={s.id} onSelect={() => selectStore(s)}>
                    {s.name}
                    <span className="ml-2 text-xs text-fg-subtle">{s.subdomain}</span>
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          )}

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
          </div>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
