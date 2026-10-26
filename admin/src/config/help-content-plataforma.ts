import type { HelpArticle } from './helpContent';

/**
 * Guías para quien administra la plataforma, no para quien vende.
 *
 * El resto del centro de ayuda está escrito para el comerciante: qué botón
 * tocar y qué esperar. Acá vive todo lo otro — infraestructura, claves del
 * servidor, altas comerciales, certificaciones — que antes estaba repartido
 * como secciones sueltas dentro de los manuales de cada función.
 *
 * El ORDEN de los artículos es el recorrido real: entender cómo está armado,
 * levantarlo en tu máquina, conseguir las claves, instalarlo en el servidor,
 * los trámites lentos, la verificación final y el mantenimiento. Se lee de
 * arriba hacia abajo la primera vez, y después se entra por el que haga falta.
 *
 * Están escritos para alguien técnico, pero sin dar por sabido nada: cada cosa
 * dice también qué es y por qué existe, porque el que los va a leer en la
 * urgencia puede no ser el que los leyó la primera vez.
 */
export const PLATAFORMA = {
  plataformaPuestaEnMarcha: {
    title: 'Cómo está armado y en qué orden se levanta',
    intro:
      'El mapa antes del viaje: qué piezas hay, dónde corre cada una, y en qué orden conviene armarlas para que ninguna falle por culpa de otra.',
    category: 'Administrar la plataforma',
    sections: [
      {
        heading: 'Las piezas',
        paragraphs: [
          'Tiendafy no es un programa sino seis piezas que se hablan entre sí. Saber cuál es cuál es lo que después permite entender por qué algo no anda.',
        ],
        blocks: [
          {
            type: 'terms',
            items: [
              {
                term: 'La API',
                def: 'El cerebro. Guarda los productos, cobra, factura, manda los emails. No tiene pantallas: le hablan las otras piezas. Si se cae, se cae todo.',
              },
              {
                term: 'Las tiendas',
                def: 'Lo que ve el comprador. Una sola aplicación sirve a todas las tiendas: resuelve cuál mostrar según el dominio con el que entraron.',
              },
              {
                term: 'El panel',
                def: 'Esto que estás usando. Es una aplicación que corre entera en el navegador y le pide todo a la API.',
              },
              {
                term: 'La base de datos',
                def: 'PostgreSQL. Todo lo que se escribe vive acá, con una columna que dice de qué tienda es cada fila. Es lo que más duele perder.',
              },
              {
                term: 'El almacenamiento',
                def: 'Las fotos y los videos NO van a la base ni al disco del servidor: van a un servicio aparte (Cloudflare R2) con su propio dominio.',
              },
              {
                term: 'El borde',
                def: 'Un proxy (Caddy) que atiende todo lo que llega de internet, resuelve los certificados de seguridad y reparte cada visita a la pieza que corresponde según el dominio. Es uno solo para todo el servidor: también atiende a los otros sistemas que corran en la misma máquina.',
              },
            ],
          },
        ],
      },
      {
        heading: 'Tres lugares donde corre lo mismo',
        paragraphs: [
          'El mismo software corre en tres lados, y la diferencia entre ellos es a qué servicios apunta, no cómo está hecho.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Dónde', 'Para qué', 'Qué pasa si se rompe'],
            rows: [
              ['Tu máquina', 'Escribir y probar código', 'Nada: es tuya'],
              [
                'Staging (stg.tudominio)',
                'Probar como si fuera real, antes de publicar',
                'Nada: los datos son de mentira y el dinero no existe',
              ],
              ['Producción (tudominio)', 'Vender', 'Los clientes lo ven'],
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Staging y producción corren exactamente las mismas imágenes, y tu máquina el mismo código. Lo único que cambia es el archivo de configuración: qué base de datos usan, a qué bucket de imágenes escriben y si las credenciales de cobro son reales o de prueba. Esa configuración entra al arrancar, nunca al compilar: la tienda la lee de sus variables PUBLIC_* y el panel reescribe su config.js cada vez que arranca su contenedor.',
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Producción está abierta al público desde el 13 de octubre de 2026, con el borde (Caddy) delante. Hoy el servidor corre solo producción: staging quedó pospuesto para no quedarse sin memoria. Todo está preparado para prenderlo cuando haga falta: completar su archivo de variables y sumar su sitio en el borde.',
          },
        ],
      },
      {
        heading: 'La regla que ordena todo: dos niveles de credenciales',
        paragraphs: [
          'Cada credencial de Tiendafy es de uno de dos tipos, y confundirlos es la causa número uno de "lo configuré y no anda".',
          'Las de PLATAFORMA son de Tiendafy como producto: se cargan una sola vez, viven en el archivo de variables del servidor y se aplican al volver a levantar la API (con un deploy). Las de TIENDA son de cada comercio: se cargan desde el panel, se guardan cifradas y no tocan el servidor.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Si un botón de “conectar” avisa que falta configuración, falta el nivel plataforma. Si una integración te pide usuario y contraseña dentro del panel, es de nivel tienda y no hay nada que tocar en el servidor.',
          },
        ],
      },
      {
        heading: 'El orden en que conviene hacerlo',
        paragraphs: [
          'Cada paso habilita al siguiente. Saltear uno hace que el que viene falle por un motivo que no parece relacionado.',
        ],
        steps: [
          'Levantarlo en tu máquina. Es gratis, no necesita contratar nada y es donde se aprende cómo encaja todo.',
          'Conseguir las claves de plataforma mínimas: almacenamiento de imágenes y Resend. Sin emails no se puede ni invitar a alguien al equipo.',
          'Contratar el servidor y apuntar el DNS: el dominio base, el comodín de las tiendas, la API y el panel — y lo mismo para staging.',
          'Instalar el borde y el ambiente de producción en el servidor (y staging, si lo vas a usar), y publicar una primera versión.',
          'Registrar la app de Mercado Pago: es lo que hace existir el botón de “conectar tu cuenta” en cada tienda.',
          'Crear la primera tienda y su dueño.',
          'Desde el panel de esa tienda: conectar el cobro, configurar envíos y cargar el certificado de facturación.',
          'Recién ahí, publicar en producción y abrir al público.',
          'Las opcionales, cuando hagan falta: Mercado Libre, redes sociales, IA, Meta Ads.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Si falta…', 'Qué deja de andar'],
            rows: [
              ['Base de datos', 'Todo'],
              ['Almacenamiento de imágenes', 'Subir fotos. En el servidor, la API directamente no arranca'],
              ['Resend', 'Todos los emails: invitaciones, confirmación de compra, campañas'],
              ['URL pública de la API', 'Webhooks de pago, links de baja y tracking de campañas'],
              ['App de Mercado Pago', 'El botón de conectar cobros, en todas las tiendas'],
              ['DNS comodín', 'Los subdominios de las tiendas nuevas'],
              [
                'Volumen de claves de cifrado',
                'Cada tienda tiene que reconectar TODAS sus integraciones, y los teléfonos y direcciones de los clientes dejan de poder leerse',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Qué necesita cada integración',
        paragraphs: [
          'Seis de las integraciones no piden NADA a nivel plataforma: las credenciales son del comercio y se cargan desde el panel. Lo que sí necesitan es que alguien haga el alta con el proveedor.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Integración', 'Nivel plataforma (una vez)', 'Nivel tienda (cada una)'],
            rows: [
              ['Mercado Pago', 'App marketplace + webhook', 'Conectar la cuenta (un click)'],
              ['Mercado Libre', 'App de desarrolladores + webhook', 'Conectar la cuenta (un click)'],
              ['Payway', '— nada', 'Site ID y las dos claves'],
              ['Correo Argentino', '— nada', 'Credenciales de MiCorreo'],
              ['Zipnova', '— nada', 'API Token y Secret'],
              ['Andreani', '— nada', 'Usuario, contraseña y contratos'],
              ['ARCA (facturación)', '— nada', 'Certificado, CUIT y punto de venta'],
              ['WhatsApp', '— nada', 'App propia de Meta con su número'],
              ['Redes sociales', 'Apps de Meta y X (Telegram no pide nada)', 'Conectar cada cuenta'],
              ['Meta Ads', 'App de Meta (puede ser la misma de redes)', 'Conectar la cuenta publicitaria'],
              ['Emails', 'Cuenta de Resend con dominio verificado', '— nada'],
            ],
          },
        ],
      },
      {
        heading: 'Antes de abrir una tienda al público',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Cobros, envíos, facturación, imágenes y emails verificados con el artículo «Checklist antes de cobrar y despachar de verdad»',
              'La tienda abre en su dirección definitiva, con el candado de seguridad',
              'Un segundo dueño cargado en Configuración → Usuarios',
              'Razón social, CUIT y domicilio cargados en Configuración → Datos legales',
              'Datos de contacto, términos y política de devoluciones publicados',
            ],
          },
          {
            type: 'callout',
            tone: 'warning',
            text: 'Lo del segundo dueño no es burocracia: si la única cuenta con control total pierde el acceso, no hay forma de administrar la tienda desde el panel.',
          },
        ],
      },
    ],
  },

  plataformaDesarrollo: {
    title: 'Levantar el proyecto en tu máquina',
    intro:
      'De un repositorio recién clonado a una tienda funcionando en tu computadora, sin contratar ni configurar nada.',
    category: 'Administrar la plataforma',
    sections: [
      {
        heading: 'Qué instalar antes',
        paragraphs: [
          'Tres cosas. El resto lo maneja el proyecto solo, incluida la base de datos y el almacenamiento de imágenes, que corren en contenedores y se descartan cuando querés.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Qué', 'Para qué', 'Cómo saber si está'],
            rows: [
              [
                'Docker Desktop',
                'Corre la base de datos y el almacenamiento sin instalarlos en tu máquina',
                'docker info responde',
              ],
              ['SDK de .NET 10', 'Compila y corre la API', 'dotnet --version'],
              [
                'Node 26',
                'Corre el panel y las tiendas. pnpm 12, el instalador de paquetes, lo instala el setup si falta (la versión exacta la fija package.json)',
                'node --version',
              ],
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'El paso a paso completo, con las opciones de cada script y los problemas comunes, está en la guía docs/primeros-pasos.md del repositorio. Acá va lo indispensable.',
          },
        ],
      },
      {
        heading: 'La primera vez',
        paragraphs: [
          'Un solo comando deja todo listo: verifica que estén las herramientas, levanta la infraestructura (Postgres 18, MinIO y pgAdmin), instala las dependencias, compila la API y corre sus tests. Si algo falta, avisa cuál.',
        ],
        steps: [
          'Clonar el repositorio y entrar a la carpeta.',
          'Correr setup.ps1 en Windows, o setup.sh en Linux y Mac (con -SkipTests, o --skip-tests, saltea los tests).',
          'Esperar. La primera vez baja bastante: contenedores, paquetes de .NET y de Node.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'No hay que crear ningún archivo de configuración. Todo cae a valores de desarrollo: la base de datos y el almacenamiento del contenedor, y las integraciones apagadas hasta que se carguen credenciales.',
          },
          {
            type: 'callout',
            tone: 'warning',
            text: 'Si la API ya estaba corriendo, el setup la frena para poder compilar. Después la levantás de nuevo con dev-up.ps1.',
          },
        ],
      },
      {
        heading: 'El día a día',
        paragraphs: [
          'Un comando levanta todo en orden y espera a que cada pieza responda antes de seguir con la siguiente. Es idempotente: si algo ya estaba arriba, no lo rompe.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Comando', 'Qué hace'],
            rows: [
              ['dev-up.ps1', 'Levanta todo: infraestructura, API, panel y tiendas'],
              [
                'dev-up.ps1 -BackendOnly',
                'Solo infraestructura y API. Útil si vas a trabajar con la API sola',
              ],
              [
                'dev-up.ps1 -StorefrontPort 3001',
                'Corre las tiendas en otro puerto, cuando otra app ya usa el 3000',
              ],
              [
                'dev-up.ps1 -Docker',
                'Corre TODO en contenedores, como en el servidor. Sin recarga automática, y el panel queda en localhost:3001',
              ],
              [
                'dev-up.ps1 -Tunnel',
                'Expone la API a internet con una dirección temporal, para probar webhooks de Mercado Pago',
              ],
              ['dev-down.ps1', 'Apaga todo (con -KeepInfra deja arriba la base y el almacenamiento)'],
              [
                'pnpm verify',
                'Lo mismo que corre CI salvo el e2e, en fases que no agotan la memoria. Con --front, solo panel, tiendas y paquetes compartidos; con --back, solo la API',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Dónde queda cada pieza',
        blocks: [
          {
            type: 'table',
            headers: ['Pieza', 'Dirección', 'Notas'],
            rows: [
              ['API', 'localhost:5080', '/health dice si está viva; /version, qué versión corre'],
              ['Documentación de la API', 'localhost:5080/scalar', 'Todas las rutas, navegables y probables'],
              ['Panel', 'localhost:5173', 'Puerto fijo a propósito, para no chocar con las tiendas'],
              [
                'Tiendas',
                'subdominio.localhost:3000',
                'Cada tienda en su subdominio, sin tocar archivos del sistema',
              ],
              [
                'Base de datos',
                'localhost:5432',
                'Postgres 18 en el contenedor tiendafy-postgres. Usuario, clave y base: tiendafy',
              ],
              [
                'Almacenamiento',
                'localhost:9000 · consola en 9001',
                'MinIO: hace de Cloudflare R2 sin pagar nada',
              ],
              ['pgAdmin', 'localhost:8081', 'Para mirar la base por dentro (ver más abajo)'],
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Los subdominios terminados en .localhost resuelven solos en cualquier navegador moderno. No hay que editar el archivo hosts para ver una tienda.',
          },
        ],
      },
      {
        heading: 'Entrar y tener con qué probar',
        paragraphs: [
          'El sistema arranca vacío pero no desnudo: al levantar en modo desarrollo se siembran una cuenta del panel por rol (dueño, administrador, vendedor…) con acceso a todas las tiendas, y dos compradores de prueba en cada una. Las credenciales están en docs/usuarios-de-prueba.md del repositorio.',
          'Para que el panel tenga algo que mostrar —ventas, clientes, estadísticas, campañas— hay un cargador de datos de demostración que llena todo de una vez. Es idempotente y solo existe en desarrollo.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Los datos de demostración se cargan con una llamada POST a /api/v1/dev/demo-seed, con la sesión del dueño e indicando la tienda. Agregando ?reset=true borra lo que había sembrado la demostración (el catálogo y el stock no) y la vuelve a armar. Fuera de desarrollo esa ruta no existe.',
          },
        ],
      },
      {
        heading: 'Mirar la base de datos por dentro',
        paragraphs: [
          'El entorno trae pgAdmin: se levanta junto con el resto del proyecto y queda en localhost:8081. Entra directo, sin pantalla de login, y con la base ya conectada — no hay nada que configurar ni contraseñas que recordar.',
          'Antes de abrirlo conviene saber una cosa, o el mapa se lee mal: de algo más de cien tablas, solo un puñado tiene clave foránea declarada. No es un olvido. Cada módulo es dueño de sus tablas y referencia a los demás por id, sin clave foránea, para que uno se pueda cambiar o migrar sin arrastrar al resto. Las relaciones existen, pero las hace cumplir el código.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Qué hay en la base', 'Cuántos'],
            rows: [
              ['Tablas', 'Algo más de cien, repartidas entre una veintena de módulos'],
              [
                'Claves foráneas declaradas',
                'Unas veinte, todas de un padre con sus hijos dentro de un mismo módulo',
              ],
              ['Referencias entre módulos', 'Por id, sin clave foránea'],
              ['Triggers, vistas y funciones almacenadas', 'Ninguno'],
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Que no haya triggers ni funciones almacenadas es una decisión: nada pasa “por atrás” cuando se toca una fila. Para entender qué ocurre alcanza con seguir el código, sin buscar comportamiento escondido en la base.',
          },
          {
            type: 'callout',
            tone: 'warning',
            text: 'La herramienta de diagramas de pgAdmin dibuja SOLO las claves foráneas declaradas, así que va a mostrar las tablas casi sueltas. Sirve para navegar datos y escribir consultas; para entender cómo se relacionan los módulos hay que mirar docs/arquitectura.md del repositorio.',
          },
          {
            type: 'callout',
            tone: 'danger',
            text: 'Todas las tablas de datos llevan una columna que indica de qué tienda es cada fila, y el filtro lo aplica la aplicación, no la base. Cualquier consulta escrita a mano ve TODAS las tiendas: al mirar datos, filtrar siempre por esa columna.',
          },
        ],
      },
      {
        heading: 'Convivir con otro proyecto en la misma máquina',
        paragraphs: [
          'El panel tiene el puerto fijo, así que nunca choca. Las tiendas usan el 3000 y ese sí lo pelean con casi cualquier otro proyecto web: levantalas con dev-up.ps1 -StorefrontPort y un puerto libre, y el script le avisa solo al panel dónde quedaron (escribe VITE_STOREFRONT_ORIGIN en admin/.env.local). Si las levantás a mano, sin el script, ese valor lo cambiás vos; si no, “Ver mi tienda” y la vista previa del editor apuntan a la otra aplicación.',
        ],
      },
      {
        heading: 'Cuando algo no arranca',
        blocks: [
          {
            type: 'table',
            headers: ['Síntoma', 'Causa más probable'],
            rows: [
              [
                'El script se queda esperando la infraestructura',
                'Docker Desktop está apagado o todavía iniciando',
              ],
              [
                'La API no levanta',
                'Otra instancia quedó corriendo y tiene tomados los archivos. Cerrarla y reintentar',
              ],
              [
                'El panel dice que la sesión venció',
                'Pasaron más de 12 horas sin usarlo, o la API perdió sus claves (pasa al recrear los contenedores con -Docker). Volver a entrar',
              ],
              ['Las tiendas abren pero sin fotos', 'El contenedor de almacenamiento no levantó'],
              [
                '“Ver mi tienda” lleva a una página que no es',
                'Las tiendas están en otro puerto del que cree el panel',
              ],
            ],
          },
        ],
      },
    ],
  },

  plataformaClaves: {
    title: 'Qué conseguir y dónde se carga cada cosa',
    intro:
      'El inventario completo: cada credencial que usa el sistema, dónde se saca, dónde se carga y qué deja de funcionar si falta.',
    category: 'Administrar la plataforma',
    sections: [
      {
        heading: 'Cómo leer esta guía',
        paragraphs: [
          'La columna “Dónde se carga” es la que importa. “Servidor” significa el archivo de variables del ambiente (infra/docker/.env.prod en producción) y un deploy para que la API lo tome. “Panel” significa que lo carga el dueño de la tienda desde Configuración, sin ayuda técnica.',
          'Los nombres exactos de cada variable viven en docs/configuracion.md del repositorio, que se actualiza junto con el código. Acá va el qué y el porqué.',
        ],
      },
      {
        heading: 'Imprescindibles',
        paragraphs: ['Sin esto el sistema no arranca, o arranca a medias.'],
        blocks: [
          {
            type: 'table',
            headers: ['Qué', 'Dónde se consigue', 'Dónde se carga', 'Si falta'],
            rows: [
              ['PostgreSQL', 'Tu servidor', 'Servidor', 'No arranca nada'],
              [
                'Almacenamiento de imágenes (Cloudflare R2, S3 o MinIO propio)',
                'dash.cloudflare.com → R2',
                'Servidor',
                'No se pueden subir fotos, y en el servidor la API se niega a arrancar',
              ],
              [
                'Resend: API key',
                'resend.com',
                'Servidor',
                'Los emails se escriben en el log en vez de enviarse',
              ],
              [
                'Resend: dominio verificado',
                'resend.com → Domains (SPF y DKIM en tu DNS)',
                'Tu DNS',
                'Los emails van a spam o los rechazan',
              ],
              [
                'URL pública de la API',
                'Es tu propio dominio',
                'Servidor: se arma sola con el dominio del ambiente. En tu máquina hace falta el túnel',
                'Webhooks de pago, links de baja y tracking rotos',
              ],
              [
                'Token de DNS de Cloudflare',
                'dash.cloudflare.com → API Tokens',
                'Servidor (el borde)',
                'No se emiten los certificados comodín de las tiendas',
              ],
              [
                'Mercado Pago: app marketplace',
                'mercadopago.com.ar/developers',
                'Servidor',
                'Ninguna tienda puede conectar cobros',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Las fotos de las tiendas: dónde viven',
        paragraphs: [
          'Las imágenes no se guardan en el servidor de la aplicación sino en un almacenamiento aparte compatible con S3. Cambiar de proveedor es cambiar las variables de imágenes del ambiente: el sistema habla el mismo idioma con todos.',
          'La recomendación es Cloudflare R2 por una razón concreta: no cobra el tráfico de bajada. Las fotos de una tienda se leen miles de veces por cada vez que se suben, así que ese es el único costo que crecería con las ventas. Además saca del servidor el disco y el ancho de banda de las imágenes, que es lo que primero lo satura.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Opción', 'Costo mensual aproximado', 'Cuándo conviene'],
            rows: [
              [
                'Cloudflare R2',
                'Gratis hasta 10 GB, después centavos por GB. Bajada gratis',
                'Por defecto: barato, con CDN incluido y sin sorpresas de tráfico',
              ],
              [
                'MinIO en el propio servidor',
                'Nada extra, pero consume disco y ancho de banda del servidor',
                'Si no se quiere ninguna dependencia externa. Los backups quedan a cargo de uno',
              ],
              [
                'Amazon S3',
                'Storage barato, pero la bajada se cobra por GB',
                'Si ya se usa AWS para todo lo demás',
              ],
            ],
          },
          {
            type: 'checklist',
            items: [
              'Crear cuatro buckets: imágenes y adjuntos privados, para producción y para staging',
              'Atar un dominio propio (por ejemplo img.tudominio.com) SOLO a los de imágenes: eso es lo que los hace públicos y les pone el CDN adelante',
              'No conectarle dominio a los privados: los adjuntos del chat se sirven con enlaces firmados que vencen',
              'Crear una credencial limitada a esos buckets, no una de la cuenta entera',
              'Completar las variables de imágenes (las que empiezan con MEDIA_) en el archivo de cada ambiente',
              'Subir un logo desde el editor de diseño y confirmar que la dirección de la imagen es la del dominio propio',
            ],
          },
          {
            type: 'callout',
            tone: 'warning',
            text: 'La dirección de cada imagen queda guardada en la base tal como se subió. Mudarse de proveedor más adelante no es solo copiar los archivos: hay que mantener vivo el dominio viejo o reescribir las direcciones. Por eso conviene que el dominio de las imágenes sea propio desde el primer día.',
          },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Las subidas pasan siempre por la API, que valida el contenido real del archivo y limpia los SVG. Por eso no hay que abrir permisos de escritura al navegador ni configurar CORS en el bucket.',
          },
        ],
      },
      {
        heading: 'Recomendables',
        blocks: [
          {
            type: 'table',
            headers: ['Qué', 'Dónde se consigue', 'Dónde se carga', 'Para qué'],
            rows: [
              [
                'Resend: webhook de rebotes',
                'resend.com → Webhooks',
                'Servidor',
                'Sacar solos de las campañas los emails que rebotan',
              ],
              [
                'Cloudflare Turnstile',
                'dash.cloudflare.com',
                'Servidor',
                'Frenar bots en los formularios públicos',
              ],
              [
                'Sentry: un DSN por aplicación (API, tienda y panel)',
                'sentry.io',
                'Servidor',
                'Enterarse de los errores antes que el cliente. Los secretos de las direcciones se tapan antes de mandar nada',
              ],
              [
                'Secreto de actualización de la tienda',
                'Lo inventás vos: un valor largo y al azar',
                'Servidor',
                'Que un diseño publicado o un cambio de catálogo se vea en la tienda al toque, en vez de 30 a 60 segundos después',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Opcionales, según qué se use',
        blocks: [
          {
            type: 'table',
            headers: ['Qué', 'Dónde se consigue', 'Dónde se carga', 'Habilita'],
            rows: [
              [
                'Mercado Libre: app',
                'developers.mercadolibre.com.ar',
                'Servidor',
                'El canal de Mercado Libre',
              ],
              ['Meta: app', 'developers.facebook.com', 'Servidor', 'Publicar en Facebook e Instagram'],
              ['X: app', 'developer.x.com', 'Servidor', 'Publicar en X'],
              [
                'Meta Ads',
                'developers.facebook.com (puede ser la misma app de redes)',
                'Servidor',
                'El gasto real de la publicidad en Rentabilidad',
              ],
              [
                'Google OAuth',
                'console.cloud.google.com',
                'Servidor',
                'Que los compradores entren con Google',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Lo que carga cada comercio desde el panel',
        paragraphs: ['Nada de esto pasa por el servidor. Se guarda cifrado y cada tienda ve solo lo suyo.'],
        blocks: [
          {
            type: 'table',
            headers: ['Qué', 'Dónde se consigue', 'Dónde se carga en el panel'],
            rows: [
              ['Mercado Pago del comercio', 'Su propia cuenta (un click)', 'Configuración → Medios de pago'],
              ['Payway', 'Ejecutivo comercial de Payway', 'Configuración → Medios de pago'],
              [
                'Mercado Libre del comercio',
                'Su cuenta de vendedor (un click)',
                'Configuración → Mercado Libre',
              ],
              ['Correo Argentino', 'Cuenta de MiCorreo', 'Configuración → Medios de envío'],
              ['Zipnova', 'Panel de Zipnova → Integraciones', 'Configuración → Medios de envío'],
              ['Andreani', 'Ejecutivo comercial de Andreani', 'Configuración → Medios de envío'],
              ['Certificado de ARCA', 'ARCA con clave fiscal', 'Configuración → Facturación'],
              ['WhatsApp', 'App propia en Meta', 'Configuración → WhatsApp automático'],
              ['Facebook, Instagram y X', 'Su propia cuenta (un click)', 'Redes sociales → Cuentas'],
              ['Telegram', 'Bot creado con @BotFather', 'Redes sociales → Cuentas'],
              ['Meta Ads', 'Su cuenta publicitaria (un click)', 'Estadísticas → Rentabilidad'],
              [
                'Claves de IA',
                'Consola de Anthropic, OpenAI, Google o Groq',
                'Configuración → Inteligencia artificial',
              ],
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'WhatsApp es la excepción entre las de Meta: no usa app de plataforma. Cada comercio arma la suya, con su propio número.',
          },
        ],
      },
      {
        heading: 'Reglas sobre los secretos',
        blocks: [
          {
            type: 'callout',
            tone: 'danger',
            text: 'Los secretos de plataforma (client secrets, webhook secrets, claves de API) van en los archivos de variables del servidor, con permisos de lectura solo para su dueño. Nunca en el panel, nunca en el navegador, nunca en el repositorio.',
          },
          {
            type: 'callout',
            tone: 'warning',
            title: 'Lo que más duele perder',
            text: 'Todos los secretos de cada tienda —certificados de ARCA, tokens de Mercado Pago y Mercado Libre, WhatsApp, MiCorreo, Zipnova, Payway, Andreani, claves de IA— y los teléfonos y direcciones de los clientes están cifrados con las claves del volumen dpkeys del servidor. Si ese volumen se pierde, CADA tienda tiene que reconectar todo de cero y esos datos de los clientes no se recuperan. El backup diario lo copia junto con la base: verificá que esos archivos se estén generando.',
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Producción y staging tienen credenciales distintas de punta a punta: otra base, otro bucket, otras claves de cobro. Compartir una sola es lo que termina en un cobro de prueba contra una cuenta real, o en un borrado de prueba que se lleva una foto de verdad.',
          },
        ],
      },
    ],
  },

  plataformaDeploy: {
    title: 'Instalar y desplegar en el servidor',
    intro:
      'De un servidor recién contratado a dos ambientes andando, y cómo se publica cada versión nueva sin apagar nada.',
    category: 'Administrar la plataforma',
    sections: [
      {
        heading: 'Qué servidor hace falta',
        paragraphs: [
          'Un servidor virtual con Linux alcanza. Lo que define el tamaño no es la cantidad de visitas sino que ahí adentro conviven dos ambientes completos.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Recurso', 'Mínimo', 'Por qué'],
            rows: [
              [
                'Memoria',
                '8 GB',
                'Los techos de memoria de producción suman unos 3 GB y los de staging unos 2. Con 4 GB se puede, teniendo staging apagado',
              ],
              [
                'Disco',
                '80 GB',
                'Base de datos, backups y las imágenes de los contenedores. Las fotos no ocupan acá',
              ],
              ['Procesador', '2 núcleos', 'Suficiente: el trabajo pesado son consultas, no cálculo'],
              ['Sistema', 'Ubuntu o Debian actual', 'Cualquiera con Docker sirve'],
            ],
          },
        ],
      },
      {
        heading: 'Preparar el servidor',
        steps: [
          'Crear un usuario propio para desplegar y agregarlo al grupo de Docker. Trabajar como administrador total es innecesario y se paga caro el día que un comando sale mal.',
          'Instalar Docker con su complemento de compose.',
          'Dejar abiertos solo los puertos 80 y 443 hacia internet, más el de SSH. La base de datos NO se expone: las piezas se hablan por una red interna.',
          'Clonar el repositorio en una carpeta del usuario de deploy (por ejemplo /srv/tiendafy).',
          'Solo si vas a usar la publicación automática: generar una clave SSH para que GitHub entre solo, y cargar la parte pública en el servidor.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'Si el servidor ya corre otra aplicación con su propio proxy (nginx, Apache), los dos van a pelear por los puertos 80 y 443 y el segundo no arranca. El borde de Tiendafy queda de frente y el otro pasa a escuchar en un puerto interno, detrás. La guía paso a paso, con vuelta atrás, está en docs/publicar-en-la-vps.md del repositorio.',
          },
        ],
      },
      {
        heading: 'El DNS',
        paragraphs: [
          'Se configura una sola vez, y son ocho registros: cuatro para producción y cuatro para staging. Todos apuntan a la misma dirección del servidor; lo que los distingue es el nombre con el que llega la visita.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Registro', 'Nombre', 'Para qué'],
            rows: [
              [
                'A',
                'TUDOMINIO',
                'La tienda principal (la que se elige en el archivo de variables). Sin elegir ninguna, contesta “tienda no encontrada”',
              ],
              ['A (comodín)', '*.TUDOMINIO', 'Los subdominios de todas las tiendas'],
              ['A', 'api.TUDOMINIO', 'La API: webhooks, OAuth, emails'],
              ['A', 'admin.TUDOMINIO', 'El panel'],
              ['A', 'stg.TUDOMINIO', 'Lo mismo, del lado de staging'],
              ['A (comodín)', '*.stg.TUDOMINIO', 'Las tiendas de staging'],
              ['A', 'api.stg.TUDOMINIO', 'La API de staging'],
              ['A', 'admin.stg.TUDOMINIO', 'El panel de staging'],
              ['CNAME', 'dominio del comercio', 'Lo crea el dueño del dominio, en su proveedor'],
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Los certificados de seguridad se emiten y renuevan solos. Los de la plataforma salen por validación de DNS con el token de Cloudflare, de una sola vez para todos los subdominios. Los de los dominios propios de cada comercio se emiten la primera vez que alguien los visita, después de preguntarle a la API si ese dominio es de una tienda de verdad.',
          },
        ],
      },
      {
        heading: 'Cómo queda organizado',
        paragraphs: [
          'Tres grupos de contenedores. El borde es el único que da a internet; los otros dos son ambientes completos e independientes que solo se comunican con él.',
        ],
        blocks: [
          {
            type: 'terms',
            items: [
              {
                term: 'Borde',
                def: 'Un solo Caddy para todo el servidor, con los puertos 80 y 443. Reparte por dominio: lo que llega a tudominio va a producción, lo que llega a stg.tudominio va a staging, y lo de otros sistemas de la máquina, a cada uno. Las aplicaciones solo escuchan adentro del servidor.',
              },
              {
                term: 'Producción',
                def: 'Su base de datos, su copia de seguridad diaria (y, si se prende, la copia fuera del servidor), la API, las tiendas y el panel.',
              },
              {
                term: 'Staging',
                def: 'Lo mismo, con otra base, otras credenciales y sin backup: sus datos son descartables por definición.',
              },
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Los dos ambientes usan el MISMO archivo de definición. Lo único distinto es el archivo de variables. Si staging se definiera aparte, se iría pareciendo cada vez menos a producción y dejaría de servir para probar.',
          },
        ],
      },
      {
        heading: 'Los tres archivos de variables',
        paragraphs: [
          'Se copian de sus plantillas de ejemplo, se completan y se les deja permiso de lectura solo a su dueño. Nunca se suben al repositorio.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Archivo', 'Qué configura'],
            rows: [
              [
                'infra/edge/.env',
                'El borde del servidor: el dominio, el mail de los certificados y el token de DNS de Cloudflare',
              ],
              [
                'infra/docker/.env.prod',
                'El ambiente de producción: dominio, base, imágenes, cobros, emails y la versión que corre',
              ],
              [
                'infra/docker/.env.staging',
                'El de staging: lo mismo, con credenciales de prueba, otros puertos y sin backup',
              ],
            ],
          },
          {
            type: 'callout',
            tone: 'danger',
            text: 'La API se niega a arrancar si detecta que quedaron valores de desarrollo en el almacenamiento de imágenes. Es a propósito: sin eso, las subidas responderían que salió todo bien y las fotos se perderían, y se descubriría cuando un cliente ve la tienda rota.',
          },
        ],
      },
      {
        heading: 'La primera puesta en marcha',
        steps: [
          'Copiar las plantillas de variables (las de .example), completarlas y dejarlas legibles solo para su dueño.',
          'Levantar el borde. Queda andando y no se toca en cada publicación.',
          'Si vas a usar staging: publicarlo, comprobar que responden la API, una tienda y el panel, y recorrer una tienda de prueba entera, incluido un cobro con credenciales de prueba.',
          'Publicar producción con la versión elegida y comprobar en api.tudominio/version que corre la que esperabas.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Los comandos exactos están en docs/despliegue.md del repositorio, y el paso a paso para un servidor que ya tiene otros sistemas, en docs/publicar-en-la-vps.md. Los dos se actualizan junto con el código; acá va el orden y el porqué, que es lo que no cambia.',
          },
        ],
      },
      {
        heading: 'Publicar una versión nueva',
        paragraphs: [
          'Cada cambio que entra a la rama principal se construye UNA vez: las pruebas corren y las imágenes quedan guardadas, marcadas con el identificador de ese cambio (sha-a1b2c3d). Publicar es elegir una de esas versiones; nunca se vuelve a construir.',
          'Eso es lo que hace que probar sirva. Si cada ambiente recompilara, lo que sale no serían los mismos archivos que se revisaron, y la prueba pasaría a ser una aproximación.',
          'Hoy la publicación se hace a mano, en el servidor: un git pull en /srv/tiendafy (el script usa el compose y los scripts del repositorio) y después ./infra/deploy.sh prod sha-XXXXXXX. En producción la versión es obligatoria y no puede ser “latest”, que es lo último de la rama y no deja saber a qué volver.',
          'Un cambio en el archivo de variables se aplica igual: volviendo a correr el deploy con la versión que ya está corriendo.',
        ],
        steps: [
          'Si el compose pide otra versión mayor de Postgres que la que corre, se frena y pide primero ./infra/pg-upgrade.sh (ver «Mantener la plataforma andando»).',
          'Trae las imágenes de esa versión (solo las de la aplicación: la base no se actualiza en un deploy).',
          'Hace una copia de la base, justo antes de tocarla.',
          'Corre las migraciones de la base con la versión nueva.',
          'Recambia los contenedores.',
          'Espera a que respondan la API, la tienda y el panel. Si alguno no responde, avisa y muestra el comando para volver a lo que corría antes.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'Las migraciones de la base corren ANTES del recambio, con la versión nueva, y nunca al arrancar la API. Al revés, la aplicación nueva arranca contra una base vieja y falla en el peor momento.',
          },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Al terminar, abrí api.tudominio/version: dice qué versión está corriendo. Es la forma más rápida de confirmar que salió lo que querías.',
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'También se puede automatizar: con las variables del repositorio cargadas (ver más abajo), cada cambio se publica solo en staging y producción espera una aprobación humana. Hoy está apagado.',
          },
        ],
      },
      {
        heading: 'Volver atrás',
        paragraphs: [
          'Publicar la versión anterior con el mismo comando: el script la imprime al terminar cada deploy, y también cuando algo falla. Las imágenes viejas se guardan, así que es cuestión de minutos y no requiere reconstruir nada.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'danger',
            text: 'Volver atrás devuelve el código, no los datos. Si la versión que falló borró o transformó información, eso no se deshace desplegando la anterior: para eso está la copia que el deploy hizo de la base justo antes de migrar (queda junto a los backups, con “predeploy” en el nombre). Por eso conviene que los cambios que tocan datos pasen antes por staging con una copia realista.',
          },
        ],
      },
      {
        heading: 'Refrescar staging con datos reales',
        paragraphs: [
          'Staging arranca vacío, y eso alcanza para la mayoría de las pruebas. Cuando hace falta realismo —una migración pesada, un informe con volumen— se puede traer una copia de producción con ./infra/refresh-staging.sh, que toma el último backup.',
          'La copia NO se usa tal cual: pasa por un proceso que reemplaza los datos de contacto por direcciones inventadas y borra las credenciales de cobro y facturación. Si algo queda sin anonimizar, el proceso se detiene y no levanta staging.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'danger',
            text: 'Restaurar producción en staging sin anonimizar es la forma más común de mandarle un email a un cliente real desde un ambiente de prueba. También deja credenciales de cobro en un lugar donde no corresponde.',
          },
        ],
      },
      {
        heading: 'Para prender la publicación automática',
        paragraphs: [
          'La publicación automática necesita saber a qué servidor entrar y con qué llave. Se carga en la configuración del repositorio en GitHub, no en el código. Mientras falten los dominios de producción y de staging, queda apagada y no hace nada: así está hoy.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Qué', 'Para qué'],
            rows: [
              ['Dirección, usuario y clave SSH del servidor', 'Que el sistema de publicación pueda entrar'],
              ['Dominio de producción y de staging', 'Armar las direcciones que verifica al terminar'],
              ['Carpeta del proyecto en el servidor', 'Dónde correr los comandos'],
              [
                'Revisor obligatorio en el ambiente de producción',
                'Que publicar en producción exija una aprobación y no salga solo',
              ],
            ],
          },
          {
            type: 'callout',
            tone: 'warning',
            text: 'Sin el revisor obligatorio, el paso de producción se ejecuta sin preguntar. Es la única pieza de todo esto que se configura por fuera del repositorio y la más fácil de olvidar.',
          },
        ],
      },
    ],
  },

  plataformaTramites: {
    title: 'Trámites y altas con proveedores',
    intro:
      'Lo que no se resuelve con código: qué hay que gestionar con cada proveedor, cuánto suele tardar y qué te entregan al final.',
    category: 'Administrar la plataforma',
    sections: [
      {
        heading: 'Arrancar los lentos primero',
        paragraphs: [
          'Casi todo se resuelve en un rato. Las excepciones son las que tienen una persona del otro lado, y son justo las que conviene empezar antes de prometer una fecha.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Trámite', 'Con quién', 'Suele tardar', 'Qué te dan'],
            rows: [
              [
                'Alta comercial de Andreani',
                'Ejecutivo comercial',
                'Semanas',
                'Usuario, contraseña y números de contrato',
              ],
              [
                'Alta y certificación de Payway',
                'Ejecutivo comercial',
                'Semanas',
                'Site ID, las dos claves y la habilitación para cobrar',
              ],
              [
                'App de Meta aprobada',
                'Revisión de Meta',
                'Días a semanas',
                'App ID y App Secret con permisos',
              ],
              ['Certificado de ARCA', 'ARCA con clave fiscal', 'Días', 'Certificado y punto de venta'],
              ['Cuenta de MiCorreo', 'Correo Argentino', 'Días', 'Credenciales de prueba y de producción'],
              [
                'Cuenta de Zipnova',
                'Alta en su web',
                'Horas',
                'API Token, Secret y número de cuenta. Para probar, pedile a soporte el modo “testing”',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Payway: qué pedir y qué confirmar',
        steps: [
          'Pedir el alta del comercio. No hay registro autogestionado ni ambiente de pruebas abierto.',
          'Pedir credenciales de prueba propias: las que figuran en su documentación sirven para desarrollar, no para el comercio real.',
          'Pasar la certificación. Revisan la integración antes de habilitar el cobro en producción.',
          'Confirmar POR ESCRITO el host de producción y la tabla de medios de pago vigente para el comercio.',
          'Acordar los planes de cuotas y con qué costo financiero. Las cuotas que se ofrecen en la tienda las elige el comercio en el panel, y tienen que coincidir con lo acordado.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Dos datos que Payway no publica de forma consistente',
            text: 'Sus propios kits de desarrollo no coinciden en el host de producción, y circulan dos tablas distintas de códigos de medio de pago (Mastercard figura como 15 en una y como 104 en otra). El host se corrige desde el panel, con “Host alternativo de la API”, sin publicar una versión nueva, siempre que sea uno de los que la tienda ya tiene permitidos; uno distinto necesita un cambio de código. La tabla de códigos es la clásica y está en el código: si Payway confirma la otra, hay que cambiarla antes del primer cobro real.',
          },
        ],
      },
      {
        heading: 'Andreani: qué pedir y qué confirmar',
        steps: [
          'Alta comercial y contratos. Pedir los dos si se van a ofrecer las dos modalidades: entrega a domicilio y retiro en sucursal son contratos distintos.',
          'Preguntar si aplican restricción por IP. Si aplica, informarles la IP de salida del servidor: sin eso la API responde 403 aunque las credenciales estén bien.',
          'Pedir que habiliten el seguimiento para el usuario. Es una habilitación aparte, no viene con las credenciales.',
          'Pedir primero credenciales de prueba (QA) y después las de producción.',
          'Pedir la tabla completa de estados y motivos de envío.',
          'Confirmar el coeficiente de peso aforado del contrato. El sistema usa 0,35 g/cm³: si el contrato dice otro, avisá antes de habilitarlo, porque hoy no se cambia desde el panel.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Cotizar no pide iniciar sesión en Andreani: alcanza con el contrato. Por eso el checkout puede mostrar precios aunque el login falle (por ejemplo, con la IP del servidor todavía sin habilitar), y el problema aparece recién al despachar. Usá siempre “Probar conexión” al cargar las credenciales.',
          },
          {
            type: 'callout',
            tone: 'danger',
            text: 'Antes de habilitarlo a un comercio, imprimir una etiqueta real en su impresora y escanear el código con un lector. La etiqueta de Andreani sale en PDF: si el comercio usa impresora térmica, el código puede salir ilegible y eso recién se descubre en el depósito.',
          },
        ],
      },
      {
        heading: 'Mercado Pago y Mercado Libre: registrar las apps',
        paragraphs: [
          'Son las dos que sí necesitan configuración del servidor, porque el botón de “conectar tu cuenta” usa una aplicación registrada a nombre de la plataforma. Van en portales distintos y una no sirve para la otra, aunque sean la misma empresa.',
        ],
        steps: [
          'Crear la aplicación en el portal que corresponda. En Mercado Pago tiene que ser con modelo marketplace, que es el que permite operar en nombre de otros vendedores.',
          'Cargar la URL de retorno del OAuth apuntando a la API pública. En desarrollo hace falta un túnel, porque el portal no acepta direcciones locales.',
          'Configurar el webhook: en Mercado Pago el de pagos con su secreto; en Mercado Libre las notificaciones del tema de órdenes.',
          'Cargar las claves en la configuración del servidor y reiniciar la API.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Sin el webhook de pagos, una compra que el comprador abandona a mitad de camino puede quedar sin impactar en la orden aunque el pago se haya acreditado.',
          },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Conviene registrar dos aplicaciones, una por ambiente, con sus propias URLs de retorno. Si se comparte una sola, la vuelta del OAuth de staging cae en producción.',
          },
        ],
      },
      {
        heading: 'ARCA: el circuito del certificado',
        paragraphs: [
          'Es de nivel tienda, no de plataforma, pero lo suele hacer alguien con conocimiento técnico y conviene tenerlo mapeado. El asistente del panel guía el paso a paso.',
        ],
        steps: [
          'Cargar los datos del emisor y generar la solicitud del certificado desde Configuración → Facturación (“Generar solicitud (CSR)”).',
          'Subirla a ARCA con clave fiscal: en homologación, por el WSASS; en producción, por Administración de Certificados Digitales.',
          'En el Administrador de Relaciones de ARCA, autorizar ese certificado al servicio de factura electrónica (wsfe) y, si se va a usar “Consultar en ARCA” al facturar, también al de constancia de inscripción (ws_sr_constancia_inscripcion).',
          'Pegar en el panel el certificado que emite ARCA y tocar “Activar certificado”.',
          'En producción, crear el punto de venta en ARCA del tipo “RECE para aplicativo y web services” y cargar ese número en el panel.',
          'Usar “Probar conexión con ARCA”. Probar en homologación y recién después pasar a producción: el certificado es uno por ambiente.',
        ],
      },
    ],
  },

  integracionesProduccion: {
    title: 'Checklist antes de cobrar y despachar de verdad',
    intro: 'Lo último que hay que verificar antes de que un comprador real ponga su tarjeta.',
    category: 'Administrar la plataforma',
    sections: [
      {
        heading: 'Los ambientes',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Staging responde “no me indexes”: se comprueba mirando las cabeceras de cualquier página suya',
              'Staging usa credenciales de prueba en cobros y el certificado de homologación en facturación',
              'Staging no manda emails de verdad, o solo los manda a casillas propias',
              'Producción y staging escriben en buckets de imágenes distintos',
              'Publicar en producción exige aprobación y no sale solo',
              'Se probó volver atrás una versión, al menos una vez, en staging',
            ],
          },
          {
            type: 'callout',
            tone: 'warning',
            text: 'Si staging se deja indexar, Google levanta las tiendas de prueba y te compite en los resultados con tu propia tienda real, mostrando precios que no son.',
          },
        ],
      },
      {
        heading: 'Cobros',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Mercado Pago: cuenta conectada y una compra real de monto chico, aprobada y devuelta',
              'Mercado Pago: el webhook llega — probado cerrando el navegador antes de volver a la tienda',
              'Payway: credenciales de producción y ambiente cambiado a “Producción — cobra de verdad”',
              'Payway: host de producción y tabla de medios de pago confirmados por escrito',
              'Payway: un cobro real hecho y devuelto',
              'El nombre que aparece en el resumen de la tarjeta es el correcto',
            ],
          },
        ],
      },
      {
        heading: 'Envíos',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Cada carrier activo cotiza en el checkout, probado con códigos postales de zonas distintas',
              'Un envío de prueba generado de punta a punta, con su etiqueta descargada',
              'La etiqueta impresa en la impresora real del comercio y escaneada con un lector',
              'Los datos del remitente completos: sin eso se puede cotizar pero no despachar',
              'El paquete por defecto refleja lo que el comercio manda de verdad',
            ],
          },
          {
            type: 'callout',
            tone: 'warning',
            text: 'El paquete por defecto no es un detalle: si las medidas cargadas son más grandes que las reales se le cotiza de más al comprador, y si son más chicas la diferencia la paga el comercio.',
          },
          {
            type: 'callout',
            tone: 'danger',
            text: 'En producción, un envío de prueba es un envío real. Andreani no permite anularlo desde el sistema, y Zipnova lo cobra del saldo si la cuenta no está en modo testing. Probá con las credenciales de QA de Andreani y con el modo testing de Zipnova.',
          },
        ],
      },
      {
        heading: 'Imágenes',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Un logo subido desde el editor de diseño y la dirección de la imagen apuntando al dominio propio, no a una dirección local',
              'La misma imagen abierta en una ventana de incógnito: si pide permisos, el bucket no quedó público',
              'El bucket privado SIN dominio conectado, y un adjunto del chat posventa que se abre solo desde el panel',
              'Una foto quitada de un producto que efectivamente desaparece del bucket',
            ],
          },
        ],
      },
      {
        heading: 'Facturación y emails',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Certificado de producción de ARCA, no el de homologación',
              'Una factura de prueba emitida y verificada en el portal de ARCA',
              'Dominio del remitente verificado en Resend',
              'Un email de confirmación de compra recibido en una casilla real, fuera de spam',
              'El webhook de rebotes configurado',
            ],
          },
        ],
      },
      {
        heading: 'Cuando algo no anda',
        blocks: [
          {
            type: 'table',
            headers: ['Síntoma', 'Causa más probable'],
            rows: [
              [
                'El botón de conectar Mercado Pago no hace nada',
                'Falta la app de plataforma o la URL de retorno',
              ],
              [
                'Los pagos se aprueban pero la orden queda pendiente',
                'El webhook no llega a la API, o falta su secreto y la API lo rechaza. Si llegó y no se pudo procesar, lo avisa Configuración → Medios de pago',
              ],
              ['Payway responde que no está autorizado', 'Credenciales de prueba en producción, o al revés'],
              ['Andreani responde 403 con credenciales correctas', 'La IP del servidor no está habilitada'],
              ['Andreani no muestra el seguimiento', 'Falta la habilitación específica para ese usuario'],
              ['Los emails no llegan', 'El dominio del remitente no está verificado'],
              [
                'Las facturas quedan en error',
                'Certificado de homologación cargado en producción, o un punto de venta que no es de web services',
              ],
              [
                'Una venta muestra un envío para revisar',
                'El carrier pudo haberlo creado sin que quedara guardado, y hasta resolverlo la venta no deja crear otro. Mirá en el panel del carrier si se creó y resolvelo desde la venta: “Se creó: cargar el número” (en Correo Argentino, “Se creó: registrarlo”) o “Ya lo revisé: no se creó”',
              ],
              ['Una tienda nueva no abre en su subdominio', 'Falta el registro comodín en el DNS'],
              [
                'La API no arranca y el log habla de media',
                'Quedaron las credenciales de desarrollo del almacenamiento: se niega a arrancar a propósito',
              ],
              [
                'Las fotos se suben pero se ven rotas',
                'La dirección pública del almacenamiento está mal, o el bucket no es público',
              ],
              [
                'El panel abre pero no puede hablar con la API',
                'El config.js que el contenedor del panel escribe al arrancar quedó apuntando a otro ambiente. Sale de STACK_DOMAIN en el archivo de variables: corregirlo y volver a desplegar',
              ],
              [
                'Una tienda de staging pide certificado o da error de seguridad',
                'Falta el comodín de staging en el DNS, o el token de DNS no tiene permiso sobre la zona',
              ],
            ],
          },
        ],
      },
    ],
  },

  plataformaOperacion: {
    title: 'Mantener la plataforma andando',
    intro: 'Backups, certificados y las señales que conviene mirar antes de que las reporte un cliente.',
    category: 'Administrar la plataforma',
    sections: [
      {
        heading: 'El backup que realmente importa',
        paragraphs: [
          'Todos los días, el servidor guarda una copia de la base y de las claves de cifrado, y conserva las de los últimos 14 días. Además, cada deploy copia la base justo antes de migrarla. Lo que se olvida es lo que ese backup NO cubre.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Qué', 'Si se pierde', 'Se recupera'],
            rows: [
              [
                'Base de datos',
                'Se pierde todo: catálogo, ventas, clientes',
                'Del backup diario o de la copia previa a cada deploy',
              ],
              [
                'Volumen de claves de cifrado',
                'Cada tienda tiene que reconectar TODAS sus integraciones de cero, y los teléfonos y direcciones de los clientes no se pueden leer',
                'Del backup diario. Se restaura el del MISMO día que la base: una base sin sus claves vuelve a medias',
              ],
              ['Almacenamiento de imágenes', 'El catálogo queda sin fotos', 'No: el proveedor no versiona'],
              [
                'Archivos de variables del servidor',
                'Hay que rearmar la configuración a mano y conseguir de nuevo las claves',
                'No: guardarlos en un gestor de contraseñas',
              ],
            ],
          },
          {
            type: 'callout',
            tone: 'warning',
            text: 'Los backups diarios quedan en el mismo disco que la base: si se pierde el servidor, se pierden con él. Prendé la copia fuera del servidor, que sube los backups cifrados a un bucket aparte cada 6 horas. Viene apagada; los pasos están en docs/despliegue.md. Y guardá la frase de cifrado en un gestor de contraseñas: sin ella, esa copia no se abre.',
          },
          {
            type: 'callout',
            tone: 'danger',
            text: 'Un backup que nunca se restauró no es un backup. El control semanal (./infra/check-backup.sh prod, programado en el servidor) restaura el último en una base aparte y comprueba que las claves se abren; termina en OK o en FALLA. Igual, probá una restauración completa al menos una vez.',
          },
        ],
      },
      {
        heading: 'Certificados y dominios',
        paragraphs: [
          'Los certificados se emiten y renuevan solos: los de la plataforma por validación de DNS, los de los dominios propios de cada comercio la primera vez que alguien los visita. No hay renovación manual.',
          'Lo que sí puede fallar es lo de afuera: que el comercio no haya creado el registro en su DNS, que le venza el dominio, o que el token de DNS de la plataforma haya expirado y deje de poder validar.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Dominios propios: todavía no están listos',
            text: 'Hoy las tiendas funcionan en su subdominio. Un dominio propio necesita además que la API lo acepte como origen, y que el inicio de sesión del comprador funcione desde otro dominio, algo que está pendiente. Leé la sección de seguridad de docs/despliegue.md antes de conectar el primero.',
          },
        ],
      },
      {
        heading: 'Qué mirar seguido',
        blocks: [
          {
            type: 'checklist',
            items: [
              'En Configuración → Medios de pago, el recuadro de avisos de pago que no se pudieron procesar: aparece solo si Mercado Pago avisó un cobro que no se pudo registrar, y cada uno se reintenta desde ahí',
              'Facturas en error: suele ser el certificado o el punto de venta',
              'Emails rebotados en aumento: puede ser el dominio del remitente',
              'Cuentas de redes o de Meta Ads que piden “Reconectar”: un permiso que la red revocó',
              'Errores nuevos en Sentry, si está configurado',
              'Espacio en disco del servidor: los backups (14 días más una copia por deploy) y las imágenes de cada versión publicada se acumulan. Los logs no: cada contenedor guarda tres archivos de 10 MB que rotan solos',
              'Que el backup diario esté generando archivos nuevos y que el control semanal termine en OK, no solo que el proceso esté vivo',
            ],
          },
        ],
      },
      {
        heading: 'Actualizar Postgres',
        paragraphs: [
          'La base corre Postgres 18 y el deploy no la toca nunca, a propósito: actualizarla la reinicia.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Qué', 'Cómo'],
            rows: [
              [
                'Un parche dentro de la 18 (18.6 → 18.7)',
                'A mano, en un horario tranquilo: traer y volver a levantar solo postgres y pg-backup. Corta la base unos segundos',
              ],
              [
                'Una versión mayor nueva',
                './infra/pg-upgrade.sh prod y después un deploy. Ensaya primero sobre una copia, guarda un dump, cuenta las filas antes y después, y deja el volumen viejo como vuelta atrás. Si no corrés esto, deploy.sh se frena y te lo pide',
              ],
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Los comandos exactos están en la guía docs/despliegue.md del repositorio, sección “Cambiar de major de Postgres”.',
          },
        ],
      },
      {
        heading: 'Sumar una tienda nueva',
        steps: [
          'Crearla desde Mis tiendas → Crear tienda (solo un dueño puede). El subdominio funciona solo si el DNS comodín está puesto.',
          'Cargar a su dueño con Configuración → Usuarios → Agregar usuario, y agregar un segundo dueño.',
          'Conectar el cobro y configurar al menos un medio de envío.',
          'Cargar los datos legales y, si va a facturar, el certificado de facturación.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Las credenciales de las tiendas no se comparten entre sí, aunque sean de la misma empresa. Cada una conecta sus propias cuentas.',
          },
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
