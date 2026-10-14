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
import { storePublicUrl } from '../lib/storefront';
import { LogoMark } from './LogoMark';
import { PanelShell } from './PanelShell';
import { useNavCounts, type NavBadge } from '../lib/useNavCounts';

// Fuera del menú hasta que existan de verdad (las rutas stub siguen vivas):
// Marketing, Instagram/Facebook, Google Shopping, Marketplaces, Aplicaciones.

function SoonBadge() {
  return (
    <span className="ml-auto rounded-full bg-fg/10 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider opacity-70">
      Pronto
    </span>
  );
}

/**
 * El número al lado de una entrada del menú (sin leer de la bandeja, stock
 * bajo). Con 0 no se dibuja: un "0" fijo es ruido que enseña a no mirarlo.
 */
function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} ${label}`}
      className="ml-auto min-w-5 rounded-full bg-primary px-1.5 py-px text-center text-[0.68rem] font-bold tabular-nums text-primary-fg"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

const BADGE_LABEL: Record<NavBadge, string> = { inbox: 'sin leer', stock: 'con stock bajo' };

function SidebarItem({ item, counts }: { item: NavItem; counts: Record<NavBadge, number> }) {
  const location = useLocation();
  const isSectionActive =
    item.children?.some((c) => location.pathname === c.to) ?? location.pathname === item.to;
  const [open, setOpen] = useState(isSectionActive);
  const closedCount = open
    ? 0
    : (item.children ?? []).reduce((sum, c) => sum + (c.badge ? counts[c.badge] : 0), 0);

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
          {item.badge && <CountBadge count={counts[item.badge]} label={BADGE_LABEL[item.badge]} />}
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
          {/* Cerrado, el grupo muestra lo de sus hijos para que no se pierda. */}
          {closedCount > 0 && <CountBadge count={closedCount} label="pendientes" />}
          <svg
            className={cn(
              'ml-auto h-3.5 w-3.5 shrink-0 transition-transform',
              open && 'rotate-90',
              (item.soon || closedCount > 0) && 'ml-1',
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
                {child.badge && <CountBadge count={counts[child.badge]} label={BADGE_LABEL[child.badge]} />}
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
  const counts = useNavCounts();

  const visibleSections = visibleMainNav(can);

  // La entrada Configuración se muestra si puede ver ALGO adentro.
  const showSettings = firstSettingsPath(can) !== null;

  const sidebar = (
    <>
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
                <SidebarItem key={item.to} item={item} counts={counts} />
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
    </>
  );

  return (
    <PanelShell
      sidebar={sidebar}
      header={
        <>
          <div className="min-w-0">
            <StoreSwitcher />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            {store && (
              <a
                href={storePublicUrl(store)}
                target="_blank"
                rel="noreferrer"
                aria-label="Ver mi tienda"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <span className="hidden sm:inline">Ver mi tienda</span> <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <ThemeModeToggle />
            <div className="flex items-center gap-2 border-l border-border pl-2 sm:pl-3">
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
        </>
      }
    >
      <Outlet />
    </PanelShell>
  );
}
