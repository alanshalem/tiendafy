import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ChevronLeft,
  ListChecks,
  CreditCard,
  FileText,
  Globe,
  Mail,
  MessageCircle,
  Package,
  ShoppingCart,
  Signpost,
  Store,
  User,
  type LucideIcon,
} from 'lucide-react';
import { cn, Tooltip } from '@tiendafy/ui';
import { ThemeModeToggle } from '../../components/ThemeModeToggle';
import { StoreSwitcher } from '../../components/StoreSwitcher';
import { isNavVisible } from '../../config/features';
import { canAny, usePermissions } from '../../context/PermissionsContext';
import { LogoMark } from '../../components/LogoMark';

interface NavItem {
  to: string;
  label: string;
  /** Una línea que explica la página (tooltip al pasar el mouse). */
  desc?: string;
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
      {
        to: '/configuracion/medios-de-pago',
        label: 'Medios de pago',
        desc: 'Conectá Mercado Pago y elegí cómo cobra tu tienda.',
        icon: CreditCard,
        perm: 'payments.read',
      },
      {
        to: '/configuracion/medios-de-envio',
        label: 'Medios de envío',
        desc: 'Envíos a domicilio, retiro y cotización en vivo (Correo Argentino, Zipnova).',
        icon: Package,
        perm: 'settings.write',
      },
      {
        to: '/configuracion/mercadolibre',
        label: 'Mercado Libre',
        desc: 'Conectá tu cuenta de vendedor para activar el canal ML.',
        icon: Store,
        perm: 'settings.write',
      },
    ],
  },
  {
    heading: 'Facturación',
    items: [
      {
        to: '/configuracion/facturacion',
        label: 'Facturación',
        desc: 'Factura electrónica ARCA: certificado, punto de venta y emisión automática.',
        icon: FileText,
        perm: 'fiscal.config',
      },
    ],
  },
  {
    heading: 'Comunicación',
    items: [
      {
        to: '/configuracion/emails-automaticos',
        label: 'E-mails automáticos',
        desc: 'Los emails que tu tienda manda sola: confirmaciones, envíos, carritos.',
        icon: Mail,
        perm: 'settings.write',
      },
      {
        to: '/configuracion/whatsapp-automatico',
        label: 'WhatsApp automático',
        desc: 'Avisos automáticos por WhatsApp con la API oficial de Meta.',
        icon: MessageCircle,
        perm: 'settings.write',
      },
    ],
  },
  {
    heading: 'Catálogo',
    items: [
      {
        to: '/configuracion/ficha-tecnica',
        label: 'Ficha técnica',
        desc: 'Los datos propios de lo que vendés: medidas, materiales, compatibilidad, códigos.',
        icon: ListChecks,
        perm: 'catalog.write',
      },
    ],
  },
  {
    heading: 'Checkout',
    items: [
      {
        to: '/configuracion/opciones-del-checkout',
        label: 'Opciones del checkout',
        desc: 'Qué pide y muestra el proceso de compra: datos, cuotas, condiciones.',
        icon: ShoppingCart,
        perm: 'settings.write',
      },
    ],
  },
  {
    heading: 'Equipo y dominios',
    items: [
      {
        to: '/configuracion/usuarios',
        label: 'Usuarios y notificaciones',
        desc: 'Tu equipo con roles y permisos, y qué avisos recibe cada uno.',
        icon: User,
        perm: 'members.read',
      },
      {
        to: '/configuracion/dominios',
        label: 'Dominios',
        desc: 'El subdominio de tu tienda y la conexión de tu dominio propio.',
        icon: Globe,
        perm: 'settings.write',
      },
      {
        to: '/configuracion/redirecciones',
        label: 'Redirecciones',
        desc: 'Mandar una dirección vieja a la nueva para no perder visitas ni posicionamiento.',
        icon: Signpost,
        perm: 'settings.write',
      },
      {
        to: '/configuracion/medicion',
        label: 'Medición y píxeles',
        desc: 'Google Analytics, Google Ads, el píxel de Meta y Clarity, con permiso del visitante.',
        icon: BarChart3,
        perm: 'settings.write',
      },
    ],
  },
];

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
