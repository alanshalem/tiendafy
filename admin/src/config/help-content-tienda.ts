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
          { type: 'path', segments: ['Canales de venta', 'Páginas de contenido'] },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Si creás una página publicada con la URL “terminos” (o “terminos-y-condiciones”) o “privacidad” (o “politica-de-privacidad”), reemplaza automáticamente a la versión genérica que publica tu tienda.',
          },
        ],
      },
      {
        heading: 'Editar, borrar y cambiar la URL',
        paragraphs: [
          'La lista tiene un buscador por título o dirección. Con el menú ⋮ de cada página la editás o la eliminás (pide confirmación). Dos páginas no pueden tener la misma URL: si ya existe, te avisa al guardar.',
          'Un cambio en una página puede tardar hasta un minuto en verse en la tienda.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'Si le cambiás la URL a una página ya publicada, o la borrás, los links viejos (en Google, en un posteo, en un mail) dan “página no encontrada”. Creá una redirección de la dirección vieja a la nueva: lo explica el artículo «Redirecciones».',
          },
        ],
      },
      {
        heading: 'Dónde se ven',
        paragraphs: [
          'Las páginas publicadas aparecen solas al final del menú del encabezado (ahí las podés ocultar, renombrar o mover desde Encabezado → Menú) y en el pie de página, si le agregás una columna “Páginas de contenido” en Pie de página → Columnas.',
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
    keywords: [
      'métricas',
      'reportes',
      'dashboard',
      'utm',
      'conversión',
      'roas',
      'ventas y clientes',
      'visitas',
      'visitantes',
      'tiempo real',
      'reporte de cupones',
      'tráfico',
    ],
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
                'Facturación, ventas cobradas, ticket promedio y clientes nuevos, cada uno con su variación contra el período anterior. Facturación por día, por dónde vendés (tienda online o Mercado Libre), de dónde llegan tus ventas, los cinco productos que más facturaron y un resumen de tu tienda hoy (productos publicados, borradores, archivados, categorías, cupones activos y páginas).',
              ],
              [
                'Productos',
                'Unidades vendidas, cuántos productos distintos se vendieron, los más vendidos por unidades y los que más facturan, y lo que NO se vende: los publicados que no tuvieron ninguna venta en el período.',
              ],
              [
                'Ventas y clientes',
                'Facturación, ventas pagadas, ticket promedio y clientes nuevos (los que compraron por primera vez), la facturación por día, los pedidos por estado y los cinco días que más facturaron.',
              ],
              [
                'Rentabilidad',
                'Cuánto ganás de verdad: ganancia real, margen, costo de productos, comisiones, ganancia por día, por producto y por canal, y lo que te rinde la pauta de Meta Ads. Lo explica el artículo «Rentabilidad real».',
              ],
              [
                'Visitas',
                'Visitas (páginas vistas), visitantes únicos, la conversión (de cada 100 visitantes distintos, cuántos compran) y las ventas del período, con su variación; las visitas por día, las fuentes de tráfico y las páginas más vistas.',
              ],
              [
                'Tiempo real',
                'Lo que pasa en los últimos 5 minutos (visitantes activos, qué páginas miran y las últimas vistas), el pulso minuto a minuto de la última hora, y las ventas y lo facturado hoy contra lo que llevabas ayer a esta hora. Se actualiza solo cada 10 segundos.',
              ],
              [
                'Reporte de cupones',
                'Venta con cupón, descuento otorgado, usos y cupones activos; los que más venta trajeron y el detalle cupón por cupón (usos, pagados, venta, descuento y neto).',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Elegir el período',
        paragraphs: [
          'Arriba de cada pantalla (menos Tiempo real) elegís las fechas: hoy, últimos 7, 30 o 90 días, este mes, este año o un rango personalizado. Si no elegís nada, se muestran los últimos 30 días. Las variaciones (el número verde o rojo al lado de cada indicador) comparan contra el período anterior del mismo largo.',
          'El período es uno solo para todas las pantallas de estadísticas: si elegís “Este mes” en Visitas y pasás a Rentabilidad, sigue siendo este mes. También queda en la dirección, así que podés mandarle a alguien el link de lo que estás mirando.',
          'Los días se cuentan en hora argentina: una venta de las 23:30 cuenta en ese día, no en el siguiente.',
        ],
      },
      {
        heading: 'De dónde vienen tus ventas',
        paragraphs: [
          'Cada visita y cada venta guardan de dónde vino el comprador: la marca utm_source del link por el que entró en esa visita. Con eso se arman “De dónde llegan tus ventas” (Visión general), “Fuentes de tráfico” (Visitas) y “Ganancia por canal” (Rentabilidad). Lo que llega sin marca cuenta como directo.',
          'Los links a productos que agregás a un post desde Redes sociales ya salen marcados (como “redes”). Para el resto —el link de tu bio, un aviso, un mensaje masivo de WhatsApp— agregale vos la marca al final: tutienda.com/productos?utm_source=instagram. Las campañas de email no se marcan solas: si querés verlas como “Email marketing”, terminá sus links en ?utm_source=email.',
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
          'De fábrica, las estadísticas las ven dueño, administrador, vendedor y finanzas (permiso “Ver estadísticas”). Rentabilidad va aparte, con el permiso “Ver costos y rentabilidad”: dueño, administrador, catálogo y finanzas. Soporte no ve ninguna. Lo podés cambiar en Configuración → Roles y permisos.',
        ],
      },
    ],
  },

  asistente: {
    title: 'Preguntale a tu tienda',
    intro:
      'Un asistente que contesta preguntas sobre los datos de tu tienda —ventas, stock, compras y clientes— en lenguaje común. Mira, nunca cambia nada.',
    category: 'Tu tienda online',
    keywords: [
      'asistente',
      'preguntar',
      'ia',
      'inteligencia artificial',
      'chat',
      'consultar',
      'datos',
      'cuánto vendí',
      'cuánto gané',
    ],
    sections: [
      {
        heading: 'Qué podés preguntarle',
        paragraphs: [
          'Lo mismo que mirarías en Inicio, Estadísticas, Compras y Clientes, pero escrito como se lo preguntarías a una persona. Podés pedir un período («este mes», «la semana pasada», «del 1 al 15 de octubre»); si no decís ninguno, usa los últimos 30 días y te lo aclara.',
        ],
        blocks: [
          { type: 'path', segments: ['Inicio o Estadísticas', 'Preguntale a tu tienda'] },
          {
            type: 'table',
            headers: ['Ejemplo', 'De dónde saca la respuesta'],
            rows: [
              [
                '¿Cuánto vendí este mes y cómo vengo contra el anterior?',
                'Ventas y comparación con el período anterior',
              ],
              [
                '¿Cuáles son mis productos más vendidos? ¿Cuáles no se vendieron?',
                'Productos más vendidos y sin ventas',
              ],
              ['¿Cuántos carritos abandonados tuve y cuánta plata representan?', 'Carritos abandonados'],
              [
                '¿Cuánto gané de verdad? ¿Qué producto deja menos margen?',
                'Rentabilidad (pide el permiso de ver costos)',
              ],
              [
                '¿Qué se me está por agotar? ¿Qué me conviene reponer?',
                'Stock bajo y sugerencias de reposición',
              ],
              ['¿Qué compras a proveedores tengo en camino?', 'Órdenes de compra'],
              [
                '¿Cuántos clientes tengo y cuántos compraron más de una vez?',
                'Resumen de clientes (solo cantidades)',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Qué ve y qué no',
        paragraphs: [
          'Ve solo lo que tu usuario ya puede ver en el panel: si no tenés permiso para ver costos, no te va a contar la ganancia, y si no manejás compras, no te va a hablar de proveedores. Por eso a veces contesta «eso no lo puedo ver desde acá»: es mejor que no invente un número.',
          'Nunca ve datos personales de tus compradores (mails, teléfonos, direcciones, documentos ni nombres): trabaja con cantidades y totales. Y no cambia nada de la tienda: si le pedís que haga algo, te explica en qué pantalla se hace.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Revisá los números importantes en su pantalla antes de decidir algo grande. Debajo de cada respuesta ves «Datos de: …», que dice qué consultó.',
          },
        ],
      },
      {
        heading: 'La conversación',
        paragraphs: [
          'Podés seguir preguntando sobre lo anterior («¿y el mes pasado?»). La conversación vive solo en tu navegador, en esa pestaña y para esa tienda: se borra al cerrar la pestaña o con «Empezar de nuevo», y no se guarda en ningún servidor. Se manda al asistente solo lo último de la charla.',
          'Responde una pregunta a la vez. Cada pregunta gasta del tope mensual de inteligencia artificial de tu tienda: suele ser de unos pocos centavos de dólar con un modelo medio.',
        ],
      },
      {
        heading: 'Dejarlo listo',
        steps: [
          'Es de la dueña o el dueño: en Configuración → Inteligencia artificial cargá la clave de un proveedor y elegí un modelo para «Asistente de datos».',
          'Prendé la inteligencia artificial y poné un tope mensual.',
          'El botón «Preguntale a tu tienda» aparece en Inicio y Estadísticas para quienes pueden ver estadísticas. Si está gris, al pasar el mouse dice por qué.',
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
          'En el editor de diseño (Canales de venta → Tienda online → Logo de la tienda, en el bloque “Cómo aparecés en Google”) definís el título y la descripción que se muestran en los resultados de búsqueda, con una vista previa de cómo se ven en un celular. Un buen título: “Marca — qué vendés” en menos de 60 caracteres; la descripción, un gancho de hasta 160.',
          'Como todo el diseño, el título y la descripción nuevos le llegan a Google recién cuando publicás.',
          'Cada producto tiene además su propio bloque “SEO” en la ficha (Título SEO y Descripción SEO). Si lo dejás vacío, Google ve el nombre y la descripción del producto.',
        ],
        blocks: [{ type: 'path', segments: ['Canales de venta', 'Tienda online', 'Logo de la tienda'] }],
      },
      {
        heading: 'Lo que la tienda hace sola',
        paragraphs: [
          'Cada tienda genera automáticamente su sitemap (/sitemap.xml) con todo el catálogo, sus categorías y tus páginas, su robots.txt y las URLs canónicas. Los productos publican datos estructurados (precio, stock, fotos) para que Google pueda mostrarlos como resultados enriquecidos, y las páginas de producto usan la primera foto como imagen al compartir en redes.',
          'Cada página se titula “Página · Tu tienda”, las categorías tienen su propia página que Google puede encontrar, un producto o una página que no existe responde como “no encontrada” (y no como una página vacía), y lo privado —el checkout, la cuenta del cliente y sus favoritos— queda fuera de Google.',
          'Si tu inicio tiene una sección de Preguntas frecuentes, Google recibe esas preguntas y respuestas en el formato que usa para mostrarlas directo en los resultados.',
          'Con la tienda en construcción, el sitemap lista solo el inicio: el catálogo no aparece en Google hasta que abras.',
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
          'Nombres de producto descriptivos (lo que la gente busca, no códigos internos), descripciones únicas y completas, y categorías bien armadas. Cambiarle el nombre a un producto o a una categoría no cambia su dirección, así que no perdés nada. Si borrás un producto o le cambiás la URL a una página de contenido, creá una redirección en Configuración → Redirecciones para no perder el posicionamiento ganado.',
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
          'Vos cargás el identificador —una cadena corta como G-ABCD123456— y el código lo escribe Tiendafy. Si no tiene la forma que corresponde (por ejemplo, pegaste el fragmento entero), no te deja guardar y te dice qué forma espera. Cuando una herramienta tiene identificador, su tarjeta dice “Activo”.',
          'Ninguna de estas herramientas se carga en el checkout (la pantalla donde tu cliente completa sus datos y paga), ni siquiera si el visitante ya aceptó. Por eso Clarity no graba lo que pasa ahí. Tampoco en las páginas que se abren desde un link personal de un mail (activar la cuenta, cambiar la contraseña, seguir un pedido u opinar de una compra): ese link da acceso a la cuenta o a la compra de tu cliente y no tiene que llegarle a nadie más.',
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
          'Con "Pedir permiso antes de medir" encendido, la tienda muestra un aviso abajo de todo y no carga nada hasta que la persona acepte. Si dice que no, no se carga y no se le vuelve a preguntar en ese navegador. El aviso aparece solo si tenés al menos una herramienta cargada: sin nada que consentir, no molesta a nadie.',
          'Si el navegador manda la señal de "no me rastreen" (Global Privacy Control), se toma como un no sin preguntar.',
          'El interruptor “Medición encendida” corta todas las herramientas de golpe sin borrar lo que cargaste: sirve si algo se rompe o querés la tienda limpia por un rato.',
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
          'Se cuentan las visitas a cada pantalla, los pasos de la compra (producto visto, agregado al carrito, inicio de la compra) y, cuando una compra termina bien, la venta con su monto, una sola vez por pedido. Eso es lo que le permite a Google y a Meta decirte cuánto te rindió cada aviso. No se mide nada en el checkout.',
          'Si necesitás una herramienta que no está en la lista, pedila: se agrega al catálogo con su cargador escrito por nosotros. La lista es corta a propósito, no por falta de ganas.',
        ],
      },
      {
        heading: 'Verificar tu dominio en Google o Meta',
        paragraphs: [
          'Para eso no hace falta ningún código en la tienda: tanto Search Console como Meta aceptan verificar por DNS, agregando un registro TXT donde administrás el dominio. Los pasos para Google están en el artículo «Aparecer en Google (SEO)».',
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
          'Cada dirección que publicaste queda dando vueltas: en Google, en un mail, en un posteo, en el chat de alguien. Si borrás un producto, le cambiás la URL a una página de contenido o la borrás, o venís de otra plataforma con otras direcciones, el que sigue el link viejo cae en “página no encontrada”. Una redirección lo lleva directo al lugar nuevo, y Google le pasa a la dirección nueva el posicionamiento que tenía la vieja.',
          'Cambiarle el nombre a un producto o a una categoría no cambia su dirección: ahí no hace falta ninguna redirección.',
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
          'En “Dirección vieja” escribí solo la parte que va después del dominio: /remera-negra-vieja. Si pegás la dirección entera, se queda con esa parte; no importan las mayúsculas ni lo que venga después de un “?”.',
          'En “Dirección nueva” escribí a dónde tiene que ir: /productos/remera-negra. También vale una dirección completa de otro sitio (con https://).',
          'Tocá Agregar. Se guarda al instante, no hay nada más que confirmar.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Cada dirección vieja tiene una sola redirección, y no puede apuntar a sí misma. Para borrar una, tocá el tacho de su fila: esa dirección vuelve a mostrar “página no encontrada”.',
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Al visitante le llega una redirección permanente (un 308, el equivalente moderno del clásico 301). Google las trata igual: le pasa a la dirección nueva el posicionamiento de la vieja.',
          },
          {
            type: 'callout',
            tone: 'tip',
            text: 'La redirección actúa solo cuando la dirección vieja ya no existe en tu tienda. Si en esa dirección hay una página o un producto vivo, se muestra eso y la redirección no se usa.',
          },
        ],
      },
      {
        heading: 'La columna “Se usó”',
        paragraphs: [
          'Cuenta cuántas visitas salvó cada regla (con el mouse encima ves cuándo fue la última). Una que dice “Nunca” después de varias semanas se puede borrar sin drama. Una que se usa mucho es la señal de que ese link viejo sigue circulando en algún lado: si está en un posteo o un mail tuyo, conviene corregirlo también en el origen.',
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
          'Apenas creás la tienda tiene su dirección gratis: la ves en Configuración → Dominios, marcada “Siempre disponible”, con el botón “Abrir”. Ya funciona, no hace falta configurar nada, y sigue andando aunque después conectes tu dominio propio.',
        ],
        blocks: [
          { type: 'path', segments: ['Configuración', 'Dominios'] },
          {
            type: 'callout',
            tone: 'info',
            text: 'Esta pantalla es solo del dueño de la tienda: conectar o quitar un dominio no se le puede delegar a otro rol.',
          },
        ],
      },
      {
        heading: 'Configurá tu dominio propio',
        steps: [
          'Comprá tu dominio en cualquier registrador (NIC.ar para los .com.ar, o GoDaddy, Cloudflare, Donweb).',
          'En Configuración → Dominios, tocá “Conectar mi dominio” y escribilo sin https:// ni barra final.',
          'La pantalla te muestra, en “Falta un paso en tu proveedor de dominios”, el registro CNAME exacto que tenés que crear: tipo, nombre y valor. Copiá el valor tocándolo.',
          'Entrá donde administrás el DNS de tu dominio, buscá la sección de DNS y creá ese registro.',
          'Volvé a Dominios y tocá “Volver a verificar” (el botón redondo). Cuando el estado diga “Apuntando bien”, terminaste.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            title: 'Dominios .com.ar',
            text: 'NIC.ar no guarda registros: ahí solo delegás el dominio a un proveedor de DNS (por ejemplo, Cloudflare, que es gratis), y el CNAME se crea en ese proveedor. Para el dominio sin nada adelante (tumarca.com.ar) el nombre del registro es “@”; si tu proveedor no acepta un CNAME ahí, usá uno que sí, como Cloudflare.',
          },
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
        heading: 'Quitar el dominio propio',
        paragraphs: [
          'El tacho de la fila de tu dominio lo desconecta (te pide confirmar): la tienda deja de responder en él y queda solo en el subdominio gratis. Después podés conectar otro.',
        ],
      },
      {
        heading: 'Certificado de seguridad (SSL)',
        paragraphs: [
          'El candado HTTPS se emite y renueva solo, sin que hagas nada y sin costo. No se puede emitir antes de que el dominio apunte, así que hasta ese momento la columna Certificado dice “Cuando el dominio apunte”. Después de que el DNS propague puede tardar unos minutos más, hasta la primera visita.',
        ],
      },
    ],
  },
  ia: {
    title: 'Inteligencia artificial',
    intro:
      'Qué puede hacer la inteligencia artificial en el panel, qué no hace nunca y cómo dejarla lista. Vos ponés tu propia clave y tu propio tope de gasto: Tiendafy no te cobra nada por usarla.',
    category: 'Tu tienda online',
    keywords: [
      'ia',
      'chatgpt',
      'claude',
      'gemini',
      'openai',
      'anthropic',
      'groq',
      'api key',
      'clave',
      'tokens',
      'gasto',
      'presupuesto',
      'qué hace la ia',
      'funciones',
      'automático',
    ],
    sections: [
      {
        heading: 'Qué puede hacer por vos',
        paragraphs: [
          'La IA es una ayuda para tareas que hoy te llevan tiempo: contestar consultas, escribir textos, completar fichas, pasar una factura a mano y buscar un número en los reportes. En todas, te propone y vos decidís.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Qué hace', 'Dónde está', 'Qué tenés que hacer vos'],
            rows: [
              [
                'Te sugiere la respuesta a una consulta, con los datos reales de la publicación o del pedido (stock, precio, estado, envío).',
                'Botón con el destello («Sugerir con IA») en preguntas y mensajes de Mercado Libre, chat posventa y formulario de contacto',
                'Leer el borrador, corregirlo si hace falta y mandarlo vos.',
              ],
              [
                'Contesta preguntas sobre tus números: ventas, ganancia, stock, compras y clientes.',
                '«Preguntale a tu tienda», en Inicio y Estadísticas',
                'Preguntar como le preguntarías a una persona. Solo mira, no cambia nada.',
              ],
              [
                'Escribe o mejora la descripción, el texto para Google y los datos de Mercado Libre (marca, modelo, medidas…) de muchos productos a la vez.',
                'Productos → Fichas con IA',
                'Revisar cada ficha al lado de lo que tenés hoy y aprobarla. Nada cambia hasta que aprobás.',
              ],
              [
                'Lee la factura de un proveedor (PDF o foto) y te propone tipo, número, fecha, CUIT, importes y líneas.',
                'Compras e importaciones → una orden de compra → «Leer factura»',
                'Revisar lo que propone y guardarlo. Antes de mostrártelo, el sistema controla que las cuentas cierren.',
              ],
              [
                'Escribe la descripción de un producto a partir de su nombre.',
                'Ficha del producto → «Escribir con IA», debajo de Descripción',
                'Corregir el borrador antes de guardar.',
              ],
              [
                'Reescribe un post con tono vendedor, sin perder el link ni el cupón.',
                'Redes sociales → «Nuevo post» → «Mejorar con IA»',
                'Revisarlo antes de programarlo.',
              ],
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Cada función tiene su propio artículo con el detalle: buscá «Sugerir con IA», «Preguntale a tu tienda», «Fichas con IA» o «Leer la factura» en el centro de ayuda.',
          },
        ],
      },
      {
        heading: 'Lo que la IA nunca hace',
        paragraphs: [
          'No publica, no responde, no cobra ni cambia nada por su cuenta: todo lo que propone queda como borrador hasta que una persona lo revisa y lo usa.',
          'No inventa datos que no tiene. Si una respuesta necesita un número de seguimiento o un precio que no está en el sistema, no lo pone; en las fichas, los códigos y modelos salen solo de lo que ya cargaste. Si no sabe algo, te lo dice.',
          'No obedece a los compradores. Lo que escribe un comprador es siempre texto para contestar, nunca una orden: si alguien intenta darle órdenes a la IA («ignorá tus instrucciones…»), o la consulta pide o da datos de contacto, no arma borrador y te dice «Respondé a mano» con el motivo.',
          'No ve más que vos. Cada persona usa los botones de IA de las partes del panel que ya puede usar, y el asistente de datos solo consulta lo que tu usuario tiene permiso de ver.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Revisá siempre antes de usar',
            text: 'Los borradores pueden traer un aviso amarillo (un link, un dato de contacto, un monto que no coincide con el pedido, un texto demasiado largo). Es la señal de que hay algo para mirar con atención antes de mandarlo.',
          },
        ],
      },
      {
        heading: 'Qué datos le llegan al proveedor de IA',
        paragraphs: [
          'Para contestar, el proveedor que elegiste (Anthropic, OpenAI, Google o Groq) recibe solo lo necesario para esa tarea: el texto de la consulta, los datos del producto o del pedido, la factura que subiste o los totales de tus reportes.',
          'Los datos personales de tus compradores no salen: mails, teléfonos, DNI y CUIT se tapan antes de mandar la consulta, y el nombre, el usuario y la dirección del comprador no se mandan nunca. El asistente de datos trabaja con cantidades y totales, no con personas.',
        ],
      },
      {
        heading: 'Quién la configura',
        blocks: [
          { type: 'path', segments: ['Configuración', 'Inteligencia artificial'] },
          {
            type: 'callout',
            tone: 'info',
            text: 'Esta pantalla es solo del dueño de la tienda, porque la clave que cargás gasta plata de tu cuenta. El resto del equipo usa los botones de IA según los permisos que ya tiene (por ejemplo, quien carga productos ve el botón de la descripción). Si un botón de IA no aparece, es porque todavía no se configuró en tu tienda.',
          },
        ],
      },
      {
        heading: 'Dejarla lista, paso a paso',
        steps: [
          'Creá una cuenta en el proveedor que prefieras (Anthropic, OpenAI, Google o Groq), cargale saldo si te lo pide y sacá una “clave de API”. Cada proveedor tiene su consola; buscá “API keys”.',
          'En la consola del proveedor poné un límite de gasto mensual. Es tu red de seguridad de verdad.',
          'En Configuración → Inteligencia artificial, pegá la clave en la tarjeta de ese proveedor y tocá “Probar conexión”.',
          'En “Modelos por tarea” elegí un modelo para cada cosa, o tocá “Usar recomendados”. Podés sumar un modelo de respaldo, de otro proveedor si tenés, para que siga andando si el primero se cae.',
          'En “Presupuesto” poné el tope mensual en dólares y prendé el interruptor. Sin tope no te deja prenderla.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'La clave se guarda cifrada y nadie la vuelve a ver completa: solo los últimos 4 caracteres. Si la perdés o la cambiás, cargá una nueva.',
          },
        ],
      },
      {
        heading: 'El tope y el consumo',
        paragraphs: [
          'Cada mes la IA puede gastar hasta el tope que pusiste. Antes de cada pedido se calcula lo máximo que podría costar: si no entra en lo que te queda, no se hace y te avisa. Al llegar al tope se frena hasta el mes siguiente, o hasta que lo subas.',
          'En Inicio te aparece un aviso cuando te acercás al tope (el porcentaje lo elegís vos) y otro cuando lo alcanzás.',
          '“Consumo del mes” muestra lo gastado contra el tope, por día, por tarea, por modelo y por persona. Si tenés más de una tienda, podés ver el total de todas.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Son cálculos estimados con los precios que conocemos: pueden diferir un poco de lo que te cobra el proveedor. Lo que vale es la factura de él, por eso conviene también el límite en su consola.',
          },
        ],
      },
      {
        heading: 'Tengo más de una tienda',
        paragraphs: [
          '“Copiar a mis otras tiendas” te deja pasar las claves, los modelos o el presupuesto de esta tienda a las otras donde sos dueño, sin cargarlos de nuevo. Pisa lo que ya tenían: te pide confirmar antes.',
        ],
      },
      {
        heading: 'Si algo no anda',
        paragraphs: [
          'Un botón de IA que no se puede usar todavía te dice por qué al pasar el mouse. Si no tenés el permiso de esa parte del panel, directamente no lo ves. Lo más común:',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Qué dice', 'Qué hacer'],
            rows: [
              [
                '“Está apagada en esta tienda”',
                'Prendé el interruptor en Presupuesto (necesita un tope cargado).',
              ],
              [
                '“Elegí un modelo para esta tarea” o “Falta la clave de…”',
                'Elegí el modelo en Modelos por tarea y cargá la clave de su proveedor.',
              ],
              ['“Se alcanzó el tope mensual”', 'Subí el tope en Presupuesto, o esperá al mes siguiente.'],
              [
                '“La clave no es válida o no tiene saldo”',
                'Revisá la clave y el saldo en la consola del proveedor; después “Probar conexión”.',
              ],
              [
                '“El servicio no responde”',
                'Es del proveedor. Si tenés un modelo de respaldo, se usa solo; si no, probá en unos minutos.',
              ],
            ],
          },
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
