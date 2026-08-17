import type { HelpArticle } from './helpContent';

export const EMPEZAR = {
  primerosPasos: {
    title: 'Abrí tu tienda en 7 pasos',
    intro: 'Todo lo que necesitás para pasar de cero a vender, en orden.',
    category: 'Empezar',
    sections: [
      {
        heading: 'El camino completo',
        steps: [
          'Diseñá tu tienda: en Canales de venta → Tienda online elegí colores, tipografía y subí tu logo (también aparece en los emails que reciben tus clientes).',
          'Cargá tus productos: en Productos → Agregar, con fotos, precio, variantes y stock. Si tenés muchos, usá la importación por CSV.',
          'Conectá Mercado Pago: en Configuración → Medios de pago, con un click autorizás tu cuenta. La plata va directo a vos.',
          'Definí los envíos: en Configuración → Medios de envío creá al menos uno (domicilio con precio fijo o retiro gratis). Sin esto el checkout no ofrece entrega.',
          'Revisá los e-mails automáticos: en Configuración → E-mails automáticos activá los que quieras; salen con tu logo y colores.',
          'Invitá a tu equipo: en Configuración → Usuarios sumá gente con roles (vendedor, catálogo, finanzas, soporte…).',
          'Compartí tu URL: tu tienda ya vive en tutienda.tiendafy. Cuando quieras, conectá tu dominio propio.',
        ],
      },
      {
        heading: 'Probá una compra de punta a punta',
        paragraphs: [
          'Antes de difundir tu tienda, hacete una compra de prueba: agregá un producto al carrito, completá el checkout (email → entrega → pago) y pagá con las tarjetas de prueba de Mercado Pago.',
          'Verificá que la orden aparezca en Ventas, que llegue el email de confirmación y que puedas marcarla como enviada.',
        ],
        blocks: [
          {
            type: 'checklist',
            items: [
              'La orden aparece en Ventas como “Pagada”.',
              'Llegó el email de confirmación con tu logo y colores.',
              'Pudiste marcarla como enviada y llegó el aviso de “pedido en camino”.',
              'Si configuraste facturación, la venta muestra su factura con CAE.',
            ],
          },
        ],
      },
      {
        heading: '¿Administrás la plataforma además de la tienda?',
        paragraphs: [
          'Varias integraciones tienen dos niveles: una app o credencial de PLATAFORMA que se configura una sola vez en el servidor, y la conexión de cada tienda desde el panel. Si un botón de conectar avisa que “falta configuración”, casi seguro falta el nivel plataforma.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Integración', 'Nivel plataforma (una vez)', 'Nivel tienda'],
            rows: [
              ['Mercado Pago', 'App marketplace (Client ID/Secret + webhook)', 'OAuth con un click'],
              ['Mercado Libre', 'App de desarrolladores (Client ID/Secret + webhook)', 'OAuth con un click'],
              [
                'Emails (Resend)',
                'API key + dominio verificado + webhook de rebotes',
                'Solo editar plantillas',
              ],
              ['WhatsApp', '— (no tiene)', 'App de Meta propia por tienda'],
              ['ARCA', '— (URLs ya incluidas)', 'Certificado + punto de venta por tienda'],
              ['Correo Argentino / Zipnova', '— (no tienen)', 'Credenciales por tienda, cifradas'],
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Cada guía de integración tiene su sección “Para quien administra la plataforma” con los pasos exactos. El inventario completo de claves y variables vive en docs/CONFIGURACION.md del proyecto.',
          },
        ],
      },
      {
        heading: 'La ayuda te sigue a todos lados',
        paragraphs: [
          'No hace falta memorizar nada: al pie de cada pantalla del panel hay un link que abre la guía de esa pantalla en una pestaña nueva.',
        ],
        blocks: [
          {
            type: 'demo',
            demo: 'helpLink',
            caption:
              'Este link aparece al pie de cada pantalla del panel y abre el artículo correspondiente.',
          },
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
