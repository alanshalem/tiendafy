import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ExternalLink, LifeBuoy, LogOut, Settings } from 'lucide-react';
import { cn, Tooltip } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionsContext';
import { firstSettingsPath } from '../lib/access';
import { visibleMainNav, type NavItem } from '../config/navigation';
import { ThemeModeToggle } from './ThemeModeToggle';
import { StoreSwitcher } from './StoreSwitcher';
import { storefrontUrl } from '../lib/storefront';
import { LogoMark } from './LogoMark';

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
      isActive ? 'bg-primary text-primary-fg' : 'text-accent-fg/75 hover:bg-fg/5 hover:text-accent-fg',
    );

  if (!item.children) {
    return (
      <Tooltip label={item.desc}>
        <NavLink to={item.to} end className={({ isActive }) => linkClass(isActive)}>
          {item.label}
          {item.soon && <SoonBadge />}
        </NavLink>
      </Tooltip>
    );
  }

  return (
    <div>
      <Tooltip label={item.desc}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={linkClass(false)}
        >
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
      </Tooltip>
      {open && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
          {item.children.map((child) => (
            <Tooltip key={child.to} label={child.desc}>
              <NavLink
                to={child.to}
                end
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-1.5 text-[0.82rem] transition-colors',
                    isActive ? 'font-semibold text-primary' : 'text-accent-fg/70 hover:text-accent-fg',
                  )
                }
              >
                {child.label}
                {child.soon && <SoonBadge />}
              </NavLink>
            </Tooltip>
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

  const visibleSections = visibleMainNav(can);

  // La entrada Configuración se muestra si puede ver ALGO adentro.
  const showSettings = firstSettingsPath(can) !== null;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-sidebar shrink-0 flex-col border-r border-border bg-accent/80 text-accent-fg backdrop-blur-xl print:hidden">
        <div className="flex h-header items-center gap-2.5 border-b border-border px-4">
          <LogoMark className="h-7 w-7" />
          <span className="text-lg font-bold">tiendafy</span>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {visibleSections.map((section) => (
            <div key={section.heading ?? 'top'}>
              {section.heading && (
                <div className="px-3 pb-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-accent-fg/65">
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
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-accent-fg/75 hover:bg-fg/5 hover:text-accent-fg"
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
                    : 'text-accent-fg/75 hover:bg-fg/5 hover:text-accent-fg',
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
        <header className="sticky top-0 z-20 flex h-header items-center justify-between border-b border-border bg-surface/80 px-6 backdrop-blur-xl print:hidden">
          <StoreSwitcher />

          <div className="flex items-center gap-3">
            {store && (
              <a
                href={storefrontUrl(store.subdomain)}
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
        <main className="p-6 md:p-8 print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
