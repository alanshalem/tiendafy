import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn, PageHeader, Tooltip } from '@tiendafy/ui';
import { HeaderActions } from '../../components/HeaderActions';
import { StoreSwitcher } from '../../components/StoreSwitcher';
import { visibleSettingsNav } from '../../config/navigation';
import { usePermissions } from '../../context/PermissionsContext';
import { LogoMark } from '../../components/LogoMark';
import { FIXED_BAR_PADDING } from '../../lib/styles';
import { PanelShell } from '../../components/PanelShell';

export function SettingsLayout() {
  const navigate = useNavigate();
  const { can } = usePermissions();

  // Filtra el menú por flags de config/features.ts + permisos.
  const visibleGroups = visibleSettingsNav(can);

  const sidebar = (
    <>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="flex h-header items-center gap-2 border-b border-border px-4 text-left hover:bg-fg/5"
      >
        <ChevronLeft className="h-5 w-5 text-accent-fg/75" />
        <LogoMark className="h-6 w-6" />
        <span className="text-sm font-bold">Configuración</span>
      </button>

      <nav aria-label="Secciones de configuración" className="flex-1 space-y-5 overflow-y-auto p-3">
        {visibleGroups.map((group) => (
          <div key={group.heading}>
            <div className="px-3 pb-1.5 text-3xs font-bold uppercase tracking-widest text-accent-fg/65">
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
          <HeaderActions />
        </>
      }
    >
      <Outlet />
    </PanelShell>
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
  return <PageHeader className="mb-5" title={title} subtitle={description} actions={action} />;
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
