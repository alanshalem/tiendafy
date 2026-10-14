import type { HelpArticle } from './helpContent';

export const VENTAS = {
  payments: {
    title: 'Medios de pago',
    intro:
      'Cobrá las ventas de tu tienda con Mercado Pago, con Payway o con los dos a la vez. La plata va directo a tu cuenta — Tiendafy nunca la toca.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'Cuál te conviene',
        paragraphs: [
          'Mercado Pago se conecta en un clic desde el panel y cobra con tarjeta, saldo, transferencia y efectivo. Es lo más rápido para arrancar y lo que más formas de pago le da al comprador.',
          'Payway (ex Decidir) cobra solo con tarjeta, pero el comprador nunca sale de tu tienda y las condiciones las negociás vos. El alta la hace un ejecutivo comercial, así que lleva más tiempo.',
          'No son excluyentes: con los dos activos, el checkout muestra las dos opciones.',
        ],
      },
      {
        heading: 'Conectá tu cuenta de Mercado Pago',
        paragraphs: [
          'En Configuración → Medios de pago, tocá “Conectá tu cuenta de Mercado Pago”. Te llevamos a Mercado Pago para que autorices; al volver, quedás conectado.',
          'Usamos OAuth oficial: guardamos un token cifrado, nunca tu usuario ni tu contraseña. Podés desconectar la cuenta cuando quieras (requiere rol dueño o administrador).',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Medios de pago'] }],
      },
      {
        heading: 'Configuración de la plataforma',
        paragraphs: [
          'Esta integración necesita además una configuración que se hace una sola vez para todo Tiendafy, no por tienda. Está en el centro de ayuda, en Administrar la plataforma → Trámites y altas con proveedores.',
        ],
      },
      {
        heading: 'Checkout Pro vs. Checkout integrado',
        paragraphs: [
          'En ambos casos los datos de la tarjeta los procesa Mercado Pago: nunca tocan los servidores de tu tienda. Cambiás de modo cuando quieras y aplica al instante.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['', 'Checkout Pro', 'Checkout integrado'],
            rows: [
              [
                'Dónde paga',
                'En la página de Mercado Pago (y vuelve a tu tienda)',
                'En tu tienda, sin salir, con tu diseño',
              ],
              [
                'Medios de pago',
                'Todos: tarjetas, dinero en cuenta, Rapipago, cuotas',
                'Tarjetas de crédito y débito, con cuotas',
              ],
              ['Aprobación', 'La mejor tasa (el cliente ya está logueado en MP)', 'Muy buena'],
              ['Ideal para', 'Arrancar sin fricción', 'Experiencia más premium y de marca'],
            ],
          },
        ],
      },
      {
        heading: 'Nombre en el resumen de la tarjeta',
        paragraphs: [
          'Configurá hasta 22 caracteres que el comprador ve en el resumen de su tarjeta (ej: “MI MARCA”). Reduce desconocimientos y contracargos.',
        ],
      },
      {
        heading: 'Probar sin riesgo',
        paragraphs: [
          'Mercado Pago se prueba con cuentas de prueba: creá un usuario vendedor y uno comprador en tu panel de MP, conectá el vendedor y pagá con las tarjetas de prueba.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            title: 'El truco del titular',
            text: 'Con las tarjetas de prueba, el nombre del titular decide el resultado: “APRO” aprueba el pago, “OTHE” lo rechaza. Así probás los dos caminos.',
          },
        ],
      },
      {
        heading: 'Si aparece “Hay un aviso de pago que no se pudo procesar”',
        paragraphs: [
          'Mercado Pago le avisa a tu tienda cada vez que se aprueba un pago. Si uno de esos avisos no se pudo procesar, Medios de pago lo muestra arriba de todo, porque puede haber una venta cobrada que no quedó registrada. Tocá “Reintentar” en cada aviso; si vuelve a fallar, escribinos con el número de pago.',
        ],
      },
      {
        heading: 'Comisiones y plazos',
        paragraphs: [
          'Mercado Pago cobra un porcentaje que depende del plazo de liberación del dinero que elijas en tu panel de MP (al instante cuesta más; a 10 o 18 días, menos). La comisión se descuenta antes de acreditarte — el detalle exacto está en tu panel de Mercado Pago, en “Costos”.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Tiendafy no cobra comisión por venta. Lo único que se descuenta de tus cobros es la comisión de Mercado Pago.',
          },
        ],
      },
    ],
  },

  payway: {
    title: 'Cobrar con Payway',
    intro:
      'Cobro con tarjeta de crédito y débito sin que el comprador salga de tu tienda. Payway es el ex Decidir, de Prisma.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'En qué se diferencia de Mercado Pago',
        paragraphs: [
          'Con Mercado Pago el comprador paga con su cuenta, su saldo o su tarjeta, y vos no manejás ninguna relación bancaria: la cuenta se conecta sola desde el panel.',
          'Payway es una pasarela clásica: cobra solo con tarjeta, la plata se acredita según el contrato que firmás con ellos, y el alta la hace un ejecutivo comercial. A cambio, el comprador nunca sale de tu tienda y las comisiones suelen negociarse.',
          'Podés tener los dos activos: el checkout muestra las dos opciones y el comprador elige.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['', 'Mercado Pago', 'Payway'],
            rows: [
              ['Alta', 'Desde el panel, en un clic', 'Con un ejecutivo comercial'],
              ['Medios', 'Tarjeta, saldo, transferencia, efectivo', 'Solo tarjeta de crédito y débito'],
              ['El comprador', 'Puede salir a Mercado Pago', 'Paga dentro de tu tienda'],
              ['Cuotas', 'Las administra Mercado Pago', 'Las acordás con Payway'],
            ],
          },
        ],
      },
      {
        heading: 'Qué necesitás',
        steps: [
          'Dar de alta el comercio con Payway. No hay registro autogestionado: se hace con un ejecutivo comercial y lleva su tiempo.',
          'Que te entreguen el número de comercio (site ID) y dos claves: una pública y una privada.',
          'Que Payway certifique tu integración antes de habilitarte a cobrar de verdad. Podés probar todo en el ambiente de pruebas mientras tanto.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Para qué sirve cada clave',
            text: 'La pública viaja al navegador del comprador y sirve para una sola cosa: convertir los datos de la tarjeta en un código. La privada es la que cobra, se guarda cifrada y no sale nunca de nuestro servidor — ni siquiera te la mostramos a vos después de cargarla.',
          },
        ],
      },
      {
        heading: 'Configurarlo',
        steps: [
          'En Configuración → Medios de pago, bajá hasta la tarjeta de Payway.',
          'Cargá el número de comercio y las dos claves.',
          'Elegí el ambiente: empezá en “Pruebas” hasta que Payway te certifique.',
          'Escribí el nombre que querés que aparezca en el resumen de la tarjeta del comprador.',
          'Elegí las cuotas que vas a ofrecer y guardá.',
          'Tocá “Probar conexión” para verificar que Payway responde.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Medios de pago', 'Payway'] }],
      },
      {
        heading: 'Las cuotas se acuerdan con Payway',
        paragraphs: [
          'Payway no tiene forma automática de decirnos qué promociones y planes de cuotas tenés vigentes: eso se pacta con ellos y con los bancos. Las cuotas que elegís en el panel se muestran en el checkout sin recargo.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'Si acordaste cuotas CON interés, no las cargues acá todavía: hoy el checkout las muestra sin recargo y estarías regalando la diferencia. Ofrecé solo los planes sin interés hasta que sumemos el cálculo del costo financiero.',
          },
        ],
      },
      {
        heading: 'Qué ve el comprador',
        paragraphs: [
          'En el checkout elige “Tarjeta de crédito o débito” y completa los datos en tu tienda. Los datos de la tarjeta viajan directo a Payway: no pasan por nuestros servidores ni quedan guardados en ningún lado.',
          'Si el banco rechaza el pago, le mostramos el motivo en castellano y qué puede hacer: probar con otra tarjeta, elegir menos cuotas o llamar al banco.',
        ],
      },
      {
        heading: 'Probar sin cobrar de verdad',
        paragraphs: [
          'Con el ambiente en “Pruebas” podés hacer el circuito completo. Tarjeta de prueba: 4507 9900 0000 4905, cualquier código de seguridad y cualquier vencimiento futuro. Para ver un rechazo, usá 4000 3000 1111 2220.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Los datos de la tarjeta caducan a los 15 minutos de cargarlos. Si el comprador deja el checkout abierto mucho tiempo y después paga, va a tener que cargarlos de nuevo — no es un error.',
          },
        ],
      },
      {
        heading: 'Si un pago queda en duda',
        paragraphs: [
          'Payway no nos avisa solo cuando algo cambia, así que ante un corte de conexión le preguntamos directamente qué pasó con ese pago y adoptamos su respuesta. Nunca reintentamos por las nuestras: es así como se cobra dos veces.',
          'Si ves una venta que quedó sin confirmar, no la vuelvas a cobrar: consultá el estado en el panel de Payway antes de hacer nada.',
        ],
      },
    ],
  },

  ventas: {
    title: 'Ventas y reembolsos',
    intro: 'Seguí cada pedido desde el pago hasta la entrega, y devolvé dinero cuando haga falta.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'El ciclo de una venta',
        paragraphs: [
          'Cuando un cliente paga, la orden aparece en Ventas como “Pagada” (la confirmación llega por Mercado Pago automáticamente, aunque el cliente cierre el navegador).',
          'Al expandir una venta ves los productos, el cliente (nombre, email, teléfono, DNI/CUIT y el link “Ver en Clientes” a su ficha), el envío (medio, dirección, seguimiento y en qué anda), la forma de cobro, por dónde entró la venta y las notas del pedido.',
          'Una venta “Enviada” es una que despachaste (o marcaste enviada): el sistema no se entera de cuándo la recibe el comprador, por eso no dice “Entregada”.',
        ],
        blocks: [
          {
            type: 'demo',
            demo: 'orderStatuses',
            caption: 'Todos los estados posibles de una venta, tal como se ven en la tabla de Ventas.',
          },
        ],
      },
      {
        heading: 'El número de venta, buscar y exportar',
        paragraphs: [
          'Cada venta tiene un número corto, como #A1B2C3D4: es el mismo que recibe el comprador, el que va en la etiqueta del correo y el del CSV. Buscá por ese número, por email o por nombre, y filtrá por estado, por fechas (desde / hasta, días completos), por canal (tienda online, venta manual o presupuesto), por envío (por despachar, enviada, lista para retirar…) y por forma de cobro (pago online, efectivo, transferencia, cuenta corriente). La búsqueda, los filtros y la página quedan en la dirección: si recargás o volvés atrás no se pierden, y podés pasarle el link a alguien del equipo.',
          'La columna “Envío” dice en qué anda cada venta cobrada: por despachar, enviada, para preparar el retiro o lista para retirar. Las ventas de Mercado Libre tienen su propio listado, en Canales de venta → Mercado Libre → Ventas.',
          'En el celular, cada venta es una tarjeta con el número, el cliente, el total, el estado y la acción del momento (por ejemplo “Marcar enviada”). Tocala para ver el detalle.',
          'Arriba ves lo facturado y las ventas de los últimos 30 días, y “Por despachar”: tocalo y la lista se filtra a las ventas pagadas que falta enviar.',
          '“Exportar” baja un CSV, listo para Excel, con las ventas que estás viendo (respeta la búsqueda y el filtro): número, fecha, estado, comprador, productos, montos, envío, seguimiento, cupón y de dónde vino la venta.',
        ],
        blocks: [{ type: 'path', segments: ['Ventas', 'Lista de ventas'] }],
      },
      {
        heading: 'Despachar un pedido',
        steps: [
          'Expandí la venta y tocá “Marcar enviada”.',
          'Cargá el código de seguimiento (opcional).',
          'El cliente recibe el email de “pedido en camino” automáticamente.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Pedidos para retirar',
            text: 'Si el comprador eligió retiro en punto, el botón dice “Lista para retirar”: al tocarlo le avisamos que ya puede pasar a buscarlo, y la venta queda como “Lista para retirar”.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Desde el depósito',
            text: 'El Escáner de depósito, en “Preparar pedido”, verifica cada producto contra la venta y al terminar la marca enviada desde el mismo celular.',
          },
        ],
      },
      {
        heading: 'Trabajar con varias ventas a la vez',
        steps: [
          'Tildá las ventas en la lista (o todas las de la página): aparece una barra con “N seleccionadas”. La selección se mantiene aunque cambies de página.',
          '“Marcar como enviadas” (hasta 100 por vez): cada comprador recibe su aviso. Las que no estaban pagadas o ya estaban enviadas se saltean.',
          '“Etiquetas” baja la etiqueta de cada venta que ya tiene un envío de Zipnova o Andreani generado. Las que no tienen envío se listan para que lo generes desde su detalle.',
          '“Remitos” abre una hoja por venta para imprimir y meter en la caja: a quién va, a dónde, qué lleva (cantidad, producto y SKU, sin precios) y una columna para tildar al armar el paquete.',
          '“Facturar” emite la factura de cada venta cobrada, de a una; las que ya tenían factura no se vuelven a facturar. Si la facturación todavía no está configurada, el botón dice “Configurá la facturación”.',
          '“Exportar” baja un CSV solo con las ventas elegidas.',
          'Al terminar cada acción ves cuáles salieron y cuáles no, con el motivo; las que fallaron quedan tildadas para reintentar.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'En lote se marcan sin código de seguimiento. Si querés mandarle el seguimiento a cada comprador, marcalas de a una.',
          },
        ],
      },
      {
        heading: 'Venta manual: WhatsApp, teléfono o mostrador',
        paragraphs: [
          'Para lo que vendés fuera de la tienda online, tocá “Venta manual” en Ventas. La venta descuenta stock de verdad, cuenta en las estadísticas, manda el email de confirmación y, si tenés la facturación automática activa, sale con su factura, igual que una venta online.',
        ],
        steps: [
          'Agregá los productos buscando por nombre o SKU, con la cantidad. El precio sale solo (de la lista de precios del cliente si tiene una); lo podés cambiar línea por línea.',
          'En “Cliente” escribí el nombre: abajo aparecen los de la agenda que coinciden. Elegir uno trae su email, su teléfono y su lista de precios; si no está, “Crear … en la agenda” lo da de alta ahí mismo. Si no elegís ninguno, el nombre queda solo en esta venta.',
          'Elegí el cobro: Efectivo o Transferencia (la venta queda pagada), Link de pago (Mercado Pago), o Cuenta corriente (queda debiendo).',
          'Escribí una nota si hace falta (“retira el sábado”) y confirmá.',
        ],
        blocks: [
          {
            type: 'terms',
            items: [
              {
                term: 'Link de pago (Mercado Pago)',
                def: 'Necesita el email del comprador. Te damos el link para copiar y mandárselo; la venta queda pendiente y se marca pagada sola cuando paga. Si no paga, abrí la venta y tocá “Cancelar venta”.',
              },
              {
                term: 'Cuenta corriente',
                def: 'Necesita un cliente de la agenda: el total queda como deuda en Tesorería → Cuentas corrientes.',
              },
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Si falta stock de algún producto, la venta no se crea y te dice de cuál. Así nunca vendés por WhatsApp lo que ya se vendió en la tienda.',
          },
        ],
      },
      {
        heading: 'Reembolsos totales y parciales',
        paragraphs: [
          'Desde la venta, tocá “Reembolsar”. Podés devolver el total o un monto parcial (con motivo opcional), y la orden pasa a “Reembolsada” o “Reembolso parcial”. Qué pasa con la plata depende de cómo se cobró, y el diálogo te lo dice antes de confirmar: si se pagó online, vuelve por Mercado Pago; si fue en efectivo o por transferencia, la devolvés vos; si fue en cuenta corriente, se le baja la deuda al cliente.',
          'Cada reembolso queda auditado: quién lo hizo, cuándo, cuánto y por qué. El historial se ve en el mismo diálogo. Cuando la venta queda reembolsada del todo, al comprador le llega el aviso de cancelación y, si tenía factura, sale sola la nota de crédito.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Reembolsar es de los roles dueño, administrador y finanzas (salvo que cambies los permisos). Los reembolsos hechos directo en el panel de Mercado Pago también se sincronizan solos.',
          },
        ],
      },
      {
        heading: 'Devoluciones: que el stock vuelva',
        paragraphs: [
          'En un reembolso total aparece “Reingresar el stock de los productos”, tildado de entrada: los productos vuelven al stock disponible y queda en su historial como “Devolución”. Si la venta era un kit, vuelven también sus piezas.',
          'Destildalo si el producto no vuelve a la venta (llegó roto, se perdió). En un reembolso parcial el stock no se toca: si te devolvieron una unidad, ajustala en Inventario.',
        ],
      },
      {
        heading: 'Reembolsar una venta manual',
        paragraphs: [
          'Una venta cobrada en efectivo o por transferencia no pasó por Mercado Pago, así que el sistema no puede devolver la plata: el reembolso deja la venta marcada (y el stock, si lo reingresás), y la plata se la devolvés vos.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Si la venta era en cuenta corriente, no hay plata que devolver: el reembolso le baja la deuda al cliente por ese importe. En Cuentas corrientes queda como una nota de crédito con el motivo, y la venta deja de figurar pendiente por lo devuelto. Si el cliente ya la había pagado, le queda saldo a favor.',
          },
        ],
      },
      {
        heading: 'Cancelar una venta que no se cobró',
        paragraphs: [
          'Una venta pendiente de pago (por ejemplo, un link de Mercado Pago que el cliente nunca pagó) se cancela desde su detalle con “Cancelar venta”. Podés dejar un motivo.',
          'Al cancelarla se anula el link de pago (deja de aceptar pagos), se libera el stock que tenía reservado y queda escrito quién la canceló, cuándo y por qué. Una venta ya cobrada no se cancela: se reembolsa.',
        ],
      },
      {
        heading: 'Carritos abandonados',
        paragraphs: [
          'En Ventas → Carritos abandonados ves quiénes dejaron productos sin pagar. Si activás el email de recuperación, se les envía un recordatorio automático.',
        ],
      },
    ],
  },

  checkout: {
    title: 'El checkout de tu tienda',
    intro: 'Tus clientes compran en pasos claros: carrito → entrega → pago.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'Cómo es el flujo',
        steps: [
          'Entrega: el cliente deja su email, elige el medio de envío (domicilio o retiro), completa sus datos (nombre, teléfono, dirección) y su DNI o CUIT para la facturación.',
          'Pago: ve el resumen de todo lo elegido (con links “Cambiar”), puede agregar notas del pedido y paga según el modo que configures: redirigido a Mercado Pago o con el formulario de tarjeta embebido.',
          'El costo de envío se suma al total automáticamente y siempre se calcula en el servidor: el cliente no puede manipularlo.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Opciones del checkout'] }],
      },
      {
        heading: 'Qué podés configurar',
        paragraphs: [
          'Cada opción cambia lo que ve el comprador, así que se guarda en tu tienda y no en tu navegador: la tocás una vez y vale para todos.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Opción', 'Qué cambia'],
            rows: [
              [
                'Teléfono',
                'Obligatorio u opcional. Sin teléfono cuesta coordinar una entrega, pero cada campo obligatorio hace que algunos abandonen.',
              ],
              [
                'DNI o CUIT',
                'Obligatorio si facturás todas las ventas o vendés a empresas. Opcional deja facturar como consumidor final, que tiene tope de monto.',
              ],
              [
                'Nota del comprador',
                'El campo libre del carrito, y qué dice adentro. «¿Timbre o portero?» rinde más que «Aclaraciones».',
              ],
              [
                'Mensaje al terminar',
                'Un texto tuyo en la pantalla final, junto con la confirmación del pago. No aparece si el pago se rechaza.',
              ],
              ['Diseño', 'Formulario y resumen en dos columnas, o todo en una sola.'],
            ],
          },
        ],
      },
      {
        heading: 'Cupones en el checkout',
        paragraphs: [
          'El cliente puede aplicar un cupón de descuento desde el resumen del pedido. El descuento se valida y recalcula en el servidor antes de cobrar.',
        ],
      },
      {
        heading: 'Si no configuraste envíos',
        paragraphs: [
          'El paso de entrega se omite y el checkout pide solo los datos de contacto — útil para productos digitales o coordinación manual. Igual te recomendamos crear al menos un medio de envío.',
        ],
      },
    ],
  },

  cupones: {
    title: 'Cupones de descuento',
    intro: 'Creá códigos de descuento para campañas, clientes fieles o recuperar carritos.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'Crear un cupón',
        steps: [
          'En Cupones → Crear cupón, elegí el código (ej: BIENVENIDA10): es lo que el cliente escribe en el carrito.',
          'Definí el tipo: Porcentaje, Monto fijo o Envío gratis (el envío le sale $0, sea cual sea el medio que elija).',
          'Opcional: compra mínima, vigencia (válido desde / hasta) y límite de usos.',
          'Dejalo activo. El cliente lo ingresa en el carrito o en el checkout y el descuento se aplica al instante; si lo puso en el carrito, viaja solo al checkout.',
        ],
        blocks: [
          { type: 'path', segments: ['Cupones', 'Crear cupón'] },
          {
            type: 'demo',
            demo: 'coupon',
            caption: 'Así ve el comprador un cupón aplicado en el resumen del pedido.',
          },
        ],
      },
      {
        heading: 'Buenas prácticas',
        paragraphs: [
          'Usá códigos cortos y memorables. Poné vigencia para generar urgencia. La columna “Usos” de la lista muestra cuántas veces se usó cada uno (y el máximo, si le pusiste), y el reporte de cupones (Estadísticas → Reporte de cupones) cuánta plata moviste con ellos.',
          'Desde el menú de cada cupón lo pausás sin borrarlo. El límite de usos es total, no por cliente.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Si asociás un cupón a una campaña de email, el detalle de la campaña te muestra cuántas ventas y cuánta plata generó — la forma más confiable de medir marketing.',
          },
        ],
      },
      {
        heading: 'Mostrar un cupón en la tienda',
        paragraphs: [
          'El Pop-up promocional del inicio puede mostrar un código con un botón “Copiar”, y una sección de ofertas o una barra de anuncio pueden mencionarlo. El cupón tiene que existir acá antes: la tienda solo lo muestra, no lo crea.',
        ],
      },
    ],
  },

  mercadolibre: {
    title: 'Integración con Mercado Libre',
    intro:
      'Conectá tu cuenta de vendedor: tus ventas, preguntas y mensajes de ML en el panel, stock unificado entre canales y publicación desde tu catálogo.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'Qué hace la integración',
        blocks: [
          {
            type: 'table',
            headers: ['Función', 'Qué resuelve'],
            rows: [
              [
                'Ventas ML en el panel',
                'Cada venta de Mercado Libre aparece en la pestaña Ventas del canal, con comprador, productos y estado',
              ],
              ['Preguntas prevente', 'Respondés las preguntas de tus publicaciones sin entrar a ML'],
              ['Mensajes posventa', 'El chat con el comprador de cada venta, en un modal del panel'],
              [
                'Stock unificado',
                'Una venta en ML descuenta stock acá; tu stock se empuja a las publicaciones vinculadas',
              ],
              [
                'Publicar desde el catálogo',
                'Creás una publicación en ML con el título, precio, fotos y stock de tu producto',
              ],
              ['Reclamos', 'Los reclamos abiertos de ML, visibles antes de que escalen'],
            ],
          },
        ],
      },
      {
        heading: 'Antes que nada: los dos niveles de credenciales',
        paragraphs: [
          'La integración tiene dos patas y conviene no confundirlas. La app de PLATAFORMA se registra UNA sola vez ante Mercado Libre (es “Tiendafy” presentándose como aplicación: un Client ID y un Client Secret que viven en el servidor). Recién con eso existe el botón de conectar. Después, CADA tienda autoriza su propia cuenta de vendedor con un click — sin cargar ninguna clave.',
          'Es el mismo esquema que Mercado Pago (que ya tiene su app configurada, por eso su botón funciona). Ojo: aunque sea la misma empresa, Mercado Libre y Mercado Pago usan apps SEPARADAS en portales de desarrolladores distintos — la app de MP no sirve para ML.',
        ],
        blocks: [
          {
            type: 'table',
            headers: ['Nivel', 'Quién lo hace', 'Cuántas veces', 'Qué se carga'],
            rows: [
              [
                'App de plataforma',
                'Quien administra el servidor',
                'Una sola vez',
                'Client ID + Client Secret de la app de ML, en la configuración del servidor',
              ],
              [
                'Cuenta de la tienda',
                'Cada tienda, desde el panel',
                'Una vez por tienda',
                'Nada: autoriza con su usuario de ML (OAuth)',
              ],
            ],
          },
        ],
      },
      {
        heading: 'Configuración de la plataforma',
        paragraphs: [
          'Esta integración necesita además una configuración que se hace una sola vez para todo Tiendafy, no por tienda. Está en el centro de ayuda, en Administrar la plataforma → Trámites y altas con proveedores.',
        ],
      },
      {
        heading: 'Conectar la cuenta de cada tienda',
        steps: [
          'En Configuración → Mercado Libre, tocá “Conectar mi cuenta”.',
          'Te llevamos a Mercado Libre para que autorices con tu usuario de vendedor; al volver, quedás conectado.',
          'Se importan solas tus últimas ventas (también podés tocar “Importar últimas ventas” cuando quieras).',
        ],
        blocks: [
          { type: 'path', segments: ['Configuración', 'Mercado Libre'] },
          {
            type: 'callout',
            tone: 'info',
            text: 'Usamos el OAuth oficial de Mercado Libre: guardamos tokens cifrados, nunca tu usuario ni tu contraseña. Podés desconectar cuando quieras y tus publicaciones no se tocan. Cada tienda conecta SU cuenta de vendedor: las de la misma empresa no se mezclan.',
          },
        ],
      },
      {
        heading: 'El panel del canal',
        paragraphs: [
          'En el menú, Canales de venta → Mercado Libre. Tiene cuatro pestañas: Ventas (con las métricas de los últimos 30 días), Preguntas (respondé las pendientes ahí mismo), Publicaciones (vinculá cada una con tu catálogo, o publicá productos nuevos) y Reclamos.',
        ],
        blocks: [{ type: 'path', segments: ['Canales de venta', 'Mercado Libre'] }],
      },
      {
        heading: 'Stock unificado: cómo funciona',
        steps: [
          'En la pestaña Publicaciones, tocá “Vincular” en cada publicación y elegí el producto (y variante) de tu catálogo que le corresponde.',
          'Activá “Sincronizar stock” en Configuración → Mercado Libre.',
          'Desde ahí: cada venta en ML descuenta el stock local automáticamente, y los cambios de stock locales se empujan a las publicaciones cada ~5 minutos.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'Una publicación SIN vincular no sincroniza nada: la venta de ML aparece en el panel igual, pero no descuenta tu stock. Vinculá todo lo que vendas en los dos canales para no sobrevender.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Colchón anti-sobreventa',
            text: 'Con “Colchón anti-sobreventa (unidades)” Mercado Libre muestra un poco menos de lo que tenés: con 2 de colchón y 10 en stock, ML publica 8. Esas unidades cubren el rato entre una venta en tu tienda y la actualización en ML. Con 0 se publica todo el stock.',
          },
        ],
      },
      {
        heading: 'Precio en Mercado Libre, con recargo',
        paragraphs: [
          'Con “Sincronizar precios” activado, el precio de tu catálogo viaja a las publicaciones vinculadas, más el “Recargo para Mercado Libre (%)” que elijas para cubrir la comisión: con 15, un producto de $10.000 se publica a $11.500. Si subís precios (a mano o con “Repreciar en masa”), ML se actualiza solo.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Precio y stock son independientes: podés sincronizar solo los precios (y manejar el stock de ML a mano), solo el stock, o los dos. Cada uno actúa sobre las publicaciones vinculadas y se actualiza cada cinco minutos.',
          },
        ],
      },
      {
        heading: 'Facturar las ventas de Mercado Libre',
        paragraphs: [
          'Con “Facturar automáticamente las ventas de ML” (necesita la facturación electrónica configurada) cada venta pagada que llega de ML sale con su comprobante de ARCA a consumidor final. Si está apagado, o ARCA rechazó alguna, en la pestaña Ventas del canal tocás “Facturar” en cada una. Las facturadas quedan marcadas “Facturada”.',
          'Para varias a la vez: filtrá “Sin facturar”, tildá las ventas (o todas las de la página) y tocá “Facturar seleccionadas”. Se facturan de a una, ves el avance y al final cuáles salieron y cuáles no (con el motivo); las que fallaron quedan tildadas para reintentar. Una venta ya facturada nunca se factura dos veces.',
          'El buscador de la pestaña encuentra por comprador, número de venta o producto. En Inicio, “Para hacer hoy” te dice cuántas ventas de ML hay sin facturar y te lleva directo a ese filtro.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Mientras la facturación electrónica no esté lista (datos del emisor, certificado y punto de venta), en lugar de “Facturar” vas a ver “Configurá la facturación”, que te lleva a Configuración → Facturación. Pasa lo mismo en Ventas.',
          },
        ],
      },
      {
        heading: 'Publicar un producto en ML',
        steps: [
          'En Publicaciones → “Publicar un producto en ML”, elegí un producto activo de tu catálogo.',
          'Mercado Libre sugiere la categoría según el título — elegí la correcta (una categoría mal elegida puede hacer que ML pause la publicación).',
          'Al publicar, la publicación nace vinculada: el stock ya queda sincronizado.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Los productos con varias variantes se publican con su primera variante (Mercado Libre maneja las variaciones distinto). Si necesitás variaciones en ML, crealas en su editor y vinculalas a mano.',
          },
        ],
      },
      {
        heading: 'Mensajes y preguntas: reglas de ML',
        blocks: [
          {
            type: 'checklist',
            items: [
              'La conversación posventa la inicia SIEMPRE el comprador; vos respondés.',
              'Los mensajes tienen un máximo de 350 caracteres.',
              'Responder preguntas rápido mejora tu reputación como vendedor (y tus ventas). Cada pregunta muestra de qué publicación es, con foto, precio y stock. El botón con destellos sugiere una respuesta con IA, que editás antes de mandar.',
              'La respuesta es pública y no se puede editar: Enter hace un salto de línea, y se publica con “Publicar respuesta” o con Ctrl + Enter (⌘ + Enter en Mac).',
              'Todo lo que escribas pasa por la moderación de Mercado Libre: nada de datos de contacto ni links externos.',
            ],
          },
        ],
      },
      {
        heading: 'Métricas multicanal',
        paragraphs: [
          'En Estadísticas → Visión general, “Por dónde vendés” compara lo facturado en tu tienda online con Mercado Libre, para ver el negocio completo. En Estadísticas → Rentabilidad, la tarjeta “Canal Mercado Libre” descuenta la comisión real que cobró ML en cada venta y te muestra la ganancia neta del canal.',
        ],
      },
    ],
  },

  rentabilidad: {
    title: 'Rentabilidad real',
    intro:
      'Vender no es ganar. Esta sección te muestra cuánta plata te queda de verdad de cada venta: lo facturado menos el costo de tus productos y la comisión de Mercado Pago.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'Cargá el costo de tus productos',
        paragraphs: [
          'Todo empieza por decirle al sistema cuánto te cuesta cada producto. Sin costo cargado, la tienda sabe cuánto facturás pero no cuánto ganás.',
        ],
        steps: [
          'Andá a Productos → Costos: vas a ver cada variante con su precio y un campo para el costo (en pesos).',
          'Cargá el costo y tocá Guardar. El margen se calcula al instante para que veas si estás vendiendo demasiado barato.',
          'Para catálogos grandes usá el CSV: la plantilla de Exportar/Importar ahora tiene la columna «Costo». Exportá, completá esa columna en Excel y volvé a importar.',
        ],
      },
      {
        heading: 'Qué muestra Estadísticas → Rentabilidad',
        paragraphs: [
          'La ganancia real del período (con el mismo selector de fechas que el resto de Estadísticas): ventas de productos (netas de cupones) menos el costo de lo vendido y menos la comisión exacta que cobró Mercado Pago en cada pago (el sistema la lee de MP al confirmarse el pago, no la estima).',
          'La tabla por producto expone lo importante: cuáles dejan plata y cuáles venden mucho pero dejan poco. Un margen menor al 15% se marca en rojo.',
          'El costo de cada venta queda congelado al momento de venderse: si mañana te sube el costo, las ganancias de ventas pasadas no cambian.',
        ],
      },
      {
        heading: 'Por qué puede decir «X de Y ventas tienen costo»',
        paragraphs: [
          'La ganancia solo se calcula sobre las ventas cuyos productos tenían costo cargado al momento de venderse — el resto se excluye para no inventar números. A medida que cargues costos, las ventas nuevas van a entrar completas.',
          'El envío cobrado al cliente no se cuenta como ganancia: se asume que cubre lo que le pagás al correo.',
        ],
      },
      {
        heading: 'Ganancia por canal y Mercado Libre',
        paragraphs: [
          '“Ganancia por canal” separa lo que te deja cada origen de venta, según la marca de origen (utm_source) del link que trajo al comprador: redes, email, publicidad o directo. Cómo marcar tus links está en el artículo “Estadísticas”. La tarjeta “Canal Mercado Libre” usa la comisión real que cobró ML en cada venta, así ves si ese canal te conviene de verdad o solo te mueve volumen.',
        ],
      },
      {
        heading: 'El retorno real de tu publicidad en Meta',
        paragraphs: [
          'Abajo de todo, en “Pauta de Meta Ads”, tocá “Conectar Meta Ads”, autorizá con tu usuario de Facebook y elegí la cuenta publicitaria. Desde ahí ves el gasto del período, la ganancia real del mismo período y el ROAS real, también por campaña.',
          'El ROAS real es ganancia ÷ gasto, no facturación ÷ gasto como lo calcula Meta. Por eso da más bajo, y por eso sirve: menos de 1 (en rojo) significa que la publicidad te cuesta más de lo que te deja.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'La conexión con Meta dura unos 60 días; cuando vence, el botón pasa a “Reconectar Meta”. Esto no es el píxel: el píxel se carga aparte, en Configuración → Medición y píxeles. Si en vez del botón ves solo un texto, la plataforma todavía no tiene configurada la app de Meta.',
          },
        ],
      },
    ],
  },
  presupuestos: {
    title: 'Presupuestos',
    intro:
      'Cotizale a un cliente antes de que compre, y si acepta la venta se genera sola — con los precios que cotizaste, no con los de hoy.',
    category: 'Ventas y pagos',
    sections: [
      {
        heading: 'Para qué sirve',
        paragraphs: [
          'Cuando le vendés a un revendedor, primero pasás precios y después el cliente piensa. Hasta que decide pueden pasar días, y en el medio los precios cambian.',
          'El presupuesto congela los precios del día que cotizaste. Es su razón de existir: si el precio se recalculara al aceptarlo, no sería una promesa sino una estimación, y no serviría para cerrar nada.',
        ],
        blocks: [{ type: 'path', segments: ['Ventas', 'Presupuestos'] }],
      },
      {
        heading: 'Armar uno',
        steps: [
          'En Ventas → Presupuestos, tocá "Nuevo presupuesto".',
          'Elegí el cliente de la agenda. Si tiene lista de precios asignada, los precios se cargan de esa lista solos.',
          'Agregá los productos buscándolos por nombre o SKU, con la cantidad de cada uno.',
          'Poné hasta cuándo vale. Por defecto son 15 días.',
          'Guardá, y cuando se lo mandes marcalo como enviado.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'También podés cotizarle a alguien que no está en la agenda',
            text: 'Escribís el nombre y listo. Lo único que no vas a poder es cerrarlo en cuenta corriente, porque sin ficha no hay a quién anotarle la deuda.',
          },
        ],
      },
      {
        heading: 'El stock no se reserva',
        paragraphs: [
          'Un presupuesto es una propuesta, no una venta: reservar mercadería por cada cotización dejaría el depósito trabado con ventas que nunca ocurrieron.',
          'El stock se descuenta recién al aceptarlo. Si para ese momento no hay, el sistema lo avisa en vez de vender lo que no tenés.',
        ],
      },
      {
        heading: 'Cuando el cliente contesta',
        paragraphs: [
          'Si acepta, tocás "El cliente aceptó" y elegís cómo se cobra: efectivo, transferencia o cuenta corriente. Se crea la venta con los precios del presupuesto, se descuenta el stock y sale la factura si tenés la facturación automática activa.',
          'Si rechaza, lo marcás como rechazado y podés dejar el motivo. Después se puede reabrir para renegociarlo: no hace falta empezar de cero.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Un presupuesto vencido no se acepta',
            text: 'Con inflación, cerrar al precio del mes pasado es vender a pérdida. Para poder aceptarlo hay que extender la validez, que es un botón aparte justamente para que sea una decisión y no un descuido.',
          },
        ],
      },
      {
        heading: 'Qué te dicen los números de arriba',
        blocks: [
          {
            type: 'terms',
            items: [
              { term: 'Abiertos', def: 'Presupuestos vigentes esperando respuesta.' },
              { term: 'En juego', def: 'Cuánta plata suman esos presupuestos. Es tu pipeline.' },
              {
                term: 'Vencidos',
                def: 'Se les pasó la fecha. O se renuevan o se dan por perdidos, pero conviene no dejarlos ahí.',
              },
              {
                term: 'Conversión',
                def: 'De los que ya se decidieron, cuántos terminaron en venta. Los que siguen abiertos no cuentan: todavía no ganaron ni perdieron, y meterlos hundiría el número sin motivo.',
              },
            ],
          },
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
