import type { HelpArticle } from './helpContent';

/**
 * Los 23 tipos de sección del inicio, uno por uno. Vive aparte del artículo
 * del editor porque es un catálogo: se entra a buscar "¿cómo era el pop-up?",
 * no se lee de corrido.
 */
export const SECCIONES = {
  temaSecciones: {
    title: 'Los tipos de sección del inicio',
    intro:
      'Las 23 secciones con las que armás tu página de inicio: qué hace cada una, qué le cargás y qué hace sola en la tienda.',
    category: 'Tu tienda online',
    keywords: [
      'popup',
      'slider',
      'banner',
      'hero',
      'countdown',
      'cuenta regresiva',
      'temporizador',
      'reseñas',
      'opiniones',
      'logos',
      'youtube',
      'vimeo',
      'reel',
      'shorts',
      'mp4',
      'faq',
      'suscripción',
      'mosaico',
      'beneficios',
    ],
    sections: [
      {
        heading: 'Las 23 de un vistazo',
        paragraphs: [
          'En el editor, “Agregar sección” las muestra agrupadas así, con una miniatura de cómo se ven. Cómo se agregan, se ordenan y se renombran está en el artículo “Armar el inicio de tu tienda”.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Grupo', 'Sección', 'Para qué'],
            rows: [
              [
                'Imágenes',
                'Hero con video',
                'Un video a pantalla completa con título y botón para abrir la portada. Una por página.',
              ],
              [
                'Imágenes',
                'Carrusel de imágenes',
                'Fotos grandes a todo el ancho que se pasan solas, cada una con su texto y su link.',
              ],
              ['Imágenes', 'Banners promocionales', 'Imágenes con promos o campañas, cada una con su link.'],
              [
                'Imágenes',
                'Banners de categorías',
                'Una imagen por categoría con su nombre encima, que lleva a esa categoría.',
              ],
              ['Imágenes', 'Video', 'Un video de YouTube, de Vimeo o subido por vos, con título y botón.'],
              [
                'Imágenes',
                'Collage',
                'Dos o tres bloques (imagen, producto o categoría): uno grande y los otros al lado.',
              ],
              [
                'Productos',
                'Productos destacados',
                'Lo más vendido, una categoría, una marca o los que elijas, en grilla o carrusel.',
              ],
              ['Productos', 'Productos nuevos', 'Lo último que cargaste, o los productos que elijas.'],
              ['Productos', 'Productos en oferta', 'Los productos con precio tachado, o los que elijas.'],
              [
                'Productos',
                'Ofertas con cronómetro',
                'Productos en oferta con una cuenta regresiva hasta que termina la promo.',
              ],
              [
                'Productos',
                'Producto destacado',
                'Un solo producto grande, con foto, precio y botón de compra.',
              ],
              [
                'Productos',
                'Categorías principales',
                'Tus categorías con foto, en grilla o carrusel, para entrar directo.',
              ],
              ['Contenido', 'Mensaje institucional', 'Un título y un texto corto sobre tu marca.'],
              ['Contenido', 'Módulo de imagen y texto', 'Una imagen al lado de un texto con botón.'],
              [
                'Contenido',
                'Preguntas frecuentes',
                'Preguntas y respuestas desplegables, que además ayudan en Google.',
              ],
              [
                'Contenido',
                'Pop-up promocional',
                'Una ventana con una promo o un cupón que aparece al entrar o al irse. Una por página.',
              ],
              [
                'Contenido',
                'Texto con formato',
                'Un texto largo con títulos, listas, links y citas; con imagen y botón si querés.',
              ],
              [
                'Confianza',
                'Información de envíos, pagos y compra',
                'Íconos con envíos, medios de pago y compra protegida.',
              ],
              ['Confianza', 'Testimonios de clientes', 'Opiniones de clientes con nombre, foto y estrellas.'],
              ['Confianza', 'Marcas que vendemos', 'Los logos de las marcas que vendés.'],
              [
                'Confianza',
                'Íconos con texto',
                'Columnas con un ícono, un título y un texto corto: beneficios, pasos, garantías.',
              ],
              ['Contacto', 'Newsletter', 'Un formulario para que te dejen el email. Una por página.'],
              [
                'Contacto',
                'Instagram / Video',
                'Un video de YouTube o Vimeo, o una publicación de Instagram.',
              ],
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Tres van una sola vez',
            text: 'El hero con video, el newsletter y el pop-up promocional pueden estar una sola vez en el inicio. Si ya hay uno, el selector lo muestra apagado con el aviso “Ya está en tu inicio: va una sola.” y no deja duplicarlo. Cuenta también si está oculto.',
          },
        ],
      },
      {
        heading: 'Lo que tienen todas',
        paragraphs: [
          'Cada sección tiene un “Nombre de la sección” que solo ves vos, para reconocerla en la lista, y abajo de todo un bloque plegable “Diseño de la sección” con las mismas opciones para todas.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Opción de “Diseño de la sección”', 'Qué elegís'],
            rows: [
              ['Mostrar en', 'Celulares y computadoras, Solo en celulares o Solo en computadoras.'],
              ['Fondo', 'Sin fondo, Gris suave, Color de la marca tenue, u Otro color que elegís vos.'],
              [
                'Espacio arriba / Espacio abajo',
                'Normal, Sin espacio, Chico, Mediano o Grande. Sirve para pegar o separar dos secciones.',
              ],
              ['Alineación de los títulos', 'Como viene, A la izquierda o Centrados.'],
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Un título vacío no se muestra',
            text: 'En las secciones de productos, preguntas frecuentes, testimonios, newsletter y mensaje institucional, si borrás el título la sección queda sin encabezado. Es a propósito: el campo te avisa “Dejalo vacío para no mostrar título.”',
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Un botón sin link no aparece',
            text: 'Los botones y los links que no tienen a dónde llevar no se dibujan en la tienda, en vez de quedar como un botón que no hace nada. Si un botón no se ve, revisá que tenga texto y un “A dónde lleva”.',
          },
        ],
      },
      {
        heading: 'Hero con video',
        paragraphs: [
          'Un video de fondo a todo el ancho, con título, subtítulo y hasta dos botones. Cargá el video en WebM (recomendado) y en MP4 (para los navegadores que no leen WebM), y si querés uno vertical para el celular.',
          'La “Imagen de respaldo” es lo que se ve mientras carga y lo que ve quien tiene el ahorro de datos o el “reducir movimiento” activado: a esas personas no se les baja el video. Siempre hay un botón de pausa.',
          'Elegís la posición del texto, si el texto va claro (para videos oscuros) u oscuro, cuánto se oscurece o aclara el fondo para que se lea, y la altura: Baja, Media, Grande o Pantalla completa. Sin link, el botón lleva a todos los productos; el segundo botón aparece recién cuando le ponés link.',
        ],
      },
      {
        heading: 'Carrusel de imágenes',
        paragraphs: [
          'Cada diapositiva tiene su foto, una “Foto para celular” opcional, el texto alternativo, un título, un subtítulo, un botón y “A dónde lleva”. Si la diapositiva tiene botón, el link lo abre el botón y también tocar la foto; si no, tocar la foto. Con “Subir varias fotos de una vez” armás el carrusel entero de un saque.',
          'Opciones del carrusel: “Pasar solas” con el “Tiempo de cada diapositiva” (de 3 a 9 segundos), el alto en computadora y en celular (Según la foto, sin recortes; Baja; Media; Alta o Pantalla completa), las “Flechas (en computadora)” y los “Puntos para pasar”.',
        ],
        blocks: [
          {
            type: 'checklist',
            items: [
              'En el celular se pasa deslizando con el dedo; las flechas se ven solo en computadora.',
              'Se frena solo cuando alguien lo toca o pasa el mouse, y siempre tiene botón de pausa.',
              'También se maneja con las flechas del teclado.',
              'A quien tiene activado “reducir movimiento” no se le pasa solo.',
              'Las diapositivas sin foto no se muestran. Sin ninguna, la sección muestra el nombre de tu tienda con un botón “Ver productos”.',
            ],
          },
        ],
      },
      {
        heading: 'Banners promocionales y banners de categorías',
        paragraphs: [
          'Los dos son una grilla de imágenes con link. En los promocionales elegís cuántos van por fila en computadora (1 a 4) y en celular (1 o 2), la forma de las imágenes (también una distinta para el celular) y si se extienden al ancho de la pantalla. Cada banner tiene foto, foto para celular, título, descripción, botón y link, y se puede apagar con “Mostrar banner” sin borrarlo.',
          'En los banners de categorías elegís la categoría y el editor completa solo el nombre, el link y una foto tomada de un producto de esa categoría; después la cambiás si querés.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Textos cortos: la descripción de un banner promocional se corta a las dos líneas (el editor avisa pasados los 90 caracteres), y el nombre de una categoría conviene que no pase de 24.',
          },
        ],
      },
      {
        heading: 'Video',
        paragraphs: [
          'En “De dónde sale el video” elegís entre un link de YouTube o Vimeo o un video tuyo en MP4. El link puede ser el de compartir, el de la barra del navegador, un Short o un Vimeo privado: el editor te dice si lo reconoció.',
          'Los videos de YouTube y Vimeo se cargan recién cuando alguien toca reproducir: hasta ese momento se ve la portada con un botón de play, y tu inicio no se pone lento. Un MP4 subido puede “Reproducir solo, sin sonido y en loop”, con botón de pausa.',
          'La “Proporción” puede ser Horizontal (16:9), Clásico (4:3), Cuadrado (1:1) o Vertical, tipo reel (9:16). Si pegás un Short, el editor te sugiere pasarlo a vertical.',
        ],
      },
      {
        heading: 'Collage',
        paragraphs: [
          'Dos o tres bloques: uno grande y los otros al costado. Cada bloque puede ser una imagen con link, un producto o una categoría. Para un producto o una categoría, la imagen y el texto son opcionales: si los dejás vacíos se usan la foto y el nombre de lo que elegiste.',
          'Elegís si el bloque grande va a la izquierda o a la derecha, y en el celular si van uno debajo del otro o deslizando de costado.',
        ],
      },
      {
        heading: 'Productos destacados, nuevos y en oferta',
        paragraphs: [
          'Las tres funcionan igual; cambia lo que muestran si no tocás nada: las destacadas muestran lo más vendido, las de nuevos lo último que cargaste y las de oferta los productos con precio tachado.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['“Qué productos mostrar”', 'Qué hace'],
            rows: [
              [
                'Elegidos a mano',
                'Hasta 24 productos que elegís vos, en el orden en que los pongas. Los que despublicás se saltean solos.',
              ],
              ['De una categoría', 'Los de una categoría, con la opción de incluir sus subcategorías.'],
              [
                'De una marca',
                'Los de una marca, escrita como la tenés en tus productos (no importan las mayúsculas).',
              ],
              ['Los más nuevos', 'Lo último que cargaste.'],
              ['En oferta', 'Los que tienen precio tachado.'],
              [
                'Los más vendidos',
                'Los que más unidades vendieron en los últimos días que elijas (30 si no tocás nada). Si todavía no hay ventas, se muestran los más nuevos.',
              ],
            ],
          },
          {
            type: 'checklist',
            items: [
              '“Cantidad de productos”: de 1 a 24 (8 si no tocás nada).',
              '“Orden”, para las de categoría, marca y oferta: más nuevos primero, por precio o por nombre.',
              '“Cómo se muestran”: carrusel que se desliza, o grilla.',
              '“Columnas en computadora” (2 a 5) y “Columnas en el celular” (1 columna con foto grande, o 2), o igual que el listado de productos.',
              '“Mostrar el link Ver todos”, con su texto y a dónde lleva.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'A dónde va “Ver todos” si no le elegís link',
            text: 'Al listado ya filtrado como la sección: la categoría, la marca, los más nuevos, el listado de Ofertas (con el filtro “Solo ofertas” prendido) o el listado ordenado por “Más vendidos”. Si los productos son elegidos a mano, va al catálogo completo.',
          },
          {
            type: 'callout',
            tone: 'tip',
            text: 'Una sección de productos que se queda sin productos (una categoría vacía, una oferta que terminó) no se muestra en la tienda. En la vista previa del editor sí aparece, con el motivo, para que sepas por qué.',
          },
        ],
      },
      {
        heading: 'Ofertas con cronómetro',
        paragraphs: [
          'Una cuenta regresiva (días, horas, minutos y segundos) arriba de una tanda de productos. En “Termina el” ponés la fecha y la hora, siempre en hora argentina. Los productos se eligen como en las otras secciones de productos: los que están en oferta, los que elijas vos, una categoría, una marca, lo último que cargaste o los más vendidos.',
          'En “Cuando termina” decidís qué pasa al llegar a cero: “Ocultar la sección” la saca del inicio sola, y “Mostrar un mensaje” deja el título con un texto tuyo (“Esta oferta terminó.”) y esconde los productos y el reloj.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'El cronómetro solo cuenta: no cambia ningún precio. El precio de oferta lo ponés en cada producto (el precio tachado), y lo sacás vos cuando termina la promo.',
          },
        ],
      },
      {
        heading: 'Producto destacado',
        paragraphs: [
          'Un solo producto, grande, con su foto, su precio (y el tachado con el porcentaje de descuento si está en oferta) y un botón que puede ser “Agregar al carrito” o “Ver producto”. Si no elegís ninguno se muestra el más vendido.',
          'La “Etiqueta” es el cartelito de arriba (“Elegido del mes”); vacía, no aparece. Si el producto tiene talles o colores, el botón lleva a su página para que el cliente elija.',
        ],
      },
      {
        heading: 'Categorías principales',
        paragraphs: [
          'Muestra tus categorías principales automáticamente, en el orden que tienen en Productos → Categorías, o las que elijas vos, con un nombre y una foto propios si querés. Una categoría sin foto muestra su inicial.',
          'Elegís grilla o carrusel, la forma de la foto (círculo, cuadrada o vertical), cuántas van por fila en computadora y en celular, y un botón “Ver todas” que lleva al listado de productos. Si borrás una categoría, desaparece sola de la sección.',
        ],
      },
      {
        heading: 'Mensaje institucional, imagen y texto, texto con formato',
        paragraphs: [
          'El mensaje institucional es un título y un texto corto, con un botón opcional que se muestra cuando tiene texto y link.',
          'El módulo de imagen y texto pone una foto al costado de un texto con botón. Elegís si la imagen va a la izquierda o a la derecha en computadora, qué va primero en el celular (la imagen o el texto), la altura del texto respecto de la imagen, el fondo del texto y el estilo del botón (relleno, con borde o link subrayado).',
          'El texto con formato es para textos largos: títulos, listas, links y citas, con una imagen opcional a la izquierda, a la derecha o arriba (en el celular siempre va arriba).',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'En imagen y texto, si elegís texto claro sobre un fondo que no es oscuro, la tienda le pone sola un recuadro oscuro detrás para que se pueda leer. El editor te lo avisa.',
          },
        ],
      },
      {
        heading: 'Preguntas frecuentes',
        paragraphs: [
          'Preguntas y respuestas que se despliegan al tocarlas, hasta 40. Podés dejar la primera abierta. Una pregunta sin respuesta (o al revés) no se muestra.',
          'Además de ahorrarte consultas, le avisan a Google que esa página tiene preguntas y respuestas, y Google a veces las muestra directo en los resultados de búsqueda.',
        ],
      },
      {
        heading: 'Pop-up promocional',
        paragraphs: [
          'Una ventana que aparece encima de la página con una imagen, un título, un texto y un botón. Puede mostrar un cupón con un botón “Copiar” (el cupón lo creás antes en Cupones) y pedir el email para el newsletter.',
          '“Cuándo aparece”: a los pocos segundos de entrar (elegís cuántos), cuando el mouse se va de la página (solo en computadora) o lo que pase primero. “Cada cuánto se muestra a la misma persona”: cada tantos días, una vez por visita o una sola vez.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Nunca aparece en el checkout ni en la cuenta del cliente: un pop-up en el medio del pago es la forma más rápida de perder una venta. Tampoco se abre si ya hay otra ventana abierta. Va uno solo por página.',
          },
        ],
      },
      {
        heading: 'Envíos y pagos, testimonios, marcas e íconos con texto',
        paragraphs: [
          '“Información de envíos, pagos y compra” muestra hasta 4 ítems con un ícono (envíos, tarjetas, seguridad, regalo, promo, atención, cambios, o uno propio), un título, una descripción y un link opcional. En el celular van uno abajo del otro, de a dos o deslizables.',
          'Los testimonios llevan la opinión, de 1 a 5 estrellas (o sin estrellas), el nombre, un detalle (“Compró en marzo”) y una foto opcional; sin foto se muestra la inicial. Se ven en grilla o en carrusel.',
          'Las marcas son logos con su nombre y un link opcional. Con “Subir varios logos de una vez” cargás todos juntos. Se pueden mostrar fijos o deslizándose (con velocidad lenta, normal o rápida, y botón de pausa), y en gris hasta que pasás el mouse.',
          'Íconos con texto son columnas con un ícono (o una imagen tuya), un título, un texto y un link: beneficios, pasos de compra, garantías. Elegís de 2 a 6 columnas en computadora y cómo se acomodan en el celular.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Testimonios reales',
            text: 'Los textos de ejemplo de una sección nueva de testimonios están para que los reemplaces. Publicar opiniones inventadas es publicidad engañosa, y un cliente que lo nota no vuelve: usá las de clientes de verdad.',
          },
        ],
      },
      {
        heading: 'Newsletter',
        paragraphs: [
          'Un formulario para que te dejen el email, con título, texto, una imagen opcional (al costado o todo centrado), el mensaje que ven al suscribirse y una letra chica. Los emails que deja la gente entran a la audiencia de tus campañas de email.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Si también tenés la suscripción prendida en el pie de página, el editor te avisa: dos formularios iguales en la misma página confunden. Se saca desde el panel Pie de página.',
          },
        ],
      },
      {
        heading: 'Instagram / Video',
        paragraphs: [
          'Pegá el link de un video de YouTube (también Shorts), de Vimeo o de una publicación o reel de Instagram, y el editor te dice qué reconoció. Para los videos elegís la proporción; en Automático, los Shorts se ven verticales.',
          'Si pegás el link de un perfil de Instagram, se muestra una tarjeta con un botón “Ver perfil”: Instagram no deja mostrar el feed completo en otro sitio. Un link que no se reconoce no se muestra en la tienda.',
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
