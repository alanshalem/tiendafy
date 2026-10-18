import type { HelpArticle } from './helpContent';

/**
 * El editor de diseño ("Canales de venta → Tienda online"), en tres artículos:
 * el editor en general (guardar, publicar, deshacer, galería…), cómo se arma
 * el inicio con secciones, y las pantallas fijas de la tienda (encabezado,
 * menú, listado, ficha, carrito, pie). El catálogo de los 23 tipos de sección
 * está aparte, en help-content-secciones.ts.
 */
export const DISENO = {
  tema: {
    title: 'Diseño de tu tienda',
    intro:
      'El editor visual: logo, colores, letra y secciones sin tocar código, con vista previa en vivo, borrador que se guarda solo y publicación cuando vos decidís.',
    category: 'Tu tienda online',
    keywords: ['tema', 'theme', 'plantilla', 'template', 'personalizar', 'undo', 'ctrl z', 'editar diseño'],
    sections: [
      {
        heading: 'El editor visual',
        paragraphs: [
          'En Canales de venta → Tienda online se abre “Editar diseño”: a la izquierda las opciones, a la derecha tu tienda tal como la va a ver tu cliente. Todo lo que cambiás se ve al instante.',
          'Las opciones están ordenadas en grupos numerados, de lo general a lo particular. Lo que se configura en otra pantalla (el checkout y las páginas de contenido) aparece al final con un ícono de link que te lleva ahí.',
          'Si manejás varias tiendas, cambiás a la otra desde su nombre arriba (o desde el menú ⋯ → “Editar …” en pantallas chicas). De fábrica el editor lo usan el dueño y el administrador (permiso “Diseño y páginas de la tienda”); se cambia en Configuración → Roles y permisos.',
        ],
        blocks: [
          { type: 'path', segments: ['Canales de venta', 'Tienda online'] },
          {
            type: 'table',
            headers: ['Grupo', 'Qué tiene'],
            rows: [
              ['1 · Identidad', 'Logo de la tienda, Colores de tu marca, Tipo de letra'],
              ['2 · Estilo global', 'Estilo y movimiento: bordes, botones, íconos, animaciones y densidad'],
              [
                '3 · Estructura de la tienda',
                'Encabezado (con el menú y la barra de anuncio) y Pie de página',
              ],
              ['4 · Contenido', 'Página de inicio, Listado de productos, Detalle de producto'],
              ['5 · Conversión y contacto', 'Carrito de compras, Botón de WhatsApp, Contacto'],
              [
                '6 · Avanzado y estado',
                'Historial de publicaciones, Edición avanzada de CSS, Tienda en construcción',
              ],
              ['7 · Se edita en otra pantalla', 'Opciones del checkout y Páginas de contenido'],
            ],
          },
          {
            type: 'demo',
            demo: 'storefrontPreview',
            caption:
              'Probalo acá mismo: tocá un color y mirá cómo cambia toda la tienda. En el editor real es igual, pero con TU tienda y tus productos.',
          },
        ],
      },
      {
        heading: 'La vista previa',
        paragraphs: [
          'Arriba elegís cómo verla: Celulares, Tablets o Computadoras. La tienda se dibuja al ancho real de ese dispositivo y se achica para entrar en la pantalla (abajo te dice, por ejemplo, “Celular · 390 px · al 62%”), así que lo que ves es lo que se va a ver, no una aproximación. El editor recuerda el último que elegiste.',
          'Con el botón “Esconder el panel de opciones” la vista previa ocupa todo el ancho. Al pasar el mouse por el encabezado, el pie o una sección del inicio en la vista previa aparece “Editar”: tocalo y se abre su panel. Las secciones tienen además un tacho para eliminarlas (con “Deshacer”).',
          'La vista previa sigue al panel abierto: en Listado de productos muestra el listado, en Detalle de producto un producto real, en Contacto la página de contacto, en Carrito de compras abre el carrito y en Tienda en construcción muestra esa página. Al abrir el encabezado, el pie, el botón de WhatsApp o una sección, baja hasta ahí.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            title: 'Desde el celular también se puede',
            text: 'En el teléfono el editor tiene dos solapas abajo, “Editar” y “Vista previa”, y los botones de deshacer y rehacer siempre a la vista, porque ahí no hay teclado.',
          },
        ],
      },
      {
        heading: 'Se guarda solo, se publica cuando vos quieras',
        paragraphs: [
          'Cada cambio se guarda en el borrador casi al instante; arriba ves “Guardando…” y después “Guardado”. Si se cortó internet aparece “No se guardó — Reintentar”. Tu tienda pública no cambia hasta que toques “Publicar cambios”: podés experimentar tranquilo, nadie ve el borrador más que vos y tu equipo.',
          '“Ver qué cambió” lista las partes de la tienda que tienen cambios sin publicar (el logo, el encabezado, la página de inicio…). “Descartar” tira todos los cambios sin publicar y vuelve al diseño publicado; también se puede deshacer.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Lo que publicás se ve en la tienda al recargarla: la tienda se entera en el momento. Lo mismo con los productos, precios, stock y categorías. Si alguna vez no lo ves, recargá en medio minuto: la tienda igual se pone al día sola.',
          },
        ],
      },
      {
        heading: 'Deshacer y rehacer',
        paragraphs: [
          'Los botones de deshacer y rehacer están arriba, también en el celular. Con el teclado: Ctrl+Z deshace y Ctrl+Shift+Z (o Ctrl+Y) rehace; en Mac, con ⌘. Se recuerdan los últimos 100 pasos.',
          'Se deshace todo: un color, una sección borrada, una plantilla aplicada, una versión vieja restaurada o un diseño de la galería. Adentro de un campo de texto, Ctrl+Z deshace lo que estás escribiendo en ese campo.',
        ],
      },
      {
        heading: 'Buscar una opción (Ctrl K)',
        paragraphs: [
          'No hace falta saber en qué panel está cada cosa. Apretá Ctrl+K (⌘K en Mac) o tocá “Buscar una opción…” y escribí lo que querés cambiar: “cuotas”, “logo”, “cupón”, “menú”. Te lleva directo al panel.',
          'También encuentra las secciones de tu inicio por su nombre o por lo que dicen, y los tipos de sección que todavía no agregaste.',
        ],
      },
      {
        heading: 'La guía “Poné tu tienda linda”',
        paragraphs: [
          'Arriba de todo del editor hay una lista con seis pasos y una barra de avance: cargá tu logo, elegí colores de marca, poné una foto de portada (que el inicio arranque con un carrusel con fotos o un video), sumá tus redes sociales, activá el botón de WhatsApp y cargá datos de contacto. Cada paso te lleva a su panel, y la lista desaparece cuando completás los seis.',
        ],
      },
      {
        heading: 'Programar una publicación',
        paragraphs: [
          'Con “Programar” elegís fecha y hora, y el diseño sale solo en ese momento. Se programa el diseño tal como está cuando tocás el botón: podés seguir editando el borrador después, y lo que sigas cambiando no entra en la publicación programada ni se pisa cuando sale.',
          'La fecha tiene que ser futura y como mucho dentro de un año. Mientras hay una publicación pendiente el botón dice “Programado”: al tocarlo ves para cuándo está y la podés cancelar. Cuando sale, lo que estaba publicado antes queda en el historial, igual que al publicar a mano.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Ideal para una campaña: armás el inicio del Hot Sale con tiempo, lo programás para la medianoche y te vas a dormir.',
          },
        ],
      },
      {
        heading: 'Historial de publicaciones',
        paragraphs: [
          'En el grupo 6 · Avanzado y estado, el historial guarda cómo se veía tu tienda antes de cada una de las últimas 20 publicaciones. “Volver a esta” carga esa versión en el BORRADOR, no en la tienda: la revisás, y si es la que querías, publicás.',
        ],
      },
      {
        heading: 'Si otra persona o pestaña cambió el diseño',
        paragraphs: [
          'Si tenés el editor abierto en dos pestañas, alguien de tu equipo edita a la vez o salió una publicación programada, el editor no pisa los cambios del otro sin avisar. Aparece “El diseño cambió en otra pestaña o lo editó otra persona” y elegís:',
        ],
        blocks: [
          {
            type: 'terms',
            items: [
              {
                term: 'Recargar el último',
                def: 'Trae la versión que guardó el otro. Lo tuyo no se pierde: lo recuperás con deshacer.',
              },
              {
                term: 'Guardar el mío igual',
                def: 'Tu versión reemplaza a la del otro. Usalo solo si sabés que lo del otro no importa.',
              },
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Mientras no elijas, el guardado automático queda en pausa, pero podés seguir editando.',
          },
        ],
      },
      {
        heading: 'Galería de diseños',
        paragraphs: [
          'Si preferís arrancar de una base, “Elegí un diseño listo” abre la pantalla “Diseños para tu tienda”, con combinaciones armadas por rubro (moda, deco, alimentos, tecnología, gimnasio y más) y los diseños de las marcas del grupo. Tocá “Usar este diseño” y después “Aplicar al borrador”: la ventana te dice qué cambia ese diseño en particular, y al aplicarlo volvés al editor.',
          'Un diseño de la galería cambia lo visual: colores, tipografía, estilo, el encabezado y las secciones del inicio, que se reemplazan por las del diseño; algunos traen también su barra de anuncio. Del encabezado se mantienen tu menú y si el celular muestra el menú desplegable, pero los colores por página vuelven a “Igual que el general”. Lo que cargaste vos queda como está: pie de página, contacto, carrito, listado, botón de WhatsApp y CSS propio.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Se aplica al borrador',
            text: 'Tu tienda no cambia hasta que publiques, y se deshace con Ctrl+Z. Ojo con los diseños de marca: algunos traen su propio logo, favicon y textos para Google, y otros prenden la “Tienda en construcción”. Revisá antes de publicar.',
          },
        ],
      },
      {
        heading: 'Copiar el diseño de otra tienda',
        paragraphs: [
          'Si manejás más de una tienda, “Copiar el diseño de otra tienda” trae a tu borrador lo PUBLICADO de la otra: colores, fuentes, encabezado, pie y secciones. Los productos de cada tienda no se tocan, y tu tienda no cambia hasta que publiques.',
          'Solo se puede copiar de una tienda donde vos también podés editar el diseño y que ya tenga algo publicado; si no, avisa que no se pudo copiar.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Revisá lo que es propio de cada tienda',
            text: 'La copia trae el diseño entero de la otra tienda, también su logo, sus datos de contacto, el botón de WhatsApp y los textos para Google. Antes de publicar, revisá Logo de la tienda, Contacto y Botón de WhatsApp. Si te arrepentís, se deshace con Ctrl+Z.',
          },
        ],
      },
      {
        heading: 'Identidad: logo y cómo aparecés en Google',
        paragraphs: [
          'En Logo de la tienda (el panel “Identidad de tu tienda”) cargás el logo (sin logo se muestra el nombre de la tienda) y elegís su tamaño en el encabezado, el favicon (el iconito de la pestaña del navegador) y la “Imagen al compartir”, la que se ve cuando alguien pasa el link de tu tienda por WhatsApp o redes.',
          'Debajo de la imagen ves cómo queda el link en un chat de WhatsApp (en claro u oscuro, como tengas el panel): con imagen al compartir, la foto va grande arriba; si no subiste una, va tu logo en chico (si es SVG, ninguna: las redes no lo leen). Lo ideal es una de 1200 × 630 px.',
          'Ahí mismo, en “Cómo aparecés en Google”, van el título y la descripción para buscadores, con una vista previa del resultado tal como se ve en un celular, que se actualiza mientras escribís: el favicon, tu dominio y los textos cortados donde los corta Google. Debajo de cada campo, un contador te avisa si quedó corto o tan largo que Google lo va a cortar (ideal: hasta 60 caracteres el título y 150-160 la descripción). Si los dejás vacíos, se usa un texto con el nombre de tu tienda, el mismo que muestra la vista previa. Mirá también el artículo “Aparecer en Google (SEO)”.',
        ],
      },
      {
        heading: 'Colores, letra, botones y estilo',
        paragraphs: [
          'En Colores de tu marca tenés combinaciones listas (claras y oscuras) o elegís cada color: el principal (botones y destacados), uno de acento si querés, el fondo y los textos. Si un texto no se va a leer bien sobre su fondo, el editor te avisa: “No se lee” o “Se lee justo”. En Tipo de letra elegís una combinación lista o una letra para los títulos y otra para el resto.',
          'En Estilo y movimiento definís los bordes (redondeado, suave o cuadrado), el estilo de los botones (forma, lleno o solo contorno, y texto normal o en MAYÚSCULAS, con una muestra en vivo), los íconos, cuánto se mueven las cosas y qué tan apretado o aireado se ve todo.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            title: 'Estilos rápidos y Restablecer',
            text: 'Varios paneles traen “Estilos rápidos”: combinaciones armadas, con una marcada como Recomendado. Y casi todos tienen “Restablecer”, que vuelve ese panel a los valores de fábrica sin tocar el resto.',
          },
        ],
      },
      {
        heading: 'Tu marca en todos lados',
        paragraphs: [
          'El logo y el color principal que definas acá se usan también en los e-mails automáticos que reciben tus clientes. Ahí el logo va arriba y chico (hasta 56 px de alto y 220 de ancho): uno apaisado y sin márgenes de sobra se lee mejor.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Los emails usan el tema PUBLICADO',
            text: 'Si cambiaste el logo y en los emails sigue apareciendo el anterior, es porque el cambio quedó en el borrador: tocá “Publicar cambios”. Y para email usá PNG/JPG — los SVG no se muestran en Gmail ni Outlook — con colores que se vean sobre fondo blanco.',
          },
        ],
      },
      {
        heading: 'Tienda en construcción',
        paragraphs: [
          'Con “Activar modo en construcción” tus visitantes ven una página de “Próximamente” en lugar de la tienda. Mientras el panel está abierto, la vista previa te muestra esa página tal como la van a ver; al salir del panel volvés a ver la tienda. Como todo el diseño, se aplica cuando publicás.',
          'La página la armás vos: título, mensaje, una etiqueta arriba, diseño centrado o con imagen al costado, fecha de apertura, un WhatsApp para consultas, tus redes y un campo para que la gente deje su email y le avises cuando abras. Esos emails los usás después como audiencia en Email marketing.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Si ponés fecha de apertura, que sea una que vas a cumplir: una fecha que se pasa sin abrir da peor imagen que no poner ninguna.',
          },
        ],
      },
      {
        heading: 'CSS personalizado',
        paragraphs: [
          'Edición avanzada de CSS es para quien sabe CSS: lo que escribas se agrega a tu tienda. No hace falta para nada de lo que el editor ya permite, y un error ahí puede desarmar la tienda en algún dispositivo, así que probalo en celular y en computadora antes de publicar. “Restablecer” lo vacía.',
          'Los diseños de la galería no tocan tu CSS propio.',
        ],
      },
    ],
  },

  temaInicio: {
    title: 'Armar el inicio de tu tienda',
    intro:
      'La página de inicio se arma con secciones: agregarlas, ordenarlas, ocultarlas, cambiarles el nombre, borrarlas y deshacer.',
    category: 'Tu tienda online',
    keywords: [
      'home',
      'portada',
      'renombrar sección',
      'reordenar',
      'arrastrar',
      'ocultar sección',
      'eliminar sección',
      'plantilla de inicio',
      'link',
      'enlace',
    ],
    sections: [
      {
        heading: 'La lista de secciones',
        paragraphs: [
          'En el editor, Página de inicio muestra la lista de secciones en el orden en que aparecen en la tienda, cada una con su nombre y un resumen de lo que tiene. Tocá una para editarla.',
          'El ojo de cada fila la oculta sin borrarla: la sección queda en gris en la lista y deja de verse en la tienda. Volvé a tocarlo para mostrarla.',
        ],
        blocks: [{ type: 'path', segments: ['Canales de venta', 'Tienda online', 'Página de inicio'] }],
      },
      {
        heading: 'Agregar una sección',
        steps: [
          'Tocá “Agregar sección”, o el “+” que aparece entre dos secciones al pasar el mouse para meterla justo ahí (con el dedo no hay “+”: usá el menú ⋯ → Agregar sección arriba o abajo).',
          'Se abre el selector con todas las secciones agrupadas (Imágenes, Productos, Contenido, Confianza, Contacto), cada una con una miniatura. Arriba te dice dónde va a quedar: “Va entre «Carrusel» y «Destacados»”.',
          'Buscá por nombre si querés: “banners”, “preguntas”, “video”. Enter elige la primera.',
          'La sección se agrega con contenido de ejemplo y se abre para que la completes.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Qué hace cada una de las 23 secciones está en el artículo “Los tipos de sección del inicio”.',
          },
        ],
      },
      {
        heading: 'El menú ⋯ de cada sección',
        blocks: [
          {
            type: 'table',
            headers: ['Opción', 'Qué hace'],
            rows: [
              ['Cambiar nombre', 'Le pone un nombre propio para reconocerla en la lista. Solo lo ves vos.'],
              [
                'Duplicar',
                'Hace una copia justo abajo, llamada «… (copia)». No está para las que van una sola vez.',
              ],
              [
                'Agregar sección arriba / abajo',
                'Abre el selector para meter una sección nueva en ese lugar.',
              ],
              ['Mostrar en', 'Celulares y computadoras, Solo en celulares, o Solo en computadoras.'],
              ['Mover arriba / Mover abajo', 'La corre un lugar.'],
              ['Eliminar', 'La borra al instante, con la opción de deshacer.'],
            ],
          },
        ],
      },
      {
        heading: 'Ordenar las secciones',
        paragraphs: [
          'Arrastrá la manija de la izquierda de cada fila. En el celular, mantené apretada la manija un momento y después arrastrá.',
          'Con el teclado: llegá a la manija con Tab, apretá Espacio para agarrarla, movela con las flechas ↑ y ↓ y soltala con Espacio. Escape cancela.',
        ],
      },
      {
        heading: 'Borrar y deshacer',
        paragraphs: [
          'Eliminar una sección no pide confirmación: se borra al instante y abajo aparece “Eliminaste «…».” con un botón “Deshacer” durante 8 segundos (si tenés el mouse encima, espera). “Deshacer” la devuelve a su lugar, aunque hayas tocado otras cosas mientras tanto.',
          'Si se te pasaron los 8 segundos, todavía la recuperás con el botón de deshacer de arriba o con Ctrl+Z. Y mientras no publiques, la tienda la sigue mostrando.',
        ],
      },
      {
        heading: 'Una sección solo en el celular (o solo en la computadora)',
        paragraphs: [
          'Desde el menú ⋯ → Mostrar en, o desde “Diseño de la sección” adentro de cada una, elegís si se ve en celulares y computadoras, solo en celulares o solo en computadoras.',
          'Sirve, por ejemplo, para tener dos carruseles: uno con fotos verticales para el celular y otro con fotos apaisadas para la computadora.',
        ],
      },
      {
        heading: 'Cambiarle el nombre a una sección o a sus ítems',
        paragraphs: [
          'Con ⋯ → Cambiar nombre, la fila se convierte en un campo: escribí y apretá Enter (Escape cancela). También está el campo “Nombre de la sección” adentro de cada una. Si lo dejás vacío vuelve al nombre del tipo.',
          'Lo mismo con los ítems de adentro: diapositivas del carrusel, banners, testimonios, preguntas, logos de marcas, ítems de la barra de información, columnas de íconos y bloques del collage. Cada ítem tiene su menú ⋯ con “Cambiar nombre”, “Duplicar”, “Mover arriba”, “Mover abajo” y “Eliminar” (este pide confirmación); también se ordenan arrastrando la manija. En la fila ves la foto del ítem (o su número) para reconocerlo sin abrirlo.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'El nombre es solo para ordenarte en el editor: tus clientes no lo ven. Lo que se ve en la tienda es el título de la sección.',
          },
        ],
      },
      {
        heading: 'Plantillas de inicio',
        paragraphs: [
          '“Usar una plantilla de inicio” arma toda la página de una vez con una estructura pensada, que después editás sección por sección.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Plantilla', 'Qué trae'],
            rows: [
              ['Lanzamiento', 'Hero con video, destacados, información de envíos y pagos, newsletter'],
              [
                'Catálogo grande',
                'Carrusel, banners de categorías, destacados, nuevos, información de envíos y pagos',
              ],
              [
                'Marca / Editorial',
                'Carrusel, imagen y texto, mensaje institucional, destacados, información de envíos y pagos',
              ],
              ['Minimal', 'Carrusel y destacados'],
              [
                'Ofertas',
                'Carrusel, productos en oferta, banners promocionales, destacados, información de envíos y pagos',
              ],
            ],
          },
          {
            type: 'callout',
            tone: 'warning',
            text: 'Una plantilla REEMPLAZA las secciones que ya tenías (te pide confirmar). Se deshace con Ctrl+Z, y como todo, no se ve en la tienda hasta que publiques.',
          },
        ],
      },
      {
        heading: 'Diseño de la sección',
        paragraphs: [
          'Al pie de cada sección, el bloque plegable “Diseño de la sección” define en qué dispositivos se ve, el fondo (sin fondo, gris suave, el color de tu marca tenue u otro color), el espacio arriba y abajo, y la alineación de los títulos. Con un color de fondo propio, el texto se ajusta solo para que se lea.',
        ],
      },
      {
        heading: 'Las fotos: medida ideal y foto para celular',
        paragraphs: [
          'Cada lugar donde subís una foto te dice qué formatos acepta, cuánto puede pesar y la medida ideal en píxeles. La medida ideal sale de cómo vas a mostrar la foto: si cambiás la forma o la altura de un banner, cambia la recomendación.',
          'Al elegir una foto, el editor te avisa (sin frenarte) si se va a ver borrosa, si se le van a recortar bordes o si pesa tanto que va a tardar en cargar con datos móviles.',
          'El carrusel, los banners promocionales, imagen y texto, el pop-up y el hero con video aceptan además una foto (o video) para celular: una versión vertical que se usa en los teléfonos. Sin ella, el celular recorta los costados de la foto de computadora.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Completá siempre el “Texto alternativo”: lo leen los lectores de pantalla de las personas ciegas y lo usa Google para entender la imagen. El editor te avisa si falta.',
          },
        ],
      },
      {
        heading: 'Elegir a dónde lleva un link',
        paragraphs: [
          'Botones, banners, diapositivas y menú usan el mismo selector: “Elegir a dónde lleva”. No hace falta copiar direcciones.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Tipo', 'Cómo se elige'],
            rows: [
              ['Producto', 'Buscás por nombre o SKU entre los productos activos.'],
              ['Categoría', 'Elegís del árbol de categorías.'],
              [
                'Página',
                'Inicio, Productos, Contacto, Favoritos, Términos, Privacidad, Botón de arrepentimiento, o tus páginas de contenido publicadas.',
              ],
              [
                'URL',
                'Cualquier dirección web, un email o una ruta de tu tienda (“/productos?category=…”). Te muestra cómo la va a guardar.',
              ],
              ['WhatsApp', 'Número con código de país y, si querés, un mensaje ya escrito.'],
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Podés marcar “Abrir en pestaña nueva”. Una vez elegido, el selector muestra a dónde lleva (“Producto: …”, “Categoría: …”); si quedó algo que no es una dirección válida, lo marca en rojo como “Link inválido” para que lo cambies.',
          },
        ],
      },
      {
        heading: 'Límites',
        blocks: [
          {
            type: 'checklist',
            items: [
              'Hasta 40 secciones en el inicio. Desde la 35, la lista te muestra cuántas llevás.',
              'Hero con video, Newsletter y Pop-up promocional van una sola vez cada uno (aunque estén ocultos). El selector no te deja agregar un segundo, y si llegara a pasar, la tienda no deja guardar el diseño y te dice cuál sobra.',
              'Cada sección tiene su propio tope de ítems (por ejemplo 20 diapositivas, 40 preguntas o 24 productos elegidos); al llegar, el editor te lo dice.',
              'Los campos de texto muestran un contador cuando te acercás al máximo de caracteres.',
            ],
          },
        ],
      },
      {
        heading: 'Un inicio vacío',
        paragraphs: [
          'Si borrás todas las secciones, el inicio queda vacío a propósito: en la tienda solo se ven el encabezado y el pie. El editor te ofrece arrancar con una plantilla o agregar secciones de a una.',
        ],
      },
    ],
  },

  temaPaginas: {
    title: 'Encabezado, menú, listado, ficha y carrito',
    intro:
      'Las partes fijas de tu tienda: el encabezado con su menú, el listado de productos, la página de cada producto, el carrito y el pie.',
    category: 'Tu tienda online',
    keywords: [
      'header',
      'footer',
      'navbar',
      'mega menu',
      'megamenú',
      'catálogo',
      'ficha de producto',
      'galería',
      'ordenar',
      'filtros',
      'anuncio',
      'barra de anuncios',
      'rotativo',
      'uno por vez',
      'color del encabezado',
      'colores por página',
    ],
    sections: [
      {
        heading: 'Encabezado',
        paragraphs: [
          'Con los estilos rápidos (Clásico, Centrado, Inmersivo o Minimal), cada uno con su dibujito, cambiás todo de una vez. Después elegís la disposición en la computadora (menú al centro, logo al centro, menú junto al logo o menú a la derecha) y el tamaño del logo (chico, mediano o grande), también con su muestra. En el celular el encabezado va siempre igual: el menú (☰) a la izquierda, el logo y los íconos.',
          'En “Colores” van el fondo, el texto e íconos (en Automático usa el que mejor se lee sobre el fondo) y el borde de abajo (ninguno, línea o sombra). En “Comportamiento”: si queda siempre visible al bajar, si en el celular hay menú desplegable (☰) y si va transparente sobre la foto de portada. En “Buscador y carrito”, si se muestran y cómo.',
        ],
        blocks: [
          { type: 'path', segments: ['Canales de venta', 'Tienda online', 'Encabezado'] },
          {
            type: 'callout',
            tone: 'info',
            title: 'Transparente sobre la foto de portada',
            text: 'Solo se ve transparente si tu inicio arranca con un carrusel con fotos o un video de portada: sobre un fondo liso el menú no se leería, así que ahí queda sólido. Sobre la foto el menú va en blanco; podés sumar un velo para fotos claras y subir una versión clara de tu logo.',
          },
        ],
      },
      {
        heading: 'Un color de encabezado distinto según la página',
        paragraphs: [
          'En Encabezado → Colores por página podés darle al encabezado otro color en el inicio, en el listado (y las categorías), en la página de cada producto, en las páginas de contenido (las tuyas, Contacto y las legales) o en el checkout. Por ejemplo: oscuro solo en el inicio y claro en el resto de la tienda.',
          'Cada página arranca en “Igual que el general”. Al destildarlo elegís el fondo, y el texto y los íconos se acomodan solos para que se lean (o los elegís vos). Mientras cambiás uno, la vista previa va a esa página para que lo veas.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Si el encabezado va transparente sobre la foto de portada, arriba de todo sigue transparente; el color del inicio aparece al bajar. La barra de anuncio y los menús desplegables no cambian: mantienen sus colores para que siempre se lean.',
          },
        ],
      },
      {
        heading: 'La barra de anuncio',
        paragraphs: [
          'Es la franja angosta arriba de todo (“Envío gratis desde $50.000”). Se prende con “Mostrar barra de anuncio” en Encabezado → Barra de anuncio: podés cargar varios anuncios, cada uno con su link opcional, y reordenarlos, duplicarlos o borrarlos con el menú ⋯ de cada uno.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Cómo se ven', 'Qué pasa'],
            rows: [
              ['Fijo', 'Todos a la vista, uno al lado del otro.'],
              [
                'Desplazándose',
                'Pasan en fila de derecha a izquierda. Elegís la velocidad: lenta, normal o rápida.',
              ],
              [
                'Uno por vez',
                'Se ve un anuncio solo y cambia al siguiente cada 3 a 10 segundos (vos elegís cuántos en “Cada cuánto cambia”), con flechas para pasarlos. Con un solo anuncio queda fijo.',
              ],
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Lo que se mueve se frena cuando tu cliente pasa el mouse o lo toca, y siempre tiene un botón de pausa. Si en su celular o compu pidió “reducir movimiento”, los anuncios no cambian solos: quedan las flechas para verlos.',
          },
        ],
      },
      {
        heading: 'El menú',
        paragraphs: [
          'En Encabezado → Menú armás el menú principal. Arriba va lo más importante: si no entran todos en una línea, los últimos pasan a un desplegable “Más”.',
        ],
        steps: [
          'Tocá “Agregar al menú” y elegí qué agregar: una categoría, un producto, una página o cualquier link.',
          'Tocá un ítem para cambiarle el nombre (“Nombre en el menú”) o a dónde lleva.',
          'Cada ítem tiene su menú ⋯: “Mover arriba”, “Mover abajo”, “Meter dentro de «…»” para armar un submenú (un solo nivel), “Sacar al primer nivel” para deshacerlo y “Quitar del menú” (los fijos y las páginas se ocultan con el ojo, no se quitan).',
          'En una categoría, prendé “Mostrar subcategorías”: en la computadora abre un menú grande con las subcategorías en columnas (un mega-menú) y en el celular una lista desplegable.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Inicio, Productos, Categorías y Contacto vienen fijos: se pueden ocultar, renombrar y mover, pero no quitar. Las páginas de contenido que publiques aparecen solas al final del menú.',
          },
        ],
      },
      {
        heading: 'Listado de productos',
        paragraphs: [
          'Es la página con todos tus productos y la de cada categoría. Arrancá por los estilos rápidos (Vitrina, Catálogo o Compacto) y ajustá:',
        ],
        blocks: [
          { type: 'path', segments: ['Canales de venta', 'Tienda online', 'Listado de productos'] },
          {
            type: 'table',
            headers: ['Opción', 'Qué elegís'],
            rows: [
              [
                'Orden con el que abre',
                'Más nuevos, menor o mayor precio, nombre A-Z, o Más vendidos primero. Tu cliente lo puede cambiar.',
              ],
              ['Productos por página', '12, 24 o 48.'],
              [
                'Por fila',
                'En la computadora 2, 3 o 4; en el celular 2 columnas o 1 columna con foto grande.',
              ],
              [
                'Fotos',
                'Cuadrada, vertical o apaisada; producto suelto sobre el fondo o dentro de una tarjeta.',
              ],
              [
                'Qué muestra cada producto',
                'Precio, precio tachado, botón “Agregar al carrito”, disponibilidad (“Sin stock” o “¡Últimas N!”) y precio con transferencia.',
              ],
              [
                'Filtros del costado',
                'Categorías, precio (desde / hasta), marca, y color, talle y otras opciones. Cada filtro aparece solo si tus productos tienen ese dato.',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Ofertas y más vendidos en la tienda',
        paragraphs: [
          'Tus clientes ordenan el listado por Más nuevos, Menor precio, Mayor precio, Nombre A-Z o Más vendidos (lo que más se vendió en los últimos 30 días).',
          'Si hay productos con precio tachado, el costado del listado muestra el filtro “Solo ofertas”. Prendido, el listado se titula “Ofertas” (o “Remeras en oferta” dentro de una categoría). Para mandar a alguien directo ahí, linkeá a /productos?onSale=1: es a donde lleva el “Ver todos” de una sección de productos en oferta.',
          'Lo agotado va siempre al final, en cualquier orden: primero todo lo que se puede comprar y después lo que no tiene stock, en el mismo orden que eligió tu cliente. Así la primera página nunca es una pared de “Sin stock”. Y el filtro “Solo con stock” esconde lo agotado del todo; al lado dice cuántos productos quedan.',
          'En el celular los filtros no ocupan la pantalla: arriba del listado hay una barra con “Filtrar” (con cuántos tenés puestos) y “Ordenar”. Los filtros se abren en un panel desde abajo y se aplican con “Ver N productos”.',
        ],
      },
      {
        heading: 'Detalle de producto',
        paragraphs: [
          'La página de cada producto. Estilos rápidos: Simple o Vendedor. El “Estilo de galería” puede ser con miniaturas abajo, miniaturas al costado, o Apilada: todas las fotos grandes, una debajo de la otra (y la información del producto acompaña al bajar), ideal para indumentaria y productos con detalles. En el celular, la apilada se desliza de costado para que el precio y el botón de compra no queden lejos.',
          'Además elegís si se muestran el SKU, el stock, los productos relacionados, los logos de medios de pago y el botón “Consultar por este producto”, que abre WhatsApp con el número del Botón de WhatsApp.',
          'El % de descuento por transferencia y las cuotas sin interés no se cargan en el diseño: se configuran en Configuración → Medios de pago (lo explica el artículo «Transferencia, efectivo y cuotas sin interés»), porque el checkout los tiene que cobrar. La ficha y el listado los muestran solos; en el listado, el precio con transferencia se puede apagar con “Mostrar precio con transferencia”.',
        ],
      },
      {
        heading: 'Carrito de compras',
        paragraphs: [
          'Estilos rápidos: Directo o Con incentivos. Mientras el panel está abierto, la vista previa abre el carrito con un producto de muestra, así ves cada opción. Elegís el texto del botón para pagar, si se muestran productos sugeridos, el botón “Seguir comprando” y el campo de cupón, y un mensaje para tus clientes.',
          '“Mostrar barra de envío gratis” le dice al cliente cuánto le falta para llegar al envío gratis. El monto sale del “Gratis desde” de tus medios de envío (con varios, el más bajo), que es lo que cobra el checkout; si ningún medio lo tiene, la barra no aparece.',
          'El total del carrito dice “Subtotal”: el envío se elige y se suma en el checkout.',
        ],
      },
      {
        heading: 'Pie de página',
        paragraphs: [
          'Estilos rápidos: Mínimo, Completo o En columnas. La disposición puede ser todo al centro o en columnas, y el pie puede tener su propio color de fondo: el texto se ajusta solo para que se lea.',
          'En “Columnas” armás el pie como en las tiendas grandes: qué columnas hay, con qué título y en qué orden, hasta cinco. Hay seis tipos: Marca y redes (tu logo, el texto del pie y los íconos de tus redes), Links (una lista con su título, por ejemplo “Ayuda”, con hasta 12 links elegidos con el selector de links: una categoría, un producto, una página, cualquier dirección o un WhatsApp), Páginas de contenido (las que publicaste, solas), Contacto, Suscripción a novedades y Texto (un párrafo libre, como “Quiénes somos”). Los de marca, páginas, contacto y novedades van una sola vez.',
          'Cada columna es una fila: tocala para cambiarle el título o sus links (los links se ordenan, se renombran y se quitan adentro), y con ⋯ la movés arriba o abajo, le cambiás el nombre o la eliminás. Al abrirla, la vista previa baja hasta el pie y la resalta. Una columna sin nada para mostrar (contacto sin datos, páginas sin publicar) no deja un hueco en la tienda.',
          'En la computadora las columnas van lado a lado, con la de tu marca un poco más ancha; en el celular, una debajo de la otra, y las listas de links quedan plegadas con su título para que el pie no sea un scroll largo. Todo al centro apila las mismas columnas en su orden; ahí el título de una lista solo se ve si le pusiste uno.',
          'Los datos siguen en su lugar del panel y las columnas los muestran: el texto del pie, tus redes (Instagram, Facebook, TikTok, YouTube, X), los logos de medios de pago que marques en “Medios de pago” y tus datos de contacto en “Contacto en el pie” (WhatsApp, direcciones, teléfonos y emails, varios de cada uno). Si tu pie es de antes de las columnas, el editor arma solo las equivalentes y la tienda se ve igual que siempre.',
          'El pie también tiene el Botón de Arrepentimiento y los links legales: esos los pone la tienda sola, porque son obligatorios.',
        ],
      },
      {
        heading: 'Contacto y botón de WhatsApp',
        paragraphs: [
          'En el grupo 5 · Conversión y contacto están el panel Contacto (los datos de la página de contacto y su formulario) y el Botón de WhatsApp (el botón flotante abajo a la izquierda o a la derecha, con un texto opcional al lado, su mensaje inicial y mensajes listos). Los detalles están en los artículos “Información de contacto” y “Botón de WhatsApp”.',
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
