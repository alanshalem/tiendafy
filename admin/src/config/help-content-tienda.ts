import type { HelpArticle } from './helpContent';

export const TIENDA = {
  paginas: {
    title: 'Páginas de contenido',
    intro: 'Creá páginas propias: quiénes somos, cómo comprar, política de cambios, lo que necesites.',
    category: 'Tu tienda online',
    sections: [
      {
        heading: 'Crear una página',
        steps: [
          'En Canales de venta → Páginas de contenido, tocá “Crear página”, poné el título y escribí el contenido con el editor.',
          'La URL se genera sola a partir del título (ej: /paginas/como-comprar); si querés otra, escribila.',
          'Dejá tildado “Publicada” para que se vea. Destildada queda como borrador, invisible para tus clientes.',
        ],
        blocks: [
          { type: 'path', segments: ['Páginas de contenido', 'Crear página'] },
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
          'Las páginas publicadas aparecen solas al final del menú del encabezado (ahí las podés ocultar, renombrar o mover desde Encabezado → Menú) y, si lo prendés, en el pie de página con “Mostrar links a tus páginas de contenido”.',
          'Además se pueden elegir como destino de cualquier botón, banner o link del editor de diseño: en el selector de links, solapa Página → Tus páginas.',
        ],
      },
    ],
  },

  estadisticas: {
    title: 'Estadísticas',
    intro:
      'Mirá cómo va tu negocio: ventas, productos, visitas, ganancia y cupones, comparado con el período anterior.',
    category: 'Tu tienda online',
    keywords: ['métricas', 'reportes', 'dashboard', 'utm', 'conversión', 'roas'],
    sections: [
      {
        heading: 'Qué encontrás',
        blocks: [
          { type: 'path', segments: ['Estadísticas'] },
          {
            type: 'table',
            headers: ['Pantalla', 'Qué muestra'],
            rows: [
              [
                'Visión general',
                'Facturación, ventas cobradas, ticket promedio y clientes, cada uno con su variación contra el período anterior. Facturación por día, por dónde vendés (tienda online o Mercado Libre), de dónde llegan tus ventas y lo más vendido.',
              ],
              [
                'Productos',
                'Los más vendidos por unidades y los que más facturan, y lo que NO se vende: los publicados que no tuvieron ninguna venta en el período.',
              ],
              [
                'Ventas y clientes',
                'Clientes nuevos, pedidos por estado y los días de la semana con más ventas.',
              ],
              [
                'Rentabilidad',
                'Cuánto ganás de verdad: costos, comisiones, ganancia por canal y el retorno real de Meta Ads.',
              ],
              [
                'Visitas',
                'Visitas, visitantes únicos, la conversión (de cada 100 que entran, cuántos compran), las fuentes de tráfico y las páginas más vistas.',
              ],
              [
                'Tiempo real',
                'Quién está navegando tu tienda ahora, qué páginas, y cómo viene el día comparado con ayer a esta hora.',
              ],
              ['Reporte de cupones', 'Venta con cupón, descuento otorgado y usos, cupón por cupón.'],
            ],
          },
        ],
      },
      {
        heading: 'Elegir el período',
        paragraphs: [
          'Arriba de cada pantalla elegís las fechas: hoy, últimos 7, 30 o 90 días, este mes, este año o un rango personalizado. Las variaciones (el número verde o rojo al lado de cada indicador) comparan contra el período anterior del mismo largo. El período queda en la dirección, así que podés mandarle a alguien el link de lo que estás mirando.',
        ],
      },
      {
        heading: 'De dónde vienen tus ventas',
        paragraphs: [
          'Cada visita y cada venta guardan de dónde vino el comprador: la marca utm_source del link por el que entró la primera vez en esa visita. Con eso se arman “De dónde llegan tus ventas” (Visión general), “Fuentes de tráfico” (Visitas) y “Ganancia por canal” (Rentabilidad). Lo que llega sin marca cuenta como directo.',
          'Los posts que armás en Redes sociales ya marcan sus links solos. Para el resto —el link de tu bio, un aviso, un mensaje masivo de WhatsApp— agregale vos la marca al final: tutienda.com/productos?utm_source=instagram.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Usá siempre la misma palabra para el mismo canal (“instagram”, no a veces “ig” y a veces “Instagram”): cada forma distinta aparece como un canal aparte.',
          },
        ],
      },
      {
        heading: 'Quién las ve',
        paragraphs: [
          'De fábrica: dueño, administrador, vendedor y finanzas; Rentabilidad, solo quien puede ver costos. Los roles catálogo y soporte no acceden a los números del negocio. Lo podés cambiar en Configuración → Roles y permisos.',
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
          'Cada tienda genera automáticamente su sitemap (/sitemap.xml) con todo el catálogo, sus categorías y tus páginas, su robots.txt y las URLs canónicas. Los productos publican datos estructurados (precio, stock, fotos) para que Google pueda mostrarlos como resultados enriquecidos, y las páginas de producto usan la primera foto como imagen al compartir en redes.',
          'Cada página se titula “Página · Tu tienda”, las categorías tienen su propia página que Google puede encontrar, un producto o una página que no existe responde como “no encontrada” (y no como una página vacía), y lo privado —el checkout, la cuenta del cliente y sus favoritos— queda fuera de Google.',
          'Si tu inicio tiene una sección de Preguntas frecuentes, Google recibe esas preguntas y respuestas en el formato que usa para mostrarlas directo en los resultados.',
        ],
      },
      {
        heading: 'Conectá Google Search Console',
        steps: [
          'Entrá a search.google.com/search-console y agregá tu dominio como propiedad de tipo “Dominio”.',
          'Google te da un registro TXT: crealo en el panel de DNS de donde compraste el dominio y tocá Verificar. No hace falta pegar ningún código en la tienda.',
          'En Sitemaps, enviá la URL de tu sitemap: tudominio.com/sitemap.xml.',
          'En unos días vas a ver qué búsquedas te traen visitas y si hay errores de indexación.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'La verificación por DNS es la que Google recomienda: sobrevive a cualquier cambio de la tienda. Para conectar Google Analytics no hace falta Search Console: se carga el identificador en Configuración → Medición y píxeles.',
          },
        ],
      },
      {
        heading: 'Buenas prácticas de contenido',
        paragraphs: [
          'Nombres de producto descriptivos (lo que la gente busca, no códigos internos), descripciones únicas y completas, y categorías bien armadas. Si cambiás la URL de un producto, creá una redirección en Configuración → Redirecciones para no perder el posicionamiento ganado.',
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
          'Con "Pedir permiso antes de medir" encendido, la tienda muestra un aviso abajo de todo y no carga nada hasta que la persona acepte. Si dice que no, no se carga nunca y no se vuelve a preguntar. El aviso aparece solo si tenés al menos una herramienta cargada: sin nada que consentir, no molesta a nadie.',
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
          'Volvé a Dominios y tocá “Volver a verificar” (el botón redondo). Cuando el estado diga “Apuntando bien”, terminaste.',
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
