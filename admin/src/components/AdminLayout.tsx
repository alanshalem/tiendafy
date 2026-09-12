import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ExternalLink, LifeBuoy, LogOut, Settings } from 'lucide-react';
import { cn, Tooltip } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { canAny, usePermissions } from '../context/PermissionsContext';
import { ThemeModeToggle } from './ThemeModeToggle';
import { StoreSwitcher } from './StoreSwitcher';
import { isNavVisible } from '../config/features';
import { storefrontUrl } from '../lib/storefront';
import { LogoMark } from './LogoMark';

interface NavChild {
  to: string;
  label: string;
  /** Una línea que explica la página (tooltip al pasar el mouse). */
  desc?: string;
  soon?: boolean;
  /** Permiso RBAC requerido (string o lista: alcanza con uno). Sin `perm` = siempre visible. */
  perm?: string | string[];
}

interface NavItem {
  to: string;
  label: string;
  /** Una línea que explica la página (tooltip al pasar el mouse). */
  desc?: string;
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
      { to: '/', label: 'Inicio', desc: 'El resumen del día: ventas, visitas y accesos rápidos.' },
      {
        to: '/estadisticas',
        label: 'Estadísticas',
        desc: 'Los números del negocio: ventas, productos, visitas y rentabilidad.',
        perm: 'stats.read',
        children: [
          {
            to: '/estadisticas',
            label: 'Visión general',
            desc: 'Facturación, pedidos, ticket promedio y evolución del período.',
            perm: 'stats.read',
          },
          {
            to: '/estadisticas/productos',
            label: 'Productos',
            desc: 'Los más vendidos y los que no rotan.',
            perm: 'stats.read',
          },
          {
            to: '/estadisticas/ventas',
            label: 'Ventas y clientes',
            desc: 'Ventas por día y compradores nuevos vs. recurrentes.',
            perm: 'stats.read',
          },
          {
            to: '/estadisticas/rentabilidad',
            label: 'Rentabilidad',
            desc: 'Cuánto GANÁS de verdad: costos, comisiones y margen por producto.',
            perm: 'stats.read',
          },
          {
            to: '/estadisticas/visitas',
            label: 'Visitas',
            desc: 'El tráfico de la tienda: cuánta gente entra y qué mira.',
            perm: 'stats.read',
          },
          {
            to: '/estadisticas/tiempo-real',
            label: 'Tiempo real',
            desc: 'Quién está navegando tu tienda ahora mismo.',
            perm: 'stats.read',
          },
          {
            to: '/estadisticas/cupones',
            label: 'Reporte de cupones',
            desc: 'Cuánto se usó cada cupón y cuánta venta trajo.',
            perm: 'stats.read',
          },
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
        desc: 'Los pedidos de tu tienda: cobro, envío, factura y reembolsos.',
        perm: 'orders.read',
        children: [
          {
            to: '/ventas',
            label: 'Lista de ventas',
            desc: 'Todos los pedidos con su estado de pago y de envío.',
            perm: 'orders.read',
          },
          {
            to: '/presupuestos',
            label: 'Presupuestos',
            desc: 'Cotizale a un cliente y, si acepta, la venta sale sola con esos precios.',
            perm: 'orders.read',
          },
          {
            to: '/ventas/carritos',
            label: 'Carritos abandonados',
            desc: 'Compras que quedaron a medio camino, con recupero automático por email.',
            perm: 'orders.read',
          },
        ],
      },
      {
        to: '/productos',
        label: 'Productos',
        desc: 'Tu catálogo: productos, stock, costos y códigos de barras.',
        perm: ['inventory.read', 'catalog.write'],
        children: [
          {
            to: '/productos',
            label: 'Lista de productos',
            desc: 'Alta, edición e importación masiva por planilla.',
            perm: ['inventory.read', 'catalog.write'],
          },
          {
            to: '/productos/inventario',
            label: 'Inventario',
            desc: 'Stock disponible y reservado por variante, con ajuste rápido.',
            perm: 'inventory.read',
          },
          {
            to: '/productos/costos',
            label: 'Costos',
            desc: 'Cuánto te cuesta cada variante — la base de Rentabilidad.',
            perm: 'catalog.write',
          },
          {
            to: '/productos/listas-de-precios',
            label: 'Listas de precios',
            desc: 'Precio mayorista, minorista o por canal, sin duplicar el catálogo.',
            perm: 'catalog.write',
          },
          {
            to: '/productos/escaner',
            label: 'Escáner',
            desc: 'El depósito en el celu: buscá, ajustá stock y prepará pedidos escaneando.',
            perm: 'inventory.read',
          },
          {
            to: '/productos/kits',
            label: 'Kits y combos',
            desc: 'Productos compuestos: al venderse descuentan el stock de sus piezas.',
            perm: 'catalog.write',
          },
          {
            to: '/productos/categorias',
            label: 'Categorías',
            desc: 'Cómo se organiza el catálogo en tu tienda.',
            perm: 'catalog.write',
          },
        ],
      },
      {
        to: '/compras',
        label: 'Compras e importaciones',
        desc: 'Órdenes a proveedores, ciclo de importación y costo real por unidad puesta en depósito.',
        perm: 'purchasing',
        children: [
          {
            to: '/compras',
            label: 'Órdenes de compra',
            desc: 'El ciclo completo de una importación, con el landed cost por unidad.',
            perm: 'purchasing',
          },
          {
            to: '/proveedores',
            label: 'Proveedores',
            desc: 'A quiénes les comprás: datos, historial de compras y cuánto les debés.',
            perm: 'purchasing',
          },
        ],
      },
      {
        to: '/tesoreria',
        label: 'Tesorería',
        desc: 'Dónde está la plata: cajas, bancos, movimientos y transferencias.',
        perm: 'finance',
        children: [
          {
            to: '/tesoreria',
            label: 'Cajas y bancos',
            desc: 'El saldo de cada cuenta y todo lo que entró y salió.',
            perm: 'finance',
          },
          {
            to: '/cuentas-corrientes',
            label: 'Cuentas corrientes',
            desc: 'Quién te debe y a quién le debés, con cobros y pagos imputados a cada comprobante.',
            perm: 'finance',
          },
        ],
      },
      {
        to: '/clientes',
        label: 'Clientes',
        desc: 'Quiénes te compran: historial, cuentas y datos de contacto.',
        perm: 'customers.read',
      },
      {
        to: '/mensajes',
        label: 'Mensajes de contacto',
        desc: 'Consultas del formulario de contacto y solicitudes del Botón de Arrepentimiento.',
        perm: 'messages.read',
      },
      {
        to: '/posventa',
        label: 'Chat posventa',
        desc: 'El chat privado con cada comprador sobre SU pedido.',
        perm: 'support.chat',
      },
      {
        to: '/descuentos',
        label: 'Cupones',
        desc: 'Códigos de descuento: monto fijo, porcentaje o envío gratis, con vigencia y límites.',
        perm: 'discounts.read',
      },
      {
        to: '/marketing',
        label: 'Email marketing',
        desc: 'Campañas de email a tus clientes, con audiencias segmentadas y resultados.',
        perm: 'settings.write',
      },
    ],
  },
  {
    heading: 'Canales de venta',
    items: [
      {
        to: '/canales/tienda-online',
        label: 'Tienda online',
        desc: 'El diseño de tu tienda: editor visual con logo, colores y secciones.',
        perm: 'content.write',
      },
      {
        to: '/mercadolibre',
        label: 'Mercado Libre',
        desc: 'Tus ventas, preguntas y stock de ML, unificados con la tienda.',
        perm: 'orders.read',
      },
      {
        to: '/redes',
        label: 'Redes sociales',
        desc: 'Un post para Facebook, Instagram, X y Telegram a la vez, ahora o programado.',
        perm: 'social',
      },
      {
        to: '/paginas',
        label: 'Páginas de contenido',
        desc: 'Las páginas de texto de tu tienda: sobre nosotros, envíos, preguntas frecuentes.',
        perm: 'content.write',
      },
    ],
  },
  {
    heading: 'Plataforma',
    items: [
      {
        to: '/tenants',
        label: 'Mis tiendas',
        desc: 'Todas las tiendas del grupo: entrar a una o crear la próxima.',
      },
    ],
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
                    isActive ? 'font-semibold text-primary' : 'text-accent-fg/50 hover:text-accent-fg',
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
      <aside className="sticky top-0 flex h-screen w-sidebar shrink-0 flex-col border-r border-border bg-accent/80 text-accent-fg backdrop-blur-xl print:hidden">
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
