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
export const NAV_VISIBILITY: Record<string, boolean> = {
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
  '/productos': true,
  '/productos/inventario': true,
  '/productos/categorias': true,
  '/clientes': true,
  '/descuentos': true,
  '/marketing': true,
  '/canales/tienda-online': true,
  '/mercadolibre': true,
  '/paginas': true,
  '/canales/redes': false,
  '/canales/google': false,
  '/canales/marketplaces': false,
  '/tenants': true,
  '/aplicaciones': false,

  // Configuración
  '/configuracion/medios-de-pago': true,
  '/configuracion/medios-de-envio': true,
  '/configuracion/mercadolibre': true,
  '/configuracion/centros-de-distribucion': true,
  '/configuracion/emails-automaticos': true,
  '/configuracion/whatsapp-automatico': true,
  '/configuracion/opciones-del-checkout': true,
  '/configuracion/facturacion': true,
  '/configuracion/usuarios': true,
  '/configuracion/dominios': true,
  '/configuracion/codigos-externos': true,
  '/configuracion/idiomas-y-monedas': true,
  '/configuracion/redirecciones': true,
  '/configuracion/campos-personalizados': true,
};

export const isNavVisible = (to: string): boolean => NAV_VISIBILITY[to] ?? true;

// ---- Enlaces de ayuda ("Más sobre…") -----------------------------------------
export const SHOW_HELP_LINKS = true;

// El contenido real de cada manual vive en config/helpContent.ts y se muestra
// en /ayuda/:topic dentro del admin (no depende de un sitio externo).
export const HELP_LINKS = {
  primerosPasos: { label: 'Guía para abrir tu tienda' },
  payments: { label: 'Más sobre medios de pago' },
  ventas: { label: 'Más sobre ventas y reembolsos' },
  checkout: { label: 'Más sobre checkout' },
  cupones: { label: 'Más sobre cupones de descuento' },
  shipping: { label: 'Más sobre medios de envío' },
  correoArgentino: { label: 'Más sobre envíos con Correo Argentino' },
  zipnova: { label: 'Más sobre envíos con Zipnova' },
  mercadolibre: { label: 'Más sobre la integración con Mercado Libre' },
  distributionCenters: { label: 'Más sobre centros de distribución' },
  productos: { label: 'Más sobre productos e inventario' },
  clientes: { label: 'Más sobre clientes' },
  posventa: { label: 'Más sobre el chat posventa' },
  autoEmails: { label: 'Más sobre e-mails automáticos' },
  emailMarketing: { label: 'Más sobre campañas de email' },
  whatsappAuto: { label: 'Más sobre WhatsApp automático' },
  contact: { label: 'Más sobre información de contacto' },
  whatsapp: { label: '¿Cómo agregar el botón de WhatsApp?' },
  customerMessage: { label: 'Más sobre mensaje informativo' },
  tema: { label: 'Más sobre el diseño de tu tienda' },
  paginas: { label: 'Más sobre páginas de contenido' },
  estadisticas: { label: 'Más sobre estadísticas' },
  users: { label: 'Más sobre roles y permisos' },
  domains: { label: 'Más sobre dominios' },
  fiscal: { label: 'Más sobre facturación electrónica (ARCA)' },
  legal: { label: 'Requisitos legales de tu tienda' },
  seo: { label: 'Más sobre cómo aparecer en Google' },
  externalCodes: { label: 'Más sobre Analytics, Pixel y códigos externos' },
  ajustesAvanzados: { label: 'Más sobre ajustes avanzados' },
} as const;

export type HelpLinkId = keyof typeof HELP_LINKS;
