import {
  BarChart3,
  ListChecks,
  CreditCard,
  FileText,
  Globe,
  Mail,
  MessageCircle,
  Package,
  ShieldCheck,
  ShoppingCart,
  Signpost,
  Store,
  User,
  type LucideIcon,
} from 'lucide-react';
import { isNavVisible } from './features';
import { routePerm, satisfies, type Perm } from '../lib/access';

/*
 * Los menús del panel: el lateral, el de Configuración y, armado a partir de
 * los dos, el buscador (Ctrl+K). Qué permiso pide cada pantalla NO va acá:
 * sale de lib/access, la misma tabla que usan las rutas.
 */

export interface NavChild {
  to: string;
  label: string;
  /** Una línea que explica la página (tooltip al pasar el mouse). */
  desc?: string;
  soon?: boolean;
}

export interface NavItem {
  to: string;
  label: string;
  /** Una línea que explica la página (tooltip al pasar el mouse). */
  desc?: string;
  soon?: boolean;
  children?: NavChild[];
}

export interface NavSection {
  heading: string | null;
  items: NavItem[];
}

/**
 * Arquitectura de información: Inicio/Estadísticas + Gestión + Canales + Apps.
 * `soon` = módulo del checklist todavía no implementado; la página existe
 * con empty state para que la estructura completa sea navegable desde hoy.
 */
export const MAIN_NAV: NavSection[] = [
  {
    heading: null,
    items: [
      { to: '/', label: 'Inicio', desc: 'El resumen del día: ventas, visitas y accesos rápidos.' },
      {
        to: '/estadisticas',
        label: 'Estadísticas',
        desc: 'Los números del negocio: ventas, productos, visitas y rentabilidad.',
        children: [
          {
            to: '/estadisticas',
            label: 'Visión general',
            desc: 'Facturación, pedidos, ticket promedio y evolución del período.',
          },
          {
            to: '/estadisticas/productos',
            label: 'Productos',
            desc: 'Los más vendidos y los que no rotan.',
          },
          {
            to: '/estadisticas/ventas',
            label: 'Ventas y clientes',
            desc: 'Ventas por día y compradores nuevos vs. recurrentes.',
          },
          {
            to: '/estadisticas/rentabilidad',
            label: 'Rentabilidad',
            desc: 'Cuánto GANÁS de verdad: costos, comisiones y margen por producto.',
          },
          {
            to: '/estadisticas/visitas',
            label: 'Visitas',
            desc: 'El tráfico de la tienda: cuánta gente entra y qué mira.',
          },
          {
            to: '/estadisticas/tiempo-real',
            label: 'Tiempo real',
            desc: 'Quién está navegando tu tienda ahora mismo.',
          },
          {
            to: '/estadisticas/cupones',
            label: 'Reporte de cupones',
            desc: 'Cuánto se usó cada cupón y cuánta venta trajo.',
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
        children: [
          {
            to: '/ventas',
            label: 'Lista de ventas',
            desc: 'Todos los pedidos con su estado de pago y de envío.',
          },
          {
            to: '/presupuestos',
            label: 'Presupuestos',
            desc: 'Cotizale a un cliente y, si acepta, la venta sale sola con esos precios.',
          },
          {
            to: '/ventas/carritos',
            label: 'Carritos abandonados',
            desc: 'Compras que quedaron a medio camino, con recupero automático por email.',
          },
        ],
      },
      {
        to: '/productos',
        label: 'Productos',
        desc: 'Tu catálogo: productos, stock, costos y códigos de barras.',
        children: [
          {
            to: '/productos',
            label: 'Lista de productos',
            desc: 'Alta, edición e importación masiva por planilla.',
          },
          {
            to: '/productos/inventario',
            label: 'Inventario',
            desc: 'Stock disponible y reservado por variante, con ajuste rápido.',
          },
          {
            to: '/productos/costos',
            label: 'Costos',
            desc: 'Cuánto te cuesta cada variante — la base de Rentabilidad.',
          },
          {
            to: '/productos/listas-de-precios',
            label: 'Listas de precios',
            desc: 'Precio mayorista, minorista o por canal, sin duplicar el catálogo.',
          },
          {
            to: '/productos/escaner',
            label: 'Escáner',
            desc: 'El depósito en el celu: buscá, ajustá stock y prepará pedidos escaneando.',
          },
          {
            to: '/productos/kits',
            label: 'Kits y combos',
            desc: 'Productos compuestos: al venderse descuentan el stock de sus piezas.',
          },
          {
            to: '/productos/categorias',
            label: 'Categorías',
            desc: 'Cómo se organiza el catálogo en tu tienda.',
          },
        ],
      },
      {
        to: '/compras',
        label: 'Compras e importaciones',
        desc: 'Órdenes a proveedores, ciclo de importación y costo real por unidad puesta en depósito.',
        children: [
          {
            to: '/compras',
            label: 'Órdenes de compra',
            desc: 'El ciclo completo de una importación, con el landed cost por unidad.',
          },
          {
            to: '/proveedores',
            label: 'Proveedores',
            desc: 'A quiénes les comprás: datos, historial de compras y cuánto les debés.',
          },
        ],
      },
      {
        to: '/tesoreria',
        label: 'Tesorería',
        desc: 'Dónde está la plata: cajas, bancos, movimientos y transferencias.',
        children: [
          {
            to: '/tesoreria',
            label: 'Cajas y bancos',
            desc: 'El saldo de cada cuenta y todo lo que entró y salió.',
          },
          {
            to: '/cuentas-corrientes',
            label: 'Cuentas corrientes',
            desc: 'Quién te debe y a quién le debés, con cobros y pagos imputados a cada comprobante.',
          },
        ],
      },
      {
        to: '/clientes',
        label: 'Clientes',
        desc: 'Quiénes te compran: historial, cuentas y datos de contacto.',
      },
      {
        to: '/mensajes',
        label: 'Mensajes de contacto',
        desc: 'Consultas del formulario de contacto y solicitudes del Botón de Arrepentimiento.',
      },
      {
        to: '/posventa',
        label: 'Chat posventa',
        desc: 'El chat privado con cada comprador sobre SU pedido.',
      },
      {
        to: '/descuentos',
        label: 'Cupones',
        desc: 'Códigos de descuento: monto fijo, porcentaje o envío gratis, con vigencia y límites.',
      },
      {
        to: '/marketing',
        label: 'Email marketing',
        desc: 'Campañas de email a tus clientes, con audiencias segmentadas y resultados.',
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
      },
      {
        to: '/mercadolibre',
        label: 'Mercado Libre',
        desc: 'Tus ventas, preguntas y stock de ML, unificados con la tienda.',
      },
      {
        to: '/redes',
        label: 'Redes sociales',
        desc: 'Un post para Facebook, Instagram, X y Telegram a la vez, ahora o programado.',
      },
      {
        to: '/paginas',
        label: 'Páginas de contenido',
        desc: 'Las páginas de texto de tu tienda: sobre nosotros, envíos, preguntas frecuentes.',
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

export interface SettingsNavItem {
  to: string;
  label: string;
  /** Una línea que explica la página (tooltip al pasar el mouse). */
  desc?: string;
  icon: LucideIcon;
}
export interface SettingsNavGroup {
  heading: string;
  items: SettingsNavItem[];
}

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    heading: 'Pagos y envíos',
    items: [
      {
        to: '/configuracion/medios-de-pago',
        label: 'Medios de pago',
        desc: 'Conectá Mercado Pago y elegí cómo cobra tu tienda.',
        icon: CreditCard,
      },
      {
        to: '/configuracion/medios-de-envio',
        label: 'Medios de envío',
        desc: 'Envíos a domicilio, retiro y cotización en vivo (Correo Argentino, Zipnova).',
        icon: Package,
      },
      {
        to: '/configuracion/mercadolibre',
        label: 'Mercado Libre',
        desc: 'Conectá tu cuenta de vendedor para activar el canal ML.',
        icon: Store,
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
      },
      {
        to: '/configuracion/whatsapp-automatico',
        label: 'WhatsApp automático',
        desc: 'Avisos automáticos por WhatsApp con la API oficial de Meta.',
        icon: MessageCircle,
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
      },
    ],
  },
  {
    heading: 'Equipo y dominios',
    items: [
      {
        to: '/configuracion/usuarios',
        label: 'Usuarios',
        desc: 'Quién tiene acceso, con qué rol, sus excepciones y el registro de cambios.',
        icon: User,
      },
      {
        to: '/configuracion/roles',
        label: 'Roles y permisos',
        desc: 'Qué puede hacer cada rol en esta tienda: se activa y desactiva por funcionalidad.',
        icon: ShieldCheck,
      },
      {
        to: '/configuracion/dominios',
        label: 'Dominios',
        desc: 'El subdominio de tu tienda y la conexión de tu dominio propio.',
        icon: Globe,
      },
      {
        to: '/configuracion/redirecciones',
        label: 'Redirecciones',
        desc: 'Mandar una dirección vieja a la nueva para no perder visitas ni posicionamiento.',
        icon: Signpost,
      },
      {
        to: '/configuracion/medicion',
        label: 'Medición y píxeles',
        desc: 'Google Analytics, Google Ads, el píxel de Meta y Clarity, con permiso del visitante.',
        icon: BarChart3,
      },
    ],
  },
];

/** Una pantalla se muestra si pasa el flag de features y la persona tiene su permiso. */
const allowedFor = (can: (perm: Perm) => boolean) => (x: { to: string }) =>
  isNavVisible(x.to) && satisfies(can, routePerm(x.to));

/**
 * El menú lateral que ve esta persona. Un grupo se ve si se ve alguno de sus
 * hijos (aunque la pantalla del grupo pida otra cosa); una sección sin nada
 * visible no muestra su título.
 */
export function visibleMainNav(can: (perm: Perm) => boolean): NavSection[] {
  const allowed = allowedFor(can);
  return MAIN_NAV.map((s) => ({
    ...s,
    items: s.items
      .map((it) => (it.children ? { ...it, children: it.children.filter(allowed) } : it))
      .filter((it) => (it.children ? it.children.length > 0 : allowed(it))),
  })).filter((s) => s.items.length > 0);
}

/** El menú de Configuración que ve esta persona. */
export function visibleSettingsNav(can: (perm: Perm) => boolean): SettingsNavGroup[] {
  const allowed = allowedFor(can);
  return SETTINGS_NAV.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter(
    (g) => g.items.length > 0,
  );
}
