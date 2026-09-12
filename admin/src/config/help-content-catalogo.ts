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
          'En Productos → Agregar, cargá nombre, descripción, precio y fotos (la primera es la principal y sale en los emails).',
          'Si tiene talles o colores, definí opciones y variantes: cada combinación tiene su propio SKU, precio y stock.',
          'Asignale categorías para que aparezca en los filtros de tu tienda.',
          'Publicalo. Los borradores y archivados no se ven en la tienda.',
        ],
        blocks: [{ type: 'path', segments: ['Productos', 'Agregar'] }],
      },
      {
        heading: 'Inventario y reservas',
        paragraphs: [
          'El stock se controla por variante en Productos → Inventario. Cuando un cliente inicia el pago, su stock se reserva; si no paga en 30 minutos, la reserva se libera sola — nunca vendés lo que no tenés.',
          'El historial de movimientos de cada variante muestra entradas, ventas y reservas.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Anti-sobreventa',
            text: 'Dos clientes no pueden pagar la última unidad a la vez: el primero que inicia el pago la reserva; el segundo ve “sin stock” hasta que la reserva se libere.',
          },
        ],
      },
      {
        heading: 'Importación y exportación masiva',
        paragraphs: [
          'En Productos → Exportar e importar podés bajar todo tu catálogo a CSV, editarlo en Excel/Sheets y volver a subirlo. También sirve para migrar desde otra plataforma. Las imágenes se importan por URL en una segunda pasada.',
        ],
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
          'Cuando un cliente compra el kit, además del stock del kit se descuenta el de cada componente. Así el kit y las piezas sueltas dejan de venderse por separado sin enterarse el uno del otro.',
        ],
      },
      {
        heading: 'Límites a tener en cuenta',
        paragraphs: [
          'Un componente no puede ser a su vez un kit (sin kits anidados). El descuento de componentes ocurre al confirmarse el pago; si un componente no tiene fila de stock, se crea con lo que corresponda descontar en cero (queda auditado en los movimientos).',
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
          'Desde Inventario podés imprimir una plancha A4 de etiquetas QR con nombre, SKU y precio para los productos que no traen código.',
        ],
      },
      {
        heading: 'Buscar y ajustar',
        paragraphs: [
          'Escaneá (o tipeá) un código y ves el producto con su stock y su ubicación en el depósito. Ajustás el stock o la ubicación ahí mismo. Si el código no existe, el escáner te ofrece asignárselo a un SKU — así se etiqueta el catálogo la primera vez, paquete en mano.',
        ],
      },
      {
        heading: 'Preparar pedido (anti errores de despacho)',
        steps: [
          'Elegí un pedido pagado sin despachar.',
          'Escaneá cada producto al meterlo en la caja: la lista marca en verde lo juntado.',
          'Si escaneás algo que NO va en ese pedido, la alerta salta antes de despachar — se acabó mandar el disco de 15 kg en vez del de 25.',
        ],
      },
      {
        heading: 'Conteo',
        paragraphs: [
          'Recorré una estantería escaneando unidad por unidad (o cargando cantidades). Al final ves las diferencias contra el sistema y un click aplica los ajustes, con su movimiento auditado.',
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
          'Una orden de compra arranca como borrador: proveedor, moneda (típicamente USD), tipo de cambio estimado, lead time y los productos con su costo unitario FOB. Mientras es borrador podés editar todo.',
          'Al confirmarla, la vas moviendo por los estados reales de una importación: en producción → en tránsito → en aduana. Es visibilidad para vos y tu equipo — el sistema no exige papeles.',
        ],
      },
      {
        heading: 'Landed cost: lo que de verdad cuesta cada unidad',
        paragraphs: [
          'Cargá los gastos del embarque (flete, seguro, aranceles, despachante, IVA de aduana) en la moneda de la orden o directo en pesos. El sistema los prorratea entre los productos según su valor: la diferencia entre creer que un disco cuesta USD 4 y saber que puesto en tu depósito cuesta USD 6,80.',
        ],
      },
      {
        heading: 'Recibir la mercadería',
        steps: [
          'Tocá «Recibir» cuando llega el contenedor y confirmá cuántas unidades entraron de cada ítem (podés recibir menos de lo pedido).',
          'Poné el tipo de cambio definitivo del despacho.',
          'Al confirmar: el stock sube solo y el costo de cada variante queda fijado al landed cost — Estadísticas → Rentabilidad pasa a calcular la ganancia con el costo real importado.',
        ],
      },
      {
        heading: 'Reposición con lead time',
        paragraphs: [
          'Para un importador, la alerta de «stock bajo» llega tarde: si el reabastecimiento tarda 90 días, hay que pedir meses antes. La pestaña «Reposición sugerida» cruza lo vendido por día (últimos 60 días) con tu stock y tu lead time, y te dice qué se agota antes de que llegue el próximo embarque y cuánto pedir.',
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
                'Una tabla clara de medidas y materiales, abajo de la descripción. Contesta lo que si no te preguntan por WhatsApp.',
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
          'Si querés precios redondos, elegí un redondeo: a los $100, a los $1.000 o terminación $990.',
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
          'La lista se le asigna al CLIENTE, en su ficha (Clientes → editar → Lista de precios). Después, cada venta manual a ese cliente usa esos precios sin que haya que acordarse.',
          'Por eso en la venta manual el selector de cliente está siempre a la vista, no solo cuando vendés en cuenta corriente: un mayorista también paga en efectivo.',
          'Tu tienda online sigue mostrando el precio del producto. Las listas son para la venta asistida, que es donde sabés quién está comprando.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            title: 'Apagar una lista la saca de circulación de una vez',
            text: 'Una lista inactiva deja de aplicarse a todos los clientes que la tenían asignada, sin desasignarla uno por uno. Sirve para congelar una lista de temporada sin perderla.',
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
          'Antes el proveedor era un nombre escrito a mano en cada orden de compra, así que "Importadora del Sur", "Import. del Sur" e "importadora sur" eran tres proveedores distintos. Sin ficha no hay historial, no hay saldo y no hay forma de comparar precios entre compras.',
          'Con la ficha, cada orden de compra se elige de una lista, y la pantalla del proveedor junta lo que le compraste con lo que le debés.',
        ],
        blocks: [{ type: 'path', segments: ['Compras e importaciones', 'Proveedores'] }],
      },
      {
        heading: 'Cómo se arma el saldo',
        paragraphs: [
          'La deuda con un proveedor nace cuando cargás SU factura en la orden de compra, no cuando armás la orden: antes hay un pedido, no una obligación de pago.',
          'Los pagos se registran desde Cuentas corrientes, en la solapa de proveedores, y ahí mismo se imputan a las facturas que estás cancelando.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Una orden sin ficha de proveedor no mueve la cuenta corriente',
            text: 'Podés seguir cargando compras con el proveedor escrito a mano, pero entonces la factura no genera deuda: no hay a quién debérsela. El formulario te lo avisa cuando elegís "sin ficha".',
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
} satisfies Record<string, HelpArticle>;
