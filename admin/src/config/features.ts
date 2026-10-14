/**
 * Configuración central de UI del admin.
 *
 * 1) NAV_VISIBILITY: activá/desactivá secciones y subsecciones del menú (principal
 *    y configuración) desde un solo lugar. key = ruta (`to`). Ausente o `true` =
 *    visible; `false` = oculto. Ocultar un padre con hijos: poné su ruta en false.
 * 2) HELP_LINKS: los enlaces de ayuda ("Más sobre…") centralizados. Cambiás la URL
 *    una vez y se actualiza en todas las pantallas. SHOW_HELP_LINKS los apaga a todos.
 */

// ---- Visibilidad del menú ----------------------------------------------------
const NAV_VISIBILITY: Record<string, boolean> = {
  // Menú principal
  '/': true,
  '/estadisticas': true,
  '/estadisticas/productos': true,
  '/estadisticas/ventas': true,
  '/estadisticas/visitas': true,
  '/estadisticas/tiempo-real': true,
  '/estadisticas/cupones': true,
  '/ventas': true,
  '/ventas/carritos': true,
  '/presupuestos': true,
  '/productos': true,
  '/productos/inventario': true,
  '/productos/categorias': true,
  '/productos/listas-de-precios': true,
  '/proveedores': true,
  '/tesoreria': true,
  '/cuentas-corrientes': true,
  '/clientes': true,
  '/descuentos': true,
  '/marketing': true,
  '/canales/tienda-online': true,
  '/mercadolibre': true,
  '/paginas': true,
  '/redes': true,
  '/tenants': true,

  // Configuración
  '/configuracion/medios-de-pago': true,
  '/configuracion/medios-de-envio': true,
  '/configuracion/mercadolibre': true,
  '/configuracion/emails-automaticos': true,
  '/configuracion/whatsapp-automatico': true,
  '/configuracion/opciones-del-checkout': true,
  '/configuracion/facturacion': true,
  '/configuracion/usuarios': true,
  '/configuracion/dominios': true,
  '/configuracion/redirecciones': true,
  '/configuracion/medicion': true,
  '/configuracion/ficha-tecnica': true,
};

export const isNavVisible = (to: string): boolean => NAV_VISIBILITY[to] ?? true;

// ---- Enlaces de ayuda ("Más sobre…") -----------------------------------------
export const SHOW_HELP_LINKS = true;

// El contenido real de cada manual vive en config/help-content-*.ts (agregado
// por config/helpContent.ts) y se muestra en /ayuda/:topic dentro del admin
// (no depende de un sitio externo).
export const HELP_LINKS = {
  primerosPasos: { label: 'Guía para abrir tu tienda' },
  glosario: { label: 'Glosario: las palabras del sistema' },
  payments: { label: 'Más sobre medios de pago' },
  payway: { label: 'Más sobre cobrar con Payway' },
  transferencia: { label: 'Más sobre transferencia, efectivo y cuotas' },
  ventas: { label: 'Más sobre ventas y reembolsos' },
  presupuestos: { label: 'Más sobre presupuestos' },
  rentabilidad: { label: 'Más sobre rentabilidad real' },
  checkout: { label: 'Más sobre checkout' },
  cupones: { label: 'Más sobre cupones de descuento' },
  shipping: { label: 'Más sobre medios de envío' },
  correoArgentino: { label: 'Más sobre envíos con Correo Argentino' },
  zipnova: { label: 'Más sobre envíos con Zipnova' },
  andreani: { label: 'Más sobre envíos con Andreani' },
  mercadolibre: { label: 'Más sobre la integración con Mercado Libre' },
  redes: { label: 'Más sobre redes sociales' },
  productos: { label: 'Más sobre productos e inventario' },
  compras: { label: 'Más sobre compras e importaciones' },
  proveedores: { label: 'Más sobre proveedores' },
  listasDePrecios: { label: 'Más sobre listas de precios' },
  tesoreria: { label: 'Más sobre tesorería' },
  cuentasCorrientes: { label: 'Más sobre cuentas corrientes' },
  escaner: { label: 'Más sobre el escáner de depósito' },
  kits: { label: 'Más sobre kits y combos' },
  clientes: { label: 'Más sobre clientes' },
  posventa: { label: 'Más sobre el chat posventa' },
  autoEmails: { label: 'Más sobre e-mails automáticos' },
  emailMarketing: { label: 'Más sobre campañas de email' },
  whatsappAuto: { label: 'Más sobre WhatsApp automático' },
  contact: { label: 'Más sobre información de contacto' },
  whatsapp: { label: '¿Cómo agregar el botón de WhatsApp?' },
  customerMessage: { label: 'Más sobre mensaje informativo' },
  tema: { label: 'Más sobre el diseño de tu tienda' },
  temaInicio: { label: 'Cómo armar el inicio de tu tienda' },
  temaSecciones: { label: 'Qué hace cada tipo de sección' },
  temaPaginas: { label: 'Más sobre encabezado, menú, listado y carrito' },
  paginas: { label: 'Más sobre páginas de contenido' },
  estadisticas: { label: 'Más sobre estadísticas' },
  users: { label: 'Más sobre roles y permisos' },
  domains: { label: 'Más sobre dominios' },
  fiscal: { label: 'Más sobre facturación electrónica (ARCA)' },
  legal: { label: 'Requisitos legales de tu tienda' },
  seo: { label: 'Más sobre cómo aparecer en Google' },
  ajustesAvanzados: { label: 'Más sobre redirecciones' },
  externalCodes: { label: 'Más sobre medición y píxeles' },
  fichaTecnica: { label: 'Más sobre la ficha técnica' },
  plataformaPuestaEnMarcha: { label: 'Cómo está armado y en qué orden se levanta' },
  plataformaDesarrollo: { label: 'Levantar el proyecto en tu máquina' },
  plataformaClaves: { label: 'Qué conseguir y dónde se carga cada cosa' },
  plataformaDeploy: { label: 'Instalar y desplegar en el servidor' },
  plataformaTramites: { label: 'Trámites y altas con proveedores' },
  integracionesProduccion: { label: 'Checklist antes de cobrar y despachar' },
  plataformaOperacion: { label: 'Mantener la plataforma andando' },
} as const;

export type HelpLinkId = keyof typeof HELP_LINKS;
