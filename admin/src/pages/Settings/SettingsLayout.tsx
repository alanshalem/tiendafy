import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn, Tooltip } from '@tiendafy/ui';
import { ThemeModeToggle } from '../../components/ThemeModeToggle';
import { StoreSwitcher } from '../../components/StoreSwitcher';
import { visibleSettingsNav } from '../../config/navigation';
import { usePermissions } from '../../context/PermissionsContext';
import { LogoMark } from '../../components/LogoMark';
import { FIXED_BAR_PADDING, PAGE_MAIN } from '../../lib/styles';

export function SettingsLayout() {
  const navigate = useNavigate();
  const { can } = usePermissions();

  // Filtra el menú por flags de config/features.ts + permisos.
  const visibleGroups = visibleSettingsNav(can);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-sidebar shrink-0 flex-col border-r border-border bg-accent/80 text-accent-fg backdrop-blur-xl">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex h-header items-center gap-2 border-b border-border px-4 text-left hover:bg-fg/5"
        >
          <ChevronLeft className="h-5 w-5 text-accent-fg/75" />
          <LogoMark className="h-6 w-6" />
          <span className="text-sm font-bold">Configuración</span>
        </button>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {visibleGroups.map((group) => (
            <div key={group.heading}>
              <div className="px-3 pb-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-accent-fg/65">
                {group.heading}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <Tooltip key={item.to} label={item.desc}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary text-primary-fg'
                            : 'text-accent-fg/75 hover:bg-fg/5 hover:text-accent-fg',
                        )
                      }
                    >
                      <item.icon className="h-5 w-5 shrink-0 opacity-80" />
                      {/* En su propia columna: si el nombre no entra en una
                          línea, la segunda queda alineada con la primera en vez
                          de meterse debajo del icono. */}
                      <span className="min-w-0">{item.label}</span>
                    </NavLink>
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-header items-center justify-between gap-3 border-b border-border bg-surface/80 px-6 backdrop-blur-xl">
          <StoreSwitcher />
          <ThemeModeToggle />
        </header>
        <main className={PAGE_MAIN}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Header reutilizable de página de configuración. */
export function SettingsHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Barra inferior sticky de guardar/cancelar. */
export function SaveBar({
  dirty,
  onSave,
  onCancel,
}: {
  dirty: boolean;
  onSave: () => void;
  onCancel?: () => void;
}) {
  if (!dirty) return null;
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:left-sidebar',
        FIXED_BAR_PADDING,
      )}
    >
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center rounded-md border border-border-strong px-4 text-sm font-medium text-fg hover:bg-bg-muted"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
