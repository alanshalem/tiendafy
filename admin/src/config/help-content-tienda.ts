import type { HelpArticle } from './helpContent';

export const TIENDA = {
  tema: {
    title: 'Diseño de tu tienda',
    intro: 'Editá colores, tipografías, logo y secciones sin tocar código, con vista previa en vivo.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'El editor visual',
        paragraphs: [
          'En Canales de venta → Tienda online armás tu tienda por secciones: portada, productos destacados, banners, beneficios, carrito y más. Todo con vista previa al instante.',
        ],
        blocks: [
          { type: 'path', segments: ['Canales de venta', 'Tienda online'] },
          {
            type: 'demo',
            demo: 'storefrontPreview',
            caption:
              'Probalo acá mismo: tocá un color y mirá cómo cambia toda la tienda. En el editor real es igual, pero con TU tienda y tus productos.',
          },
        ],
      },
      {
        heading: 'Borrador y publicar',
        paragraphs: [
          'Los cambios se guardan como borrador automáticamente; tu tienda pública no cambia hasta que toques “Publicar”. Podés experimentar tranquilo: nadie ve el borrador más que vos.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Si te arrepentís de un cambio, el editor tiene deshacer/rehacer. Y mientras no publiques, tu tienda pública sigue exactamente igual.',
          },
        ],
      },
      {
        heading: 'Tu marca en todos lados',
        paragraphs: [
          'El logo y el color primario que definas acá se usan también en los e-mails automáticos que reciben tus clientes. Subí un logo de hasta ~160 px de ancho para que se vea nítido.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Los emails usan el tema PUBLICADO',
            text: 'Si cambiaste el logo y en los emails sigue apareciendo el anterior, es porque el cambio quedó en el borrador: tocá “Publicar”. Y para email usá PNG/JPG — los SVG no se muestran en Gmail ni Outlook — con colores que se vean sobre fondo blanco.',
          },
        ],
      },
      {
        heading: 'Galería de diseños',
        paragraphs: [
          'Si preferís arrancar de una base, la galería trae combinaciones listas de colores y tipografías. Las aplicás y después ajustás lo que quieras.',
        ],
      },
    ],
  },

  paginas: {
    title: 'Páginas de contenido',
    intro: 'Creá páginas propias: quiénes somos, cómo comprar, política de cambios, lo que necesites.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'Crear una página',
        steps: [
          'En Páginas → Agregar, poné el título y escribí el contenido con el editor.',
          'La URL se genera sola (ej: /paginas/como-comprar).',
          'Publicala. Las no publicadas quedan como borrador, invisibles para tus clientes.',
        ],
        blocks: [
          { type: 'path', segments: ['Páginas', 'Agregar'] },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Si creás una página con la URL “terminos” o “privacidad”, reemplaza automáticamente a la versión genérica que publica tu tienda.',
          },
        ],
      },
      {
        heading: 'Dónde se ven',
        paragraphs: [
          'Las páginas publicadas se pueden enlazar desde el pie de página de tu tienda y desde cualquier sección del editor de diseño.',
        ],
      },
    ],
  },

  estadisticas: {
    title: 'Estadísticas',
    intro: 'Mirá cómo va tu negocio: ventas, productos, visitas y cupones.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'Qué encontrás',
        steps: [
          'Visión general: facturación, pedidos y ticket promedio del período.',
          'Productos: los más vendidos y los más vistos.',
          'Ventas y clientes: evolución de ventas y compradores nuevos vs. recurrentes.',
          'Visitas: tráfico de tu tienda y páginas más vistas.',
          'Tiempo real: quién está navegando tu tienda ahora.',
          'Reporte de cupones: uso y descuento total de cada código.',
        ],
        blocks: [{ type: 'path', segments: ['Estadísticas'] }],
      },
      {
        heading: 'Quién las ve',
        paragraphs: [
          'Dueño, administrador, vendedor y finanzas. Los roles catálogo y soporte no acceden a los números del negocio.',
        ],
      },
    ],
  },

  seo: {
    title: 'Aparecer en Google (SEO)',
    intro:
      'Tu tienda ya viene optimizada para buscadores. Esto es lo que hace sola y lo que podés mejorar vos.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'Tu título y descripción en Google',
        paragraphs: [
          'En el editor de diseño (Canales de venta → Tienda online → Identidad → “Cómo aparecés en Google”) definís el título y la descripción que se muestran en los resultados de búsqueda. Un buen título: “Marca — qué vendés” en menos de 60 caracteres; la descripción, un gancho de hasta 160.',
        ],
        blocks: [{ type: 'path', segments: ['Canales de venta', 'Tienda online', 'Identidad'] }],
      },
      {
        heading: 'Lo que la tienda hace sola',
        paragraphs: [
          'Cada tienda genera automáticamente su sitemap (/sitemap.xml), su robots.txt y las URLs canónicas. Los productos publican datos estructurados (precio, stock, fotos) para que Google pueda mostrarlos como resultados enriquecidos, y las páginas de producto usan la primera foto como imagen al compartir en redes.',
        ],
      },
      {
        heading: 'Conectá Google Search Console',
        steps: [
          'Entrá a search.google.com/search-console y agregá tu dominio como propiedad.',
          'Elegí verificación por “Etiqueta HTML”, copiá la etiqueta y pegala en Configuración → Códigos externos (sección <head>). Guardá y verificá.',
          'En Sitemaps, enviá la URL de tu sitemap: tudominio.com/sitemap.xml.',
          'En unos días vas a ver qué búsquedas te traen visitas y si hay errores de indexación.',
        ],
      },
      {
        heading: 'Buenas prácticas de contenido',
        paragraphs: [
          'Nombres de producto descriptivos (lo que la gente busca, no códigos internos), descripciones únicas y completas, y categorías bien armadas. Si cambiás la URL de un producto, creá una redirección 301 en Configuración → Redireccionamientos para no perder el posicionamiento ganado.',
          'Un dominio propio (en vez del subdominio gratis) suma confianza y marca — conectalo cuando estés listo.',
        ],
      },
    ],
  },

  externalCodes: {
    title: 'Medición y píxeles',
    intro:
      'Conectá Google, Meta y Clarity para saber de dónde viene tu gente y qué avisos terminan en venta.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'Pegás un identificador, no un código',
        paragraphs: [
          'En otras plataformas hay una caja para pegar el fragmento que te da Google o Meta. Acá no, y es a propósito: el formulario donde tu cliente escribe el número de tarjeta está dentro de tu propia tienda, y un código de afuera metido en esa pantalla es exactamente la forma en que se roban tarjetas en el comercio electrónico.',
          'Vos cargás el identificador —una cadena corta como G-ABCD123456— y el código lo escribe Tiendafy. Ninguna de estas herramientas se carga en la pantalla de pago, ni siquiera si el visitante ya aceptó.',
        ],
        blocks: [
          { type: 'path', segments: ['Configuración', 'Medición y píxeles'] },
          {
            type: 'table',
            headers: ['Herramienta', 'Para qué', 'Dónde está el identificador'],
            rows: [
              [
                'Google Analytics 4',
                'Cuánta gente entra, de dónde y qué mira',
                'analytics.google.com → Administrar → Flujos de datos',
              ],
              [
                'Google Ads',
                'Qué avisos terminan en venta',
                'ads.google.com → Herramientas → Etiqueta de Google',
              ],
              [
                'Píxel de Meta',
                'Campañas de Facebook e Instagram',
                'business.facebook.com → Administrador de eventos',
              ],
              [
                'Microsoft Clarity',
                'Grabaciones y mapas de calor, gratis',
                'clarity.microsoft.com → Settings → Overview',
              ],
            ],
          },
        ],
      },
      {
        heading: 'El permiso del visitante',
        paragraphs: [
          'Con "Pedir permiso" encendido, la tienda muestra un aviso abajo de todo y no carga nada hasta que la persona acepte. Si dice que no, no se carga nunca y no se vuelve a preguntar. El aviso aparece solo si tenés al menos una herramienta cargada: sin nada que consentir, no molesta a nadie.',
          'Si el navegador manda la señal de "no me rastreen" (Global Privacy Control), se toma como un no sin preguntar.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Las visitas que mide Tiendafy para tus propias estadísticas no dependen de esto: son tuyas, no se comparten con nadie y no llevan a ninguna plataforma de avisos.',
          },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Nombrá las herramientas que uses en tu política de privacidad. Se edita como una página de contenido con la dirección «privacidad».',
          },
        ],
      },
      {
        heading: 'Qué se mide y qué no',
        paragraphs: [
          'Se cuentan las visitas a cada pantalla y, cuando una compra termina bien, la venta con su monto — que es lo que le permite a Google y a Meta decirte cuánto te rindió cada aviso. No se mide nada en la pantalla de pago.',
          'Si necesitás una herramienta que no está en la lista, pedila: se agrega al catálogo con su cargador escrito por nosotros. La lista es corta a propósito, no por falta de ganas.',
        ],
      },
      {
        heading: 'Verificar tu dominio en Google o Meta',
        paragraphs: [
          'Para eso no hace falta ningún código en la tienda: tanto Search Console como Meta aceptan verificar por DNS, agregando un registro TXT donde compraste el dominio. Es mejor así — sobrevive a cualquier cambio del sitio.',
        ],
      },
    ],
  },

  ajustesAvanzados: {
    title: 'Redirecciones',
    intro: 'Que un link viejo no termine en “página no encontrada”.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'Para qué sirven',
        paragraphs: [
          'Cada dirección que publicaste queda dando vueltas: en Google, en un mail, en un posteo, en el chat de alguien. Si cambiás el nombre de un producto o borrás una página, esa dirección deja de existir y el que la sigue cae en un error. Una redirección lo lleva directo al lugar nuevo, y Google le pasa a la dirección nueva el posicionamiento que tenía la vieja.',
        ],
        blocks: [
          { type: 'path', segments: ['Configuración', 'Redirecciones'] },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Regla simple: cada vez que cambies o borres una dirección que ya estaba publicada, creá su redirección en el momento. Es un minuto que protege meses de posicionamiento.',
          },
        ],
      },
      {
        heading: 'Cómo se cargan',
        steps: [
          'Escribí la dirección vieja, solo la parte que va después del dominio: /remera-negra-vieja.',
          'Escribí la nueva: /productos/remera-negra. También vale una dirección completa de otro sitio.',
          'Tocá Agregar. Se guarda al instante, no hay nada más que confirmar.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Al visitante le llega una redirección permanente (un 308, el equivalente moderno del clásico 301). Google las trata igual: le pasa a la dirección nueva el posicionamiento de la vieja.',
          },
        ],
      },
      {
        heading: 'La columna “Se usó”',
        paragraphs: [
          'Cuenta cuántas visitas salvó cada regla. Una que dice “Nunca” después de varias semanas se puede borrar sin drama. Una que se usa mucho es la señal de que ese link viejo sigue circulando en algún lado: si está en un posteo o un mail tuyo, conviene corregirlo también en el origen.',
        ],
      },
    ],
  },

  domains: {
    title: 'Dominios',
    intro: 'Tu tienda ya vive en un subdominio gratis; cuando quieras, conectás tu dominio propio.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'Subdominio gratis',
        paragraphs: [
          'Apenas creás la tienda tenés una URL del tipo tutienda.tiendafy. En desarrollo es tutienda.localhost:3000. Ya funciona, no hace falta configurar nada.',
        ],
      },
      {
        heading: 'Configurá tu dominio propio',
        steps: [
          'Comprá tu dominio en cualquier registrador (NIC.ar para los .com.ar, o GoDaddy, Cloudflare, Donweb).',
          'En Configuración → Dominios, tocá “Conectar mi dominio” y escribilo sin https:// ni barra final.',
          'La pantalla te muestra el registro CNAME exacto que tenés que crear: tipo, nombre y valor. Copiá el valor con el botón.',
          'Entrá al panel de tu registrador, buscá la sección de DNS y creá ese registro.',
          'Volvé a Dominios y tocá el botón de refrescar. Cuando el estado diga “Apuntando bien”, terminaste.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'La propagación de DNS no depende de Tiendafy ni de tu registrador solamente: cada proveedor de internet actualiza a su ritmo. Si a las 48 hs sigue pendiente, ahí sí hay que revisar la configuración.',
          },
        ],
      },
      {
        heading: 'Verificá la configuración',
        paragraphs: [
          'La pantalla de Dominios consulta el DNS de verdad cada vez que la abrís: no te dice “listo” hasta que tu dominio resuelva al mismo lugar que la plataforma.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Estado', 'Qué significa', 'Qué hacer'],
            rows: [
              [
                'Sin apuntar todavía',
                'El dominio no resuelve a ningún lado.',
                'Falta crear el CNAME, o todavía está propagando.',
              ],
              [
                'Apunta a otro lado',
                'Resuelve, pero a un servidor que no es el nuestro.',
                'Suele ser un registro A viejo o un redirect del registrador. Borralo y dejá solo el CNAME.',
              ],
              [
                'Apuntando bien',
                'Tu tienda ya responde en tu dominio.',
                'Nada. El certificado se emite solo en la primera visita.',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Vencimiento del dominio',
        paragraphs: [
          'El dominio lo renovás en tu registrador (no en Tiendafy). Activá la renovación automática para no quedarte sin tu dirección. Si vence, tu tienda deja de responder en ese dominio (pero sigue viva en el subdominio gratis).',
        ],
      },
      {
        heading: 'Certificado de seguridad (SSL)',
        paragraphs: [
          'El candado HTTPS se emite y renueva solo, sin que hagas nada y sin costo. No se puede emitir antes de que el dominio apunte, así que hasta ese momento la columna del certificado queda en espera. Después de que el DNS propague puede tardar unos minutos más, hasta la primera visita.',
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
