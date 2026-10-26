import type { HelpArticle } from './helpContent';

export const CATALOGO = {
  productos: {
    title: 'Productos e inventario',
    intro: 'Cargá tu catálogo con variantes, fotos y stock, y mantenelo al día sin esfuerzo.',
    category: 'Catálogo',
    sections: [
      {
        heading: 'Cargar un producto',
        steps: [
          'En Productos, tocá “Agregar producto” y cargá nombre, descripción, marca (se usa como filtro en la tienda), precio y fotos. La primera foto es la portada y sale en los emails; con las flechas cambiás el orden.',
          'Si tiene talles o colores, marcá “Este producto tiene variantes” y cargá hasta tres opciones: cada combinación tiene su propio SKU, precio, código de barras y stock.',
          'Cargá el stock: sin variantes, en “Inventario” elegí “Limitado” y escribí la cantidad; con variantes, en la columna Stock de cada combinación.',
          'En “Envío”, cargá el peso y las medidas del paquete de una unidad: con eso cotizan los correos en el checkout.',
          'Asignale categorías para que aparezca en los filtros de tu tienda.',
          'Marcá “Mostrar en la tienda” y tocá “Guardar producto”. Sin esa marca queda en borrador: los borradores y los archivados no se ven en la tienda.',
        ],
        blocks: [
          { type: 'path', segments: ['Productos', 'Agregar producto'] },
          {
            type: 'callout',
            tone: 'info',
            title: 'Stock “Sin límite” o “Limitado”',
            text: 'Con “Sin límite” el producto se puede comprar siempre: no se agota, no se aparta al pagar y las ventas no le descuentan nada (sirve para lo que se hace a pedido o no se cuenta). Con “Limitado” cargás cuántas unidades hay. Lo cambiás cuando quieras al editar el producto (la casilla “Sin límite” debajo del stock), y en Inventario o en el Escáner, escribiendo un número, pasa a limitado.',
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Las combinaciones se arman al crear el producto',
            text: 'En “Editar producto” cambiás el precio, el promocional, el stock, el código de barras y el paquete de cada variante, pero no se agregan ni se quitan combinaciones.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'La descripción, con IA',
            text: 'Debajo de “Descripción” está “Escribir con IA”: arma un borrador a partir del nombre del producto, que después corregís. Aparece cuando ya escribiste el nombre, y solo si tu tienda cargó la clave de IA. Si tenés muchos productos para mejorar, mirá “Fichas con IA en lote”, más abajo.',
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Precio promocional = oferta',
            text: 'Si cargás un “Precio promocional”, la tienda cobra ese y muestra el precio normal tachado. Un producto así cuenta como “en oferta” en toda la tienda: entra al filtro “Solo ofertas” del listado y a las secciones de productos en oferta del inicio.',
          },
        ],
      },
      {
        heading: 'La lista de productos',
        paragraphs: [
          'La búsqueda no distingue tildes ni el orden de las palabras: “remera negra” encuentra “Remera Negra Oversize” y “negra remera” también. También busca por SKU. Con “Filtrar” acotás por categoría, stock, promoción, estado o sin foto, y al lado elegís el orden. Los filtros, la búsqueda y la página se recuerdan mientras trabajás.',
          'Arriba de la lista, los recuadros “Publicados”, “En borrador” y “Sin foto” te dicen qué falta completar: tocá uno para filtrar por eso. “Sin costo cargado” te lleva a Productos → Costos con las variantes que no tienen costo.',
          'El precio y el promocional de cada variante se cambian ahí mismo, en la fila: se guardan al salir del campo. En el celular, desde el menú ⋮ del producto → “Cambiar precio”.',
          'El menú ⋮ de cada producto también tiene “Publicar” o “Archivar”, “Eliminar” y “Duplicar”: crea “Copia de …” en borrador, con las mismas fotos, variantes, precios y categorías, sin stock ni códigos de barras.',
          'Tildá varios productos para Publicar, Archivar o Eliminar en lote. Al terminar te dice cuántos salieron bien y cuáles no, y por qué.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Eliminar todo el catálogo',
            text: 'Solo el dueño de la tienda ve, en el menú ⋮ de arriba de la lista (“Más acciones”), “Eliminar todos los productos”. Pide escribir ELIMINAR para confirmar y no se puede deshacer: antes, bajate una copia con “Exportar e importar”.',
          },
        ],
      },
      {
        heading: 'Fichas con IA en lote',
        paragraphs: [
          'Si tenés muchos productos sin descripción, con descripciones cortas o sin los datos que pide Mercado Libre, la IA te los puede mejorar de a muchos. Elegí hasta 500 productos con las casillas de la lista (o sin elegir ninguno, filtrando por lo que les falta) y tocá “Mejorar con IA”. Este botón aparece solo si tu tienda ya cargó la clave de IA en Configuración → Inteligencia artificial y tiene una cuenta de Mercado Libre conectada.',
          'Antes de empezar te dice cuántos productos son, cuánto va a costar (es un estimado, no el cobro final) y cuánto te queda del tope del mes. Si el tope no alcanza para todos, el trabajo se pausa solo al llegar y lo reanudás cuando lo subas o cuando empiece el mes siguiente.',
          'Para cada producto, la IA escribe la descripción y el texto para Google, y completa los datos de la categoría de Mercado Libre (marca, modelo, medidas, color…) usando solo lo que ya figura en tu producto. Después otro modelo de IA revisa lo que escribió y, si encuentra algo que no figura en tu producto, lo vuelve a escribir una vez.',
          'Nada cambia hasta que vos lo aprobás. En “Fichas con IA” ves cada ficha con lo que tenés hoy al lado de lo que propone la IA: podés corregir el texto, completar a mano lo que le falta para Mercado Libre y tocar “Aprobar”, o “Descartar” si no te sirve. “Aprobar todos los que pasaron” guarda de una vez las que el evaluador dio por buenas.',
          'Al aprobar, la descripción y los datos de la ficha se guardan en tu tienda; lo que solo usa Mercado Libre queda aparte, sin llenar la ficha que ve el comprador. Mercado Libre no cambia hasta que vos lo pidas con “Actualizar la ficha en ML” (por producto, o para todos los aprobados), y solo para los productos que ya tienen una publicación vinculada.',
        ],
        blocks: [
          { type: 'path', segments: ['Productos', 'Fichas con IA'] },
          {
            type: 'callout',
            tone: 'info',
            title: 'Códigos y modelos: la IA no los inventa',
            text: 'El código de barras (GTIN), el modelo o el número de parte solo se completan si figuran tal cual en tu producto. Si no, aparecen en “Le falta para Mercado Libre” para que los cargues vos; si escribís un código de barras con el dígito verificador mal, no te deja aprobar.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Si hay productos que esperan categoría',
            text: 'Cuando Mercado Libre no tiene clara la categoría de un producto, queda en “Elegí la categoría” y no se gasta IA hasta que elijas una (entre las sugeridas o buscando). Después sigue solo.',
          },
        ],
      },
      {
        heading: 'Inventario y reservas',
        paragraphs: [
          'El stock se controla por variante en Productos → Inventario: ahí ves lo disponible y lo reservado, y lo ajustás a mano (escribís el número y tocás “Guardar”; hace falta el permiso “Ajustar el stock”). Cuando un cliente inicia el pago, su stock se reserva; si no paga en 30 minutos, la reserva se libera sola — nunca vendés lo que no tenés. Si eligió transferencia o efectivo, la reserva dura lo que configuraste para esos pagos (48 horas de fábrica).',
          'Arriba tenés las unidades en depósito, cuánto vale ese stock a costo, cuántas variantes están sin stock y cuántas quedan con 5 o menos: tocá uno de esos dos para ver solo esos productos. Las variantes con stock sin límite dicen “Sin límite” y no entran en esas cuentas: nunca se agotan.',
          'El stock es uno solo para todos los canales: si sincronizás el stock con Mercado Libre, una venta de ML también lo descuenta (y si se cancela, vuelve). Lo explica el artículo «Integración con Mercado Libre».',
          'Para saber por qué una variante tiene el stock que tiene, tocá el reloj al final de su fila: se abre su historial, del cambio más nuevo al más viejo. Cada renglón dice qué pasó (alta, ajuste, apartado por una compra, venta cobrada, o stock que volvió porque la compra se canceló o no se pagó a tiempo), cuánto entró o salió, el motivo, y —si fue una venta— un link a esa venta. Muestra los últimos 50 movimientos.',
        ],
        blocks: [
          { type: 'path', segments: ['Productos', 'Inventario'] },
          {
            type: 'callout',
            tone: 'info',
            title: 'Anti-sobreventa',
            text: 'Dos clientes no pueden pagar la última unidad a la vez: el primero que inicia el pago la reserva; el segundo ve “sin stock” hasta que la reserva se libere.',
          },
          {
            type: 'callout',
            tone: 'warning',
            title: 'Si el stock cambió mientras lo editabas',
            text: 'En Inventario, en el producto y en el Escáner, si entra una venta o una compra mientras tenés el stock abierto, al guardar no se pisa: te avisa “El stock cambió mientras editabas: ahora hay N.” Revisá el número nuevo y guardá de nuevo.',
          },
        ],
      },
      {
        heading: 'Categorías',
        paragraphs: [
          'En Productos → Categorías armás cómo se organiza el catálogo: “Crear categoría” y, para una subcategoría, elegí la “Categoría padre” (hasta 3 niveles) o usá “Agregar subcategoría” en el menú ⋮ de la categoría.',
          'Ese mismo menú tiene “Editar nombre” (la dirección de la categoría no cambia al renombrarla), “Ver en la tienda” y “Eliminar”: los productos no se borran, solo pierden esa categoría. El ícono de copiar (“Duplicar”) crea otra igual con sus subcategorías, sin productos.',
          'Para cambiar el orden, arrastrá cada categoría desde su manija (entre las de un mismo nivel) y tocá “Guardar orden”. Queda guardado en la tienda: el menú «Categorías», las subcategorías del menú y la sección de categorías del inicio las muestran en ese orden. Una categoría nueva va al final de su nivel.',
          'Cada producto elige sus categorías en su edición, o con la columna «Categorías» de la planilla. Qué categorías aparecen en el menú de la tienda, y en qué orden, se arma en el editor de diseño: lo explica el artículo «Encabezado, menú, listado, ficha y carrito».',
        ],
        blocks: [{ type: 'path', segments: ['Productos', 'Categorías'] }],
      },
      {
        heading: 'Costos de cada variante',
        paragraphs: [
          'En Productos → Costos cargás cuánto te cuesta cada variante y ves su margen al precio actual. De ahí sale la ganancia de Estadísticas → Rentabilidad: lo explica el artículo «Rentabilidad real». Si cargás tus compras en Compras e importaciones, el costo se actualiza solo al recibir la mercadería.',
        ],
        blocks: [{ type: 'path', segments: ['Productos', 'Costos'] }],
      },
      {
        heading: 'Subir o bajar precios en masa',
        paragraphs: [
          'En Productos → Costos, “Repreciar en masa” cambia los precios de todo el catálogo o de una categoría con un porcentaje (+ sube, − baja) y un redondeo: terminación $990, al $1.000 o al $100 más cercano, o sin redondeo. Los precios tachados se ajustan en la misma proporción, así una oferta sigue siendo oferta. Los productos archivados no se tocan.',
          'El botón lo ve quien tiene el permiso “Listas de precios y repreciación”.',
        ],
        blocks: [
          { type: 'path', segments: ['Productos', 'Costos', 'Repreciar en masa'] },
          {
            type: 'callout',
            tone: 'warning',
            text: 'Se aplica a la tienda al instante y no se deshace en bloque. Si sincronizás precios con Mercado Libre, también viaja a tus publicaciones (con tu recargo). Probalo primero con una categoría chica.',
          },
        ],
      },
      {
        heading: 'Importación y exportación masiva',
        paragraphs: [
          'En la lista de productos, “Exportar e importar” baja todo tu catálogo a una planilla (CSV) para editarlo en Excel o Google Sheets y volver a subirlo. También sirve para migrar desde otra plataforma. La solapa Exportar trae todas las variantes con precio, promocional, costo, SKU, código de barras, peso, medidas y las direcciones de las fotos, y de cada producto sus categorías, su marca y lo que cargaste para buscadores (SEO); las descripciones van si dejás marcado “Incluir descripciones”. El stock no viaja en la exportación: esa columna sale vacía.',
          'En la solapa Importar podés bajar una “Plantilla vacía” o una “Plantilla con ejemplos”, completarla y subirla (hasta 20.000 líneas por archivo). Cada producto se reconoce por su «Identificador de URL»: si ya existe y está marcado “Modificar productos ya existentes”, se actualizan su nombre, descripción, marca, categorías y SEO, y de cada variante que coincide por SKU el precio, el promocional, el costo, el código de barras, el peso y las medidas. A un producto que ya existe no se le suman variantes ni fotos, ni cambia si se muestra en la tienda. Con “Actualizar stock”, el número de la columna Stock pisa el que hay.',
          'Al modificar un producto, una celda vacía no borra nada: ese dato queda como estaba, y lo mismo si la columna no está en el archivo. Así podés subir una planilla con solo SKU y Precio, o volver a subir lo que exportaste sin cambiar nada. La única excepción es «Precio promocional»: si la columna está y la celda va vacía, la variante queda sin oferta.',
          'En «Categorías», la jerarquía va con > y varias categorías se separan con punto y coma: “Indumentaria > Remeras; Ofertas”. Las que no existen se crean solas.',
          'Las fotos entran de dos maneras: por URL en la columna «Imágenes» de la planilla (se descargan y quedan guardadas en tu tienda), o desde la solapa Imágenes, subiendo los archivos o un .zip. Ahí se asocian solas si el nombre del archivo es el identificador de URL del producto (remera-oversize.jpg, remera-oversize-2.jpg para la segunda); si no lo encuentra, prueba con el SKU. Para un catálogo grande, sumá un CSV de mapeo con las columnas «Identificador de URL» y «Archivos» y la asociación es exacta.',
        ],
        blocks: [{ type: 'path', segments: ['Productos', 'Exportar e importar'] }],
      },
    ],
  },

  kits: {
    title: 'Kits y combos',
    intro:
      'Vendé combos ("Kit barra + discos") sin que el stock mienta: al venderse el kit, las piezas que lo componen se descuentan solas.',
    category: 'Catálogo',
    sections: [
      {
        heading: 'Cómo funciona',
        paragraphs: [
          'El kit es un producto normal del catálogo, con su precio y su propio stock (los combos pre-armados que tenés en el depósito). En Productos → Kits y combos le definís los componentes: qué variantes lo integran y cuántas unidades de cada una.',
          'Cuando un cliente compra el kit, además del stock del kit se descuenta el de cada componente. Así el kit y las piezas sueltas dejan de venderse por separado sin enterarse el uno del otro. Si la venta se devuelve con reingreso de stock, vuelven también las piezas. Lo mismo pasa con las ventas de Mercado Libre si sincronizás el stock.',
        ],
        steps: [
          'En Productos → Kits y combos, en “Convertir un producto en kit”, buscá la variante que se vende como kit.',
          'Agregá sus componentes con la cantidad de cada uno y tocá “Guardar kit”.',
          'La tabla te muestra cada kit con sus piezas y, si podés ver costos, el costo de los componentes: una buena base para el costo del kit.',
          'Para cambiarlo, “Editar”. Si le quitás todos los componentes y guardás, deja de ser un kit.',
        ],
        blocks: [{ type: 'path', segments: ['Productos', 'Kits y combos'] }],
      },
      {
        heading: 'Límites a tener en cuenta',
        paragraphs: [
          'Un componente no puede ser a su vez un kit (sin kits anidados). El descuento de componentes ocurre al confirmarse el pago, y el stock de una pieza nunca queda en negativo: si no alcanzaba, queda en cero y conviene revisarla en Inventario.',
        ],
      },
    ],
  },

  escaner: {
    title: 'Escáner de depósito',
    intro:
      'La cámara del celular como lectora de códigos: buscá productos al instante, prepará pedidos sin errores de despacho y hacé conteos sin planillas.',
    category: 'Catálogo',
    sections: [
      {
        heading: 'Códigos de barras y etiquetas',
        paragraphs: [
          'Cada variante puede tener su código de barras: el EAN que ya trae el paquete del proveedor (columna «Código de barras» del CSV, o asignándolo desde el propio escáner) o una etiqueta QR generada por el sistema.',
          'Desde Inventario, “Etiquetas QR de esta página” baja una plancha A4 con una etiqueta por cada variante de la página que estás viendo: nombre, SKU, precio y un QR con su código de barras (o su SKU, si no tiene). Sirve para los productos que no traen código.',
        ],
        blocks: [{ type: 'path', segments: ['Productos', 'Escáner'] }],
      },
      {
        heading: 'Buscar y ajustar',
        paragraphs: [
          'Escaneá (o tipeá) un código de barras o un SKU y ves el producto con su stock y su ubicación en el depósito (“Ubicación (ej. B3)”). Ajustás el stock o la ubicación ahí mismo. Si el código no existe, el escáner te ofrece asignárselo a una variante buscándola por su SKU (“Asignar código”) — así se etiqueta el catálogo la primera vez, paquete en mano.',
        ],
      },
      {
        heading: 'Preparar pedido (anti errores de despacho)',
        steps: [
          'En la solapa “Preparar pedido”, elegí un pedido pagado sin despachar: aparece con su número de pedido (#1042) y el email del comprador. La lista trae los 100 más recientes; para uno más viejo, buscalo por número o email.',
          'Escaneá cada producto al meterlo en la caja (o tipeá el código): la lista marca en verde lo juntado.',
          'Si escaneás algo que NO va en ese pedido, la alerta salta antes de despachar — se acabó mandar el disco de 15 kg en vez del de 25.',
          'Con todo verificado aparece “Pedido completo y verificado.”: cargá el número de seguimiento si lo tenés y tocá “Marcar enviada”. Si el comprador retira en el local, el botón es “Lista para retirar” y no pide seguimiento. El comprador recibe el aviso en el momento, sin pasar por la computadora.',
          'Para muchos pedidos juntos (picking de varios, etiquetas y remitos en lote) está Ventas › Despacho.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Marcar enviada (o lista para retirar) desde el escáner pide el permiso “Despachar pedidos”. Sin él, el escáner te deja preparar el pedido y te pide que lo marque alguien que pueda despachar.',
          },
        ],
      },
      {
        heading: 'Conteo',
        paragraphs: [
          'Recorré una estantería escaneando unidad por unidad (o cargando cantidades). Al final ves las diferencias contra el sistema y “Aplicar ajustes” los guarda, con su movimiento en el historial de stock. Si mientras contabas se vendió algo de lo contado, ese producto no se pisa: te avisa para que lo revises.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'La columna “Sistema” es el stock disponible: no incluye lo apartado por compras en curso ni lo vendido que todavía no despachaste, aunque siga en el estante. Contá cuando esos pedidos ya salieron (o no cuentes esas unidades), o el ajuste va a sumar de más.',
          },
        ],
      },
      {
        heading: 'El escáner en la pantalla del celular',
        paragraphs: [
          'Desde el navegador del celular, usá “Agregar a la pantalla de inicio”: el panel queda como una app más y abre directo en el Escáner. La cámara lee códigos en los navegadores tipo Chrome; en los demás, tipeás el código a mano.',
        ],
      },
    ],
  },

  compras: {
    title: 'Compras e importaciones',
    intro:
      'Órdenes de compra a tus proveedores con el ciclo completo del importador: desde la proforma hasta el contenedor en el depósito, con el costo real de cada unidad calculado solo.',
    category: 'Catálogo',
    sections: [
      {
        heading: 'El ciclo de una compra',
        paragraphs: [
          'En Compras e importaciones tocá “Nueva compra”. La orden arranca como borrador: proveedor (ver el artículo «Proveedores»), referencia (proforma o contenedor), lead time, moneda (USD, ARS, EUR o CNY), tipo de cambio estimado y los productos con su costo unitario FOB. Mientras es borrador podés editar todo; acordate de tocar “Guardar”.',
          'Cuando el proveedor la acepta, tocá “Confirmada” (si había cambios sin guardar, se guardan antes). Después la vas moviendo con los botones de estado por los pasos reales de una importación: En producción (opcional) → En tránsito → En aduana. Es visibilidad para vos y tu equipo — el sistema no exige papeles. “Recibir” está disponible desde que la orden está confirmada. “Cancelar OC” la anula sin tocar stock ni costos.',
          'Arriba de la lista, “Órdenes abiertas”, “En camino” y “Recibidas sin factura” filtran las órdenes al tocarlas; “Plata comprometida” suma el FOB de lo que todavía no llegó.',
        ],
        blocks: [{ type: 'path', segments: ['Compras e importaciones', 'Órdenes de compra'] }],
      },
      {
        heading: 'Landed cost: lo que de verdad cuesta cada unidad',
        paragraphs: [
          'En la tarjeta “Gastos del embarque”, con “+ Gasto”, cargá el flete, el seguro, los aranceles, el despachante y el IVA de aduana, en la moneda de la orden o directo en pesos. El sistema los prorratea entre los productos según su valor: la diferencia entre creer que un disco cuesta USD 4 y saber que puesto en tu depósito cuesta USD 6,80.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Los gastos se cargan antes de confirmar',
            text: 'Igual que los productos y los costos, los gastos solo se editan mientras la compra es borrador. Si todavía no tenés los números finales, cargalos estimados antes de tocar “Confirmada”.',
          },
        ],
      },
      {
        heading: 'Recibir la mercadería',
        steps: [
          'Tocá “Recibir” cuando llega el contenedor y, en “Recibir mercadería”, confirmá cuántas unidades entraron de cada ítem (podés recibir menos de lo pedido). También podés escanear lo que baja con la cámara: cada código suma una unidad a su ítem. Revisá los números antes de confirmar.',
          'Poné el tipo de cambio definitivo del despacho.',
          'Tocá “Confirmar recepción”: el stock sube solo y el costo de cada variante queda fijado al landed cost — Estadísticas → Rentabilidad pasa a calcular la ganancia con el costo real importado.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Aviso de margen',
            text: 'Si con el costo real alguna variante queda con menos de 15% de margen al precio actual, al recibir te lo avisa con la lista y un atajo a “Revisar precios en Costos”: es el momento de subir el precio, antes de vender a pérdida.',
          },
        ],
      },
      {
        heading: 'La factura del proveedor y el libro de IVA compras',
        paragraphs: [
          'En la tarjeta “Comprobante del proveedor” de la orden cargás su factura: tipo, número, fecha, CUIT, neto e IVA (o “Leer factura” para que la IA te la proponga desde el PDF). Es opcional y se puede cargar después de recibir, que es cuando suele llegar el papel. Con la factura cargada nace la deuda con el proveedor en Cuentas corrientes.',
          'Arriba de Compras e importaciones elegís el mes y tocás “Libro IVA compras”: baja un CSV, listo para Excel, con todas las compras del mes que tienen la factura cargada. El recuadro “Recibidas sin factura” te muestra las que todavía no entran. El de ventas sale de Configuración → Facturación.',
        ],
      },
      {
        heading: 'Reposición con lead time',
        paragraphs: [
          'Para un importador, un «quedan 5» fijo avisa tarde: si el reabastecimiento tarda 90 días, hay que pedir meses antes. La pestaña «Reposición sugerida» cruza lo vendido por día (últimos 60 días) con tu stock y tu lead time más un colchón de 30 días, y te dice qué no llega a cubrir ese plazo y cuánto pedir para cubrirlo.',
          'Lo vendido incluye Mercado Libre (por las publicaciones vinculadas) y las piezas que se van dentro de kits. El lead time es el de tu última compra recibida (60 días si no hay ninguna); podés probar otro en “Ajustar días”. “Armar orden de compra” crea el borrador con todo lo sugerido, listo para completar los costos.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'En Inicio, la tarjeta “Para hacer hoy” te avisa cuando algo se va a agotar antes del próximo embarque, con un atajo a la reposición.',
          },
        ],
      },
    ],
  },

  fichaTecnica: {
    title: 'Ficha técnica',
    intro: 'Los datos propios de lo que vendés: medidas, materiales, compatibilidad, códigos.',
    category: 'Catálogo',
    sections: [
      {
        heading: 'Para qué sirve',
        paragraphs: [
          'La descripción de un producto es texto libre: sirve para contar, no para comparar ni para buscar. La ficha técnica son datos sueltos y con nombre, y por eso se pueden usar de tres maneras que la descripción no permite.',
        ],
        blocks: [
          { type: 'path', segments: ['Configuración', 'Ficha técnica'] },
          {
            type: 'table',
            headers: ['Dónde', 'Qué gana'],
            rows: [
              [
                'Página del producto',
                'Una tabla clara de medidas y materiales, abajo de la descripción. Contesta lo que, si no, te preguntan por WhatsApp.',
              ],
              [
                'Filtros del catálogo',
                'El cliente filtra por lo que le importa: «mostrame todo lo de 20 kg», «lo que entra en este modelo». Es la diferencia entre un catálogo y una casa de repuestos.',
              ],
              [
                'Mercado Libre',
                'Los campos con equivalente declarado viajan en la publicación. Una ficha completa posiciona mejor y puede entrar al catálogo de ML.',
              ],
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Cada campo decide los tres usos por separado: “Mostrarlo en la página del producto”, “Dejar filtrar el catálogo por este campo” y “Atributo equivalente en Mercado Libre” (el código de ML, por ejemplo BRAND o MODEL; si lo dejás vacío, no viaja).',
          },
        ],
      },
      {
        heading: 'Los campos son de esta tienda',
        paragraphs: [
          'Cada tienda define los suyos, porque cada una vende otra cosa: en equipamiento de gimnasio «paso de cadena» no significa nada, y en repuestos «diámetro del orificio» tampoco. Si tenés varias tiendas, cada una tiene su lista y no se pisan.',
          'Dentro de una tienda, cada campo se acota por categoría. «Diámetro del orificio» aplica a discos y a nada más. Eso es lo que hace que quien carga un producto vea tres campos y no cuarenta: el editor muestra solo los que corresponden a la categoría del producto.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Un campo sin ninguna categoría marcada aplica a todo el catálogo. Es lo razonable para algo como «Material» o «Garantía».',
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Se compara contra las categorías exactas del producto: un campo marcado en «Pesas» no aparece en un producto que solo está en «Pesas › Discos». Marcá también las subcategorías donde aplica.',
          },
        ],
      },
      {
        heading: 'Elegir bien el tipo',
        blocks: [
          {
            type: 'table',
            headers: ['Tipo', 'Cuándo'],
            rows: [
              ['Texto', 'Un código OEM, un modelo compatible: valores que no se repiten.'],
              ['Número', 'Con su unidad: 20 kg, 50 mm. Se muestra junto al valor.'],
              ['Sí / No', 'Algo que se tiene o no: «con rodamiento».'],
              [
                'Lista de opciones',
                'Valores fijos que elegís vos. Es el único tipo que rinde de verdad como filtro.',
              ],
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Si un campo va a filtrar el catálogo, hacelo lista. Escrito a mano, «Caucho» y «caucho » son dos valores distintos y el filtro se llena de duplicados.',
          },
        ],
      },
      {
        heading: 'Cargar los valores',
        paragraphs: [
          'Los valores se completan en el editor de cada producto, en la sección Ficha técnica. Solo aparecen los campos de la categoría de ese producto, así que cargar es rápido.',
          'Un campo que dejás vacío no se guarda ni se muestra: la ficha de la tienda no se llena de renglones en blanco.',
          'Eliminar un campo en Configuración → Ficha técnica borra también los valores que ya tenían cargados los productos, y no se puede deshacer.',
        ],
      },
    ],
  },
  listasDePrecios: {
    title: 'Listas de precios',
    intro:
      'Un precio mayorista y uno minorista del mismo producto, sin duplicar el catálogo ni llevar una planilla aparte.',
    category: 'Catálogo',
    sections: [
      {
        heading: 'La idea: la lista guarda una regla, no precios',
        paragraphs: [
          'Una lista es un porcentaje sobre el precio del producto: "Mayorista, −30%". El precio de cada producto en esa lista se calcula cuando se pide, no se copia.',
          'Eso es lo que la mantiene viva. Si las listas guardaran precios copiados, el día que subís el catálogo 20% la mayorista se queda con los números del mes pasado y no te enterás hasta que facturás mal. Con una regla, cambiás el precio del producto y todas las listas se mueven con él.',
        ],
        blocks: [{ type: 'path', segments: ['Productos', 'Listas de precios'] }],
      },
      {
        heading: 'Crear una lista',
        steps: [
          'En Productos → Listas de precios, tocá "Nueva lista".',
          'Ponele nombre ("Mayorista", "Revendedores", "Showroom").',
          'Elegí sobre qué se calcula: el precio del producto, o alguna de las otras listas.',
          'Escribí el ajuste: negativo para descuento (−30), positivo para recargo (15).',
          'Si querés precios redondos, elegí un redondeo: a los $100, a los $1.000 o terminación $990. Abajo te muestra cómo queda un producto de $100.000.',
          'Elegí la moneda (pesos o dólares), sumá una nota para saber para quién es, y tocá “Guardar”.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Una lista sobre otra encadena los porcentajes',
            text: 'Mayorista −30% y Distribuidor −10% sobre Mayorista da −37%, no −40%. Es el comportamiento correcto: el segundo descuento se aplica sobre el precio ya rebajado.',
          },
        ],
      },
      {
        heading: 'Cuando un producto necesita otro número',
        paragraphs: [
          'Entrá a la lista con "Ver precios" y escribí el precio de ese producto. Queda fijo: deja de seguir la regla y ya no se mueve cuando cambia el precio del producto. La pantalla lo marca como "A mano" para que se vea cuál es cuál.',
          'Para que vuelva a seguir la regla, vaciá la casilla.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Los precios a mano son la excepción',
            text: 'La tarjeta de cada lista te dice cuántos tiene. Si son muchos, la regla que elegiste no representa cómo vendés y conviene cambiar el porcentaje en vez de pelear producto por producto.',
          },
        ],
      },
      {
        heading: 'Cómo se aplica una lista',
        paragraphs: [
          'La lista se le asigna al CLIENTE, en su ficha (Clientes → Editar → Lista de precios). Después, cada venta manual y cada presupuesto para ese cliente arrancan con esos precios sin que haya que acordarse (si escribís otro precio en un renglón, vale el tuyo).',
          'Por eso en la venta manual el selector de cliente está siempre a la vista, no solo cuando vendés en cuenta corriente: un mayorista también paga en efectivo.',
          'Tu tienda online sigue mostrando el precio del producto. Las listas son para la venta asistida, que es donde sabés quién está comprando.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            title: 'Apagar una lista la saca de circulación de una vez',
            text: 'Destildar “Lista activa” deja de aplicarla a todos los clientes que la tenían asignada, sin desasignarla uno por uno. Sirve para congelar una lista de temporada sin perderla. Borrarla, en cambio, borra también sus precios a mano.',
          },
        ],
      },
    ],
  },

  proveedores: {
    title: 'Proveedores',
    intro:
      'La ficha de cada proveedor: sus datos, todas las compras que le hiciste y cuánto le debés, en una sola pantalla.',
    category: 'Catálogo',
    sections: [
      {
        heading: 'Por qué tener fichas',
        paragraphs: [
          'Si el proveedor es un nombre escrito a mano en cada compra, "Importadora del Sur", "Import. del Sur" e "importadora sur" terminan siendo tres proveedores distintos. Sin ficha no hay historial, no hay saldo y no hay forma de comparar precios entre compras.',
          'Con la ficha, cada orden de compra elige el proveedor de una lista, y la pantalla del proveedor junta lo que le compraste con lo que le debés. Para un proveedor nuevo, dalo de alta primero con “Nuevo proveedor”.',
          'Toda compra queda atada a una ficha: si el nombre se escribió a mano, a la que ya existe con ese nombre (sin importar mayúsculas) o a una nueva. Para las compras que cargaste antes de tener fichas, tocá “Traer de mis compras” en Proveedores: crea las fichas que falten, las ata y les pasa el CUIT de la factura.',
          'La ficha de cada proveedor muestra su saldo, sus datos y todas sus órdenes de compra (cada una abre la compra). Con “Editar” cambiás los datos o destildás “Proveedor activo”; los inactivos se ven tildando “Mostrar inactivos”.',
        ],
        blocks: [{ type: 'path', segments: ['Compras e importaciones', 'Proveedores'] }],
      },
      {
        heading: 'Cómo se arma el saldo',
        paragraphs: [
          'La deuda con un proveedor nace cuando cargás SU factura en la orden de compra, no cuando armás la orden: antes hay un pedido, no una obligación de pago.',
          'Los pagos se registran desde Cuentas corrientes, en la solapa de proveedores, y ahí mismo se imputan a las facturas que estás cancelando. Desde la ficha, “Ver cuenta corriente” te lleva directo a la de ese proveedor.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Las facturas de antes de tener fichas',
            text: 'Lo que ataste con “Traer de mis compras” suma al historial del proveedor, pero sus facturas viejas no generan deuda. Si alguna todavía está impaga, cargala en Cuentas corrientes con “Ajuste”, con el motivo.',
          },
        ],
      },
      {
        heading: 'Leer la factura con IA',
        paragraphs: [
          'En la orden de compra, el botón "Leer factura" te deja subir el PDF o una foto del comprobante del proveedor. La IA propone tipo, número, fecha, CUIT, neto e IVA, y vos revisás antes de guardar.',
          'Propone y no guarda: de esos números salen el libro de IVA compras y la deuda con el proveedor. La pantalla muestra también lo que NO pudo leer y con cuánta confianza leyó el resto.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Si no ves el botón',
            text: 'La lectura automática necesita la clave de IA cargada en la plataforma. Sin ella el botón no aparece, igual que el resto de las sugerencias con IA del panel.',
          },
        ],
      },
    ],
  },
  busqueda: {
    title: 'El buscador de la tienda',
    intro:
      'Cómo encuentra tu tienda lo que escriben tus clientes, y cómo enseñarle las palabras que usan ellos.',
    category: 'Catálogo',
    keywords: ['sinónimos', 'búsquedas', 'buscar', 'predictivo', 'autocompletar', 'sin resultados'],
    sections: [
      {
        heading: 'Cómo busca',
        paragraphs: [
          'Cada palabra tiene que aparecer en el nombre del producto, en cualquier orden y sin importar tildes ni mayúsculas: “camion rojo” encuentra “Camión de juguete Rojo”. El SKU no cuenta: tu cliente no conoce tus códigos.',
          'Mientras escribe, el buscador del encabezado ya le muestra productos con foto y precio, las categorías que se llaman así y cuántos resultados hay. Con Enter (o “Ver todos los resultados”) va al listado completo, donde lo agotado queda al final.',
        ],
      },
      {
        heading: 'Sinónimos',
        paragraphs: [
          'Tu cliente busca “mancuerna” y vos la cargaste como viene de fábrica: “DUMBBELL HEXAGONAL”. Sin un sinónimo, no la encuentra. Un grupo de sinónimos son palabras que valen lo mismo: cualquiera de ellas encuentra lo que dicen las demás.',
          'La tienda trae una lista sugerida con palabras comunes (mancuerna = dumbbell, pesa rusa = kettlebell, remera = camiseta…). Mientras no guardes la tuya, vale esa. Cuando guardás, vale la tuya, aunque la dejes vacía; “Volver a la lista sugerida” la recupera.',
        ],
        blocks: [
          { type: 'path', segments: ['Configuración', 'Búsqueda'] },
          {
            type: 'checklist',
            items: [
              'Un grupo por renglón, con las palabras separadas por coma: “mancuerna, dumbbell, pesa de mano”.',
              'Un término puede tener varias palabras (“pesa rusa”): cuenta como uno solo.',
              'El plural se encuentra solo: con “mancuerna” en la lista, “mancuernas” también trae las dumbbells.',
              'Evitá palabras cortas que aparecen adentro de otras: “mat” está en “material” y traería cualquier cosa.',
            ],
          },
        ],
      },
      {
        heading: 'Lo que buscan tus clientes',
        paragraphs: [
          'En la misma pantalla ves lo más buscado y, aparte, lo que se buscó y no encontró nada. Esa segunda lista es oro: o es un producto que no tenés, o es una palabra que te falta como sinónimo. El botón “Agregar como sinónimo” la suma a un grupo nuevo para que le pongas al lado cómo lo cargaste vos.',
          'Lo más buscado que sí encuentra algo aparece también en la tienda, como “Búsquedas populares”, en el buscador y cuando una búsqueda no da resultados.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Se cuenta cada búsqueda que llega a la página de resultados, no cada letra que se escribe en el buscador. Para la tienda, una búsqueda es “popular” desde que se hizo dos veces y encuentra algo.',
          },
        ],
      },
    ],
  },

  stockBajo: {
    title: 'Stock bajo y alertas',
    intro:
      'Te avisamos cuando un producto cruza su punto de reposición: lo que queda no alcanza para vender hasta que llegue la próxima compra. Una vez por cruce, con el pedido sugerido.',
    category: 'Catálogo',
    keywords: [
      'alerta de stock',
      'reposición',
      'punto de pedido',
      'quiebre de stock',
      'faltantes',
      'stock mínimo',
    ],
    sections: [
      {
        heading: 'Cuándo un producto está bajo',
        paragraphs: [
          'Con la misma cuenta que Compras › Reposición: lo que se vendió en los últimos 60 días (en la tienda, en Mercado Libre y como parte de kits) contra lo que tarda en llegar una compra más un colchón de 30 días. Para un importador, “quedan 5” no dice nada: importa si alcanzan hasta el próximo embarque.',
          'Además podés ponerle a un producto un mínimo propio (“avisame con 10 o menos”), que avisa aunque no se haya vendido: sirve para lo nuevo o lo de temporada. Se pone desde la pantalla Stock bajo o, para cualquier producto, en Configuración › Alertas de stock, en “Mínimos y productos silenciados”.',
        ],
        blocks: [{ type: 'path', segments: ['Productos', 'Stock bajo'] }],
      },
      {
        heading: 'La pantalla Stock bajo',
        paragraphs: [
          'Lista lo que está bajo ahora, lo que se agota primero arriba, con cuánto pedir (para un producto bajo su mínimo, lo que falta para llegar al doble del mínimo). “Armar orden de compra” abre Compras con esos productos y cantidades cargados (o solo los que tildes): revisás, ponés el proveedor y la guardás. Ese botón lo ve quien tiene el permiso “Compras e importaciones”.',
          'Desde ahí también cambiás el mínimo de un producto (“Mínimo”) o lo silenciás (“Silenciar”: lo que se discontinúa no tiene que avisar nunca); eso pide el permiso “Ajustar el stock”. El número al lado de “Stock bajo” en el menú es cuántos hay.',
        ],
      },
      {
        heading: 'Los avisos por email',
        paragraphs: [
          'En Configuración › Alertas de stock elegís: “Sin avisos por email” (lo de fábrica), “Al toque, apenas cruza” (se revisa cada 5 minutos) o “Un resumen por día”, a la hora que elijas. Esa pantalla pide el permiso “Ajustar el stock”.',
          'Se avisa una vez por cruce: mientras siga bajo, no se repite. Cuando se repone y vuelve a bajar, es otro aviso.',
          'Lo reciben quienes tienen el permiso “Compras e importaciones”: la pantalla muestra quiénes son. Cada persona puede darse de baja desde la pantalla Stock bajo (“Recibir estos avisos por email”), y los emails en la lista de bajas de la tienda no reciben nada.',
        ],
        blocks: [
          { type: 'path', segments: ['Configuración', 'Alertas de stock'] },
          {
            type: 'callout',
            tone: 'info',
            text: 'No hay aviso por WhatsApp: el WhatsApp automático de la tienda le escribe al comprador con plantillas aprobadas por Meta, no al equipo.',
          },
        ],
      },
    ],
  },
  avisoStock: {
    title: 'Avisame cuando ingrese',
    intro: 'Quien encuentra un producto agotado deja su email, y le avisamos cuando vuelve a haber stock.',
    category: 'Catálogo',
    keywords: ['sin stock', 'agotado', 'reposición', 'back in stock', 'lista de espera', 'notificar stock'],
    sections: [
      {
        heading: 'Cómo funciona',
        paragraphs: [
          'En la ficha de una variante agotada, en lugar de un botón de compra muerto, el comprador ve “Avisame cuando ingrese”: deja su email (no hace falta cuenta) y listo.',
          'Cuando esa variante vuelve a tener stock —por un ajuste en Inventario, una compra recibida, una reserva que venció o una venta de Mercado Libre que se canceló—, le llega un solo email con el link al producto. Cada pedido de aviso se usa una vez, y el email trae un link para dejar de esperar.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'El email es la plantilla “Avisame cuando ingrese” de Configuración → E-mails automáticos: viene encendida (lo pidió el comprador) y su texto se puede editar.',
          },
        ],
      },
      {
        heading: 'La demanda que no veías',
        paragraphs: [
          'En Productos → Avisame cuando ingrese ves cuánta gente espera cada producto y variante, desde cuándo y cuánto stock hay hoy: es la lista de compras que te está pidiendo la tienda. En la edición de cada producto también aparece cuántas personas lo esperan.',
        ],
        blocks: [{ type: 'path', segments: ['Productos', 'Avisame cuando ingrese'] }],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
