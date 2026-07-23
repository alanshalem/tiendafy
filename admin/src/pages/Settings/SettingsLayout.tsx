import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Code,
  CornerDownRight,
  CreditCard,
  Globe,
  Mail,
  MapPin,
  Package,
  Pencil,
  ShoppingCart,
  User,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { ThemeModeToggle } from '../../components/ThemeModeToggle';
import { StoreSwitcher } from '../../components/StoreSwitcher';
import { isNavVisible } from '../../config/features';
import { canAny, usePermissions } from '../../context/PermissionsContext';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Permiso RBAC requerido (string o lista: alcanza con uno). */
  perm?: string | string[];
}
interface NavGroup {
  heading: string;
  items: NavItem[];
}

const groups: NavGroup[] = [
  {
    heading: 'Pagos y envíos',
    items: [
      { to: '/configuracion/medios-de-pago', label: 'Medios de pago', icon: CreditCard, perm: 'payments.read' },
      { to: '/configuracion/medios-de-envio', label: 'Medios de envío', icon: Package, perm: 'settings.write' },
      { to: '/configuracion/centros-de-distribucion', label: 'Centros de distribución', icon: MapPin, perm: 'settings.write' },
    ],
  },
  {
    heading: 'Comunicación',
    items: [
      { to: '/configuracion/emails-automaticos', label: 'E-mails automáticos', icon: Mail, perm: 'settings.write' },
    ],
  },
  {
    heading: 'Checkout',
    items: [
      { to: '/configuracion/opciones-del-checkout', label: 'Opciones del checkout', icon: ShoppingCart, perm: 'settings.write' },
    ],
  },
  {
    heading: 'Otros',
    items: [
      { to: '/configuracion/usuarios', label: 'Usuarios y notificaciones', icon: User, perm: 'members.read' },
      { to: '/configuracion/dominios', label: 'Dominios', icon: Globe, perm: 'settings.write' },
      { to: '/configuracion/codigos-externos', label: 'Códigos externos', icon: Code, perm: 'settings.write' },
      { to: '/configuracion/idiomas-y-monedas', label: 'Idiomas y monedas', icon: Globe, perm: 'settings.write' },
      { to: '/configuracion/redirecciones', label: 'Redireccionamientos 301', icon: CornerDownRight, perm: 'settings.write' },
      { to: '/configuracion/campos-personalizados', label: 'Campos personalizados', icon: Pencil, perm: 'settings.write' },
    ],
  },
];

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="15" fill="rgb(var(--color-primary))" />
      <text x="32" y="45" textAnchor="middle" fontFamily="-apple-system, system-ui, sans-serif" fontWeight="700" fontSize="38" fill="#fff">
        t
      </text>
    </svg>
  );
}

export function SettingsLayout() {
  const navigate = useNavigate();
  const { can } = usePermissions();

  // Filtra el menú de configuración por flags de config/features.ts + permisos RBAC.
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => isNavVisible(it.to) && (!it.perm || canAny(can, it.perm))),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-sidebar shrink-0 flex-col border-r border-border bg-accent/80 text-accent-fg backdrop-blur-xl">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex h-header items-center gap-2 border-b border-border px-4 text-left hover:bg-fg/5"
        >
          <ChevronLeft className="h-5 w-5 text-accent-fg/60" />
          <LogoMark className="h-6 w-6" />
          <span className="text-sm font-bold">Configuración</span>
        </button>

        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {visibleGroups.map((group) => (
            <div key={group.heading}>
              <div className="px-3 pb-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-accent-fg/40">
                {group.heading}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-fg'
                          : 'text-accent-fg/60 hover:bg-fg/5 hover:text-accent-fg',
                      )
                    }
                  >
                    <item.icon className="h-5 w-5 shrink-0 opacity-80" />
                    {item.label}
                  </NavLink>
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
        <main className="p-6 md:p-8">
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
export function SaveBar({ dirty, onSave, onCancel }: { dirty: boolean; onSave: () => void; onCancel?: () => void }) {
  if (!dirty) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur md:left-sidebar">
      <div className="mx-auto flex max-w-3xl items-center justify-end gap-2">
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
