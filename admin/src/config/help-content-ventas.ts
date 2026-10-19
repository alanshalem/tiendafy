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
          'Además podés cobrar por transferencia (con descuento) o en efectivo al retirar, sin pasarela: ver “Transferencia, efectivo y cuotas sin interés”.',
        ],
      },
      {
        heading: 'Conectá tu cuenta de Mercado Pago',
        paragraphs: [
          'En Configuración → Medios de pago, tocá “Conectá tu cuenta de Mercado Pago”. Te llevamos a Mercado Pago para que autorices; al volver, quedás conectado.',
          'Es la conexión oficial de Mercado Pago: guardamos un permiso de acceso cifrado, nunca tu usuario ni tu contraseña. Podés desconectar la cuenta cuando quieras con “Desconectar cuenta”. De entrada, conectar, cambiar el modo y desconectar lo pueden hacer el dueño y los administradores; Finanzas ve la conexión en solo lectura y el resto del equipo no ve esta pantalla (se cambia en Roles y permisos).',
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
          'Con la cuenta conectada, en “¿Cómo querés cobrar?” elegís uno de los dos. En ambos casos los datos de la tarjeta los procesa Mercado Pago: nunca tocan los servidores de tu tienda. Cambiás de modo cuando quieras y aplica al instante para las compras nuevas.',
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
                'Todos: tarjetas, dinero en cuenta, Rapipago, Pago Fácil, cuotas',
                'Tarjetas de crédito y débito, con cuotas',
              ],
              ['Aprobación', 'La mejor tasa (el cliente ya está logueado en MP)', 'Muy buena'],
              ['Ideal para', 'Arrancar sin fricción', 'Experiencia más premium y de marca'],
            ],
          },
        ],
      },
      {
        heading: 'Cuando el banco pide confirmar la compra',
        paragraphs: [
          'Con el Checkout integrado, a veces el banco de la tarjeta pide que el comprador confirme que es él antes de aprobar el pago (por ejemplo, con un código que le llega al celular o desde la app del banco). Lo decide el banco según el riesgo de cada compra; vos no tenés que configurar nada.',
          'El comprador lo resuelve ahí mismo, sin salir de tu tienda. Mientras tanto la venta figura como “Pendiente” y se actualiza sola cuando el banco responde. Si no lo confirma, el pago se cancela y la venta pasa a “Fallida”, con los productos liberados; Mercado Pago puede tardar hasta un día en avisarlo.',
        ],
      },
      {
        heading: 'Nombre en el resumen de la tarjeta',
        paragraphs: [
          'Configurá hasta 22 caracteres que el comprador ve en el resumen de su tarjeta (ej: “MI MARCA”) y tocá “Guardar”. Reduce desconocimientos y contracargos.',
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
          'Mercado Pago le avisa a tu tienda cada vez que se aprueba un pago. Si uno de esos avisos no se pudo procesar después de varios intentos, Medios de pago lo muestra debajo de la tarjeta de Mercado Pago, porque puede haber una venta cobrada que no quedó registrada. Revisá ese pago en Mercado Pago y tocá “Reintentar” en cada aviso; si vuelve a fallar, escribinos con el número de pago. Si está todo bien, ese recuadro no aparece.',
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
          'En Configuración → Medios de pago, buscá la tarjeta de Payway (al lado de la de Mercado Pago).',
          'Cargá el número de comercio (site ID) y las dos claves.',
          'Elegí el ambiente: empezá en “Pruebas (sandbox)” y pasá a “Producción — cobra de verdad” cuando Payway te certifique.',
          'Escribí el nombre que querés que aparezca en el resumen de la tarjeta del comprador.',
          'En “Cuotas que ofrecés”, marcá los planes (1 pago, 3, 6, 9, 12 o 18 cuotas) y tocá “Guardar”.',
          'Ya guardado, tocá “Probar conexión” para verificar que Payway responde.',
        ],
        blocks: [{ type: 'path', segments: ['Configuración', 'Medios de pago', 'Payway'] }],
      },
      {
        heading: 'Las cuotas se acuerdan con Payway',
        paragraphs: [
          'Payway no tiene forma automática de decirnos qué promociones y planes de cuotas tenés vigentes: eso se pacta con ellos y con los bancos. Las cuotas que elegís en el panel se muestran en el checkout sin recargo, y son las únicas que se aceptan al cobrar.',
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
          'Payway no nos avisa solo cuando algo cambia. Si un cobro quedó en el medio (se cortó la conexión, el banco lo dejó en revisión o pidió una validación extra), le volvemos a preguntar solos por ese pago durante tres días: seguido al principio y cada vez más espaciado. Cuando responde, la venta queda Pagada (con su email y su factura, como cualquier cobro) o, si el pago se rechazó o se anuló, Fallida o Cancelada, y el stock vuelve a la venta. Nunca reintentamos el cobro: es así como se cobra dos veces.',
          'Si ves una venta que sigue pendiente, no la vuelvas a cobrar: consultá el estado en el panel de Payway antes de hacer nada.',
        ],
      },
      {
        heading: 'Reembolsar una venta cobrada con Payway',
        paragraphs: [
          'Igual que con Mercado Pago: abrí la venta y tocá “Reembolsar”. La plata vuelve por Payway a la tarjeta del comprador, total o en parte.',
          'Payway no avisa si devolvés desde su portal: hacé los reembolsos siempre desde el panel, así la venta, el stock y la nota de crédito quedan al día. Si al reembolsar ves “Payway ya hizo la devolución, pero el pedido cambió…”, no lo repitas: recargá y revisá la venta. Y si ves “Payway no respondió y no sabemos si hizo la devolución”, fijate en el portal de Payway antes de volver a intentarlo.',
        ],
      },
    ],
  },

  transferencia: {
    title: 'Transferencia, efectivo y cuotas sin interés',
    intro:
      'Cobrá por transferencia (con el descuento que anuncia tu tienda) o en efectivo al retirar, y decí con honestidad cuántas cuotas sin interés ofrecés. Lo que se configura acá es lo mismo que muestran la ficha del producto, el listado y el checkout.',
    category: 'Ventas y pagos',
    keywords: ['descuento efectivo', 'precio con transferencia', 'cbu', 'alias', 'deposito', 'cuotas'],
    sections: [
      {
        heading: 'Por qué un solo lugar',
        paragraphs: [
          'Lo que una tienda anuncia la obliga (Ley 24.240 de Defensa del Consumidor, art. 7): si la ficha dice “10% de descuento pagando con transferencia”, el comprador tiene que poder pagar así y con ese descuento. Antes ese número se cargaba en el diseño y el checkout no ofrecía transferencia.',
          'Ahora el descuento, las cuotas y el plazo viven en Medios de pago, y la ficha, el listado, el checkout y el email al comprador leen el mismo número.',
        ],
        blocks: [
          { type: 'path', segments: ['Configuración', 'Medios de pago', 'Transferencia, efectivo y cuotas'] },
        ],
      },
      {
        heading: 'Cómo funciona la transferencia',
        steps: [
          'Prendé “Transferencia o depósito”, poné el % de descuento y cargá el titular, su CUIT, el banco o billetera, el CBU/CVU o el alias y, si querés, instrucciones (a dónde mandar el comprobante). Tocá “Guardar”.',
          'Elegí “Cuánto te guardamos el stock” esperando el pago (de 12 horas a una semana).',
          'En el checkout el comprador elige Transferencia, ve el total con descuento y toca “Confirmar pedido”. Le mostramos los datos de tu cuenta en la pantalla final y se los mandamos por email (plantilla “Instrucciones de pago”). Los datos de la cuenta no se publican en la tienda.',
          'El pedido queda en Ventas como Pendiente, con el aviso “falta registrar el pago” y hasta cuándo. Cuando ves la plata en tu cuenta, abrí la venta y tocá “Registrar pago”: pasa a Pagada, descuenta el stock, le avisa al comprador y, si facturás al cobrar, se factura.',
          'Si el plazo vence sin que registres el pago, la venta se cancela sola y el stock vuelve a estar a la venta (al comprador siempre le avisamos por email que se canceló porque venció el plazo y qué hacer si ya había pagado; lo cuenta el artículo «E-mails automáticos»). También podés cancelarla vos con “Cancelar venta”.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Cómo se combinan los descuentos',
            text: 'Primero el cupón, sobre el precio de los productos; después el % de la transferencia, sobre lo que queda; el envío no se descuenta nunca. Ejemplo: $20.000 de productos, cupón del 10% y 10% por transferencia → $20.000 − $2.000 − $1.800 = $16.200, más el envío.',
          },
          {
            type: 'callout',
            tone: 'tip',
            text: 'El total lo calcula siempre el servidor. Aunque alguien toque la página, el pedido se crea con el descuento que configuraste vos.',
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Que no se te pase ninguna',
            text: 'En Inicio, “Para hacer hoy” te dice cuántas transferencias hay por confirmar y con “Revisar” te lleva a Ventas ya filtrado. En Ventas también podés filtrar por cobro: Transferencia o Efectivo.',
          },
        ],
      },
      {
        heading: 'Efectivo al retirar',
        paragraphs: [
          'Si lo prendés, aparece solo cuando el comprador elige retirar en tu local (funciona aunque no ofrezcas transferencia). Lleva el mismo descuento y el mismo plazo que la transferencia; cuando te paga en el mostrador, registrás el pago desde la venta con “Registrar pago”.',
        ],
      },
      {
        heading: 'Cuotas sin interés',
        paragraphs: [
          'Se muestran como “Hasta N cuotas sin interés”, con las condiciones que escribas (por ejemplo, “con tarjetas de crédito bancarias”). Es un solo número para la ficha y el listado: antes había uno por lugar y podían no coincidir.',
          'Poné solo lo que de verdad ofrecés: depende de lo que acordaste con Mercado Pago o Payway y de cada tarjeta. Si tenés Payway conectado y anunciás más cuotas que las que ofrecés ahí, te avisamos.',
        ],
      },
      {
        heading: 'Si todavía no lo configuraste',
        paragraphs: [
          'Mientras no guardes esta sección, la tienda sigue mostrando el descuento y las cuotas que tenía el diseño. Si tu diseño anunciaba un descuento, te avisamos arriba de la sección: cargá los datos de la cuenta o poné el descuento en 0.',
          'Si ninguna forma de pago está activa, el carrito y el checkout ofrecen escribirte por WhatsApp (el número del botón de WhatsApp o el de Contacto) en vez de dejar al comprador sin salida.',
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
          'Cada compra aparece en Ventas como “Pendiente” mientras espera el pago y pasa a “Pagada” cuando se acredita. Con Mercado Pago y Payway la confirmación llega sola, aunque el cliente cierre el navegador; una transferencia o un pago en efectivo los registrás vos (ver “Transferencia, efectivo y cuotas sin interés”).',
          'Al expandir una venta ves los productos (con el cupón y el descuento por transferencia o efectivo, si hubo), el cliente (nombre, email, teléfono, DNI/CUIT y el link “Ver en Clientes” a su ficha), el envío (medio, dirección, seguimiento y en qué anda), la forma de cobro, el canal por el que entró, las notas del pedido y su factura.',
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
          'Cada venta tiene su número de pedido, como #1042: es el mismo que recibe el comprador, el que va en la etiqueta del correo y el del CSV (más en “Números de pedido, «Seguí tu pedido» y la cuenta del comprador”). Buscá por ese número (“1042” o “#1042”), por email o por nombre, y filtrá por estado, por fechas (desde / hasta, días completos), por canal (tienda online, venta manual o presupuesto), por envío (por despachar, enviada, lista para retirar…), por forma de cobro (pago online, efectivo, transferencia, cuenta corriente) y por facturación (“Devueltas sin nota de crédito”). “Actualizar” vuelve a traer la lista sin recargar la página. La búsqueda, los filtros y la página quedan en la dirección: si recargás o volvés atrás no se pierden, y podés pasarle el link a alguien del equipo.',
          'La columna “Envío” dice en qué anda cada venta cobrada: por despachar, enviada, preparar para retiro o lista para retirar. Las ventas de Mercado Libre tienen su propio listado, en Canales de venta → Mercado Libre → Ventas.',
          'En el celular, cada venta es una tarjeta con el número, el cliente, el total, el estado y la acción del momento (por ejemplo “Marcar enviada”). Tocala para ver el detalle.',
          'Arriba ves lo facturado, las ventas cobradas y el ticket promedio de los últimos 30 días (si tu rol puede ver estadísticas), y “Por despachar”: tocalo y la lista se filtra a las ventas cobradas que falta enviar.',
          '“Exportar” baja un CSV, listo para Excel, con las ventas que estás viendo (respeta la búsqueda y los filtros): número, fecha, estado, comprador, productos, montos, envío, seguimiento, cupón, canal, forma de cobro y de dónde vino la venta.',
        ],
        blocks: [{ type: 'path', segments: ['Ventas', 'Lista de ventas'] }],
      },
      {
        heading: 'Despachar un pedido',
        steps: [
          'Expandí la venta y tocá “Marcar enviada”.',
          'Cargá el código de seguimiento (opcional). Si después lo tenés que corregir o agregar, usá “Editar seguimiento”.',
          'El cliente recibe el email de “Confirmación de envío” con el link para seguir su pedido.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Pedidos para retirar',
            text: 'Si el comprador eligió retirar en tu local, el botón dice “Lista para retirar”: al tocarlo le avisamos que ya puede pasar a buscarlo, y la venta queda como “Lista para retirar”.',
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Envíos con Correo Argentino, Zipnova o Andreani',
            text: 'Si tenés un carrier conectado, el envío se genera desde la misma venta, con su botón. Si alguna vez ves “Puede que … haya creado el envío de esta venta, pero no quedó guardado acá”, revisá el panel del carrier y resolvelo ahí mismo con “Se creó: cargar el número” o “Ya lo revisé: no se creó” (ver “Medios de envío”).',
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
          '“Marcar como enviadas” (hasta 100 por vez): cada comprador recibe su aviso, y a los que retiran en el local les avisamos que su pedido está listo. Las que no estaban cobradas o ya estaban enviadas se saltean.',
          '“Etiquetas” junta en un solo PDF las etiquetas de las ventas que ya tienen un envío de carrier generado (el mismo PDF que arma Despacho). Las que no tienen envío, o cuyo carrier no da etiqueta, se listan con el motivo.',
          '“Remitos” baja un PDF con un remito por venta, para imprimir y meter en la caja.',
          '“Facturar” emite en ARCA la factura de cada venta cobrada, de a una, y te muestra el avance (“Facturando 3 de 10…”). Las que no están cobradas se saltean y las que ya tenían factura no se vuelven a facturar. Si la facturación todavía no está configurada, en lugar del botón ves “Configurá la facturación”.',
          '“Exportar” baja un CSV solo con las ventas elegidas. “Deseleccionar” vacía la selección.',
          'Al terminar cada acción ves cuáles salieron y cuáles no, con el número de cada venta (#1042) y el motivo; las que fallaron quedan tildadas para reintentar.',
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
          'Para lo que vendés fuera de la tienda online, tocá “Venta manual” en Ventas. La venta descuenta stock de verdad, cuenta en las estadísticas, manda el email de confirmación (si cargaste el email del comprador) y, si tenés la facturación automática activa, sale con su factura, igual que una venta online.',
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
          'Desde la venta, tocá “Reembolsar”. Podés devolver el total o un monto parcial (con motivo opcional), y la orden pasa a “Reembolsada” o “Reembolso parcial”. Qué pasa con la plata depende de cómo se cobró: si se pagó online, vuelve por el mismo medio (Mercado Pago o Payway) a la tarjeta o cuenta del comprador; si fue en efectivo o por transferencia, la devolvés vos; si fue en cuenta corriente, se le baja la deuda al cliente.',
          'Cada reembolso queda auditado: quién lo hizo, cuándo, cuánto y por qué. El historial se ve en el mismo diálogo.',
          'Al comprador siempre le llega un email: cuando la reembolsás entera y por cada devolución parcial, con cuánto le devolviste y por dónde vuelve la plata. El motivo que escribís no se le muestra, y las ventas de mostrador sin email no reciben nada. Qué dice cada aviso y cómo poner tu propio texto lo explica el artículo «E-mails automáticos».',
          'Si la venta estaba facturada, cada reembolso (total o parcial) tiene su nota de crédito por el monto devuelto: sale sola si la tienda factura automáticamente; si no, el diálogo trae tildada “Emitir la nota de crédito por este monto” (la ve quien puede facturar). Lo que quede devuelto sin nota de crédito se avisa en la venta (“Hay $… devueltos sin nota de crédito”) y aparece en el filtro “Devueltas sin nota de crédito” de Ventas. Desde la venta, “Emitir nota de crédito” la emite por lo devuelto, o por otro monto si es un ajuste (un precio corregido), hasta lo que queda de la factura.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Reembolsar es de los roles dueño, administrador y finanzas (salvo que cambies los permisos). Los reembolsos hechos directo en el panel de Mercado Pago también se sincronizan solos; los de Payway no, así que hacelos desde acá.',
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
          'Una venta cobrada en efectivo o por transferencia no pasó por Mercado Pago ni por Payway, así que el sistema no puede devolver la plata: el reembolso deja la venta marcada (y el stock, si lo reingresás), y la plata se la devolvés vos.',
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
          'Una venta pendiente de pago (por ejemplo, un link de Mercado Pago que el cliente nunca pagó, o una transferencia que no llegó) se cancela desde su detalle con “Cancelar venta”. Podés dejar un motivo. Lo puede hacer quien tiene el permiso de registrar ventas a mano o el de devolver plata.',
          'Al cancelarla se anula el link de pago (deja de aceptar pagos), se libera el stock que tenía reservado y queda escrito quién la canceló, cuándo y por qué. Al comprador le llega un email avisándole que la venta se canceló (el motivo que escribiste no se le muestra; el texto se edita en la plantilla “Cancelación de compra” de E-mails automáticos). Una venta ya cobrada no se cancela: se reembolsa.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'Si te avisamos que no pudimos anular el link en Mercado Pago, la venta queda cancelada igual: si el cliente paga de todos modos, vas a tener que devolverle la plata desde Mercado Pago.',
          },
        ],
      },
      {
        heading: 'Carritos abandonados',
        paragraphs: [
          'En Ventas → Carritos abandonados ves los checkouts de los últimos 30 días que no terminaron en compra, con la fecha, el cliente, los ítems y el total. Hay una fila por cliente: si alguien probó varias veces, cuenta su último intento, y si terminó comprando (con otro intento o por transferencia) no aparece. Los que no llegaron a dejar su email figuran como “Sin email (no recuperable)”.',
          '“Valor recuperable” suma los carritos de quienes dejaron su email, que queda guardado apenas lo escriben en el checkout, aunque se vayan antes de pagar (por ejemplo, al ver el costo del envío).',
          'A esos les llega solo un recordatorio por email, y por WhatsApp a quien tildó en el checkout que se lo manden. Cuándo sale, a quién no le llega y cómo editarlo o apagarlo lo explican los artículos «E-mails automáticos» y «WhatsApp automático».',
        ],
        blocks: [{ type: 'path', segments: ['Ventas', 'Carritos abandonados'] }],
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
          'Entrega: el cliente deja su email, elige el medio de envío (a domicilio, retiro o la cotización de un carrier), completa sus datos (nombre, apellido, teléfono y DNI o CUIT) y, si va a domicilio, la dirección. Si tiene cuenta y una dirección guardada, el formulario se completa solo. Debajo del email le avisamos que, si deja la compra sin terminar, le mandamos un recordatorio (el email queda guardado apenas lo escribe). Si tenés el recordatorio por WhatsApp prendido, junto al teléfono puede tildar que le avises también por WhatsApp (viene sin tildar).',
          'Pago: ve el resumen de todo lo elegido (con links “Cambiar”), puede agregar la nota del pedido y elige cómo pagar entre lo que tengas activo: Mercado Pago (redirigido o con el formulario de tarjeta en tu tienda, según el modo), tarjeta con Payway, transferencia o efectivo al retirar.',
          'El costo de envío se suma al total automáticamente y siempre se calcula en el servidor: el cliente no puede manipularlo. Si el medio de envío tiene “gratis desde” un monto y la compra lo alcanza, el resumen lo muestra gratis.',
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
          'El cliente puede aplicar un cupón de descuento desde el resumen del pedido (o traerlo ya aplicado desde el carrito). El descuento se valida y recalcula en el servidor antes de cobrar.',
        ],
      },
      {
        heading: 'Si no configuraste envíos',
        paragraphs: [
          'El checkout no ofrece envío: el comprador deja solo su email y sus datos (sin dirección) y pasa al pago — útil para productos digitales o coordinación manual. Igual te recomendamos crear al menos un medio de envío.',
        ],
      },
      {
        heading: 'Si no tenés ningún medio de pago activo',
        paragraphs: [
          'En vez del checkout, el comprador ve “Comprá escribiéndonos”: un botón para mandarte el pedido por WhatsApp (el número del botón de WhatsApp o el de Contacto) o por email, con el carrito ya escrito. Conectá al menos un medio de pago para vender online.',
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
          'Definí el tipo de descuento: Porcentaje, Monto fijo o Envío gratis (el envío le sale $0, sea cual sea el medio que elija).',
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
          'Desde el menú de cada cupón lo pausás sin borrarlo (“Pausar” / “Activar”) o lo eliminás. El límite de usos es total, no por cliente, y un uso se cuenta cuando la venta se cobra, no cuando alguien lo prueba en el carrito.',
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
                'Con “Sincronizar stock” prendido, una venta en ML descuenta stock acá y tu stock se empuja a las publicaciones vinculadas',
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
        heading: 'Configuración de la plataforma',
        paragraphs: [
          'Antes de que cualquier tienda pueda conectarse, Tiendafy tiene que estar dado de alta como aplicación ante Mercado Libre. Se hace una sola vez para todas las tiendas, y no sirve la de Mercado Pago: son altas separadas. Mientras falte, “Conectar mi cuenta” aparece apagado con el aviso “La integración todavía no está configurada en esta plataforma”. Cómo se hace está en el centro de ayuda, en Administrar la plataforma → Trámites y altas con proveedores.',
          'Con eso hecho, cada tienda solo autoriza su cuenta de vendedor desde el panel, sin cargar ninguna clave.',
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
            text: 'Es la conexión oficial de Mercado Libre: guardamos un permiso de acceso cifrado, nunca tu usuario ni tu contraseña. Podés desconectar cuando quieras: el panel deja de mostrar las ventas y los mensajes de ML y se apaga la sincronización de stock, pero tus publicaciones no se tocan. Cada tienda conecta SU cuenta de vendedor: las de la misma empresa no se mezclan.',
          },
        ],
      },
      {
        heading: 'Cómo saber si la conexión anda bien',
        paragraphs: [
          'Ya conectado, arriba de Configuración → Mercado Libre ves cuántas publicaciones están vinculadas a tu catálogo (lo único que la sincronización puede tocar), cuántas ventas se importaron, cuándo entró la última y cuándo llegó el último aviso de Mercado Libre. Si ya vendiste y el último aviso dice “Nunca”, los avisos de ML no están llegando: avisale a quien administra la plataforma.',
          'Si ves “Hay N avisos de Mercado Libre que no se pudieron procesar”, puede faltar algún dato de esas ventas: traelas con “Importar últimas ventas”. Y si prendiste la sincronización sin ninguna publicación vinculada, te avisa que no va a pasar nada hasta que vincules.',
        ],
      },
      {
        heading: 'El panel del canal',
        paragraphs: [
          'En el menú, Canales de venta → Mercado Libre. Tiene cuatro pestañas: Ventas (con las métricas de los últimos 30 días y el botón “Mensajes” de cada venta), Preguntas (respondé las pendientes ahí mismo), Publicaciones (vinculá cada una con tu catálogo, o publicá productos nuevos) y Reclamos. Cada persona ve las pestañas que su rol permite: atender Mercado Libre y publicar son permisos distintos.',
        ],
        blocks: [{ type: 'path', segments: ['Canales de venta', 'Mercado Libre'] }],
      },
      {
        heading: 'Stock unificado: cómo funciona',
        steps: [
          'En la pestaña Publicaciones, tocá “Vincular” en cada publicación y elegí el producto (y variante) de tu catálogo que le corresponde.',
          'Activá “Sincronizar stock” en Configuración → Mercado Libre.',
          'Desde ahí: cada venta en ML descuenta el stock local automáticamente (si el producto es un kit, también sus piezas), y los cambios de stock locales se empujan a las publicaciones cada ~5 minutos. Si la venta se cancela, vuelve a tu stock lo que se había descontado.',
          'Cada publicación vinculada tiene sus propios interruptores “Stock” y “Precio” en la pestaña Publicaciones: apagalos en la que quieras manejar a mano sin cortar la sincronización del resto.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            text: 'Con “Sincronizar stock” apagado, o en una publicación SIN vincular o con su interruptor “Stock” apagado, Mercado Libre maneja su stock por su lado: la venta aparece en el panel igual (con su ganancia y para facturar), pero no descuenta tu stock, y si se cancela tampoco te suma nada. En la pestaña Ventas cada venta te dice “✓ Stock descontado” o “No descontó stock”. Vinculá y sincronizá todo lo que vendas en los dos canales para no sobrevender.',
          },
          {
            type: 'callout',
            tone: 'info',
            text: 'Prender la sincronización no descuenta las ventas que ya habían entrado: cuenta desde ese momento. Y apagarla no cambia lo que ya se descontó: si una de esas ventas se cancela, el stock vuelve igual. Una venta reembolsada después del envío no devuelve el stock sola (la mercadería puede no haber vuelto): si volvió, sumala a mano en Inventario.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Colchón anti-sobreventa',
            text: 'Con “Colchón anti-sobreventa (unidades)” Mercado Libre muestra un poco menos de lo que tenés: con 2 de colchón y 10 en stock, ML publica 8. Esas unidades cubren el rato entre una venta en tu tienda y la actualización en ML. Con 0 se publica todo el stock. Un producto con stock sin límite se publica siempre con 50 unidades (ML exige un número), sin colchón, y después de cada venta en ML se vuelve a completar.',
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
          'Si Mercado Libre le devuelve al comprador una parte de una venta facturada, la venta queda en “Reembolso parcial” con lo devuelto al lado, y sale sola una nota de crédito por ese monto cuando la facturación automática de ML (o la de la tienda) está prendida. Cada devolución nueva tiene la suya, y un aviso repetido de ML no la duplica. Si ML cancela una venta ya facturada, pasa lo mismo con la nota de crédito por lo que quedaba de la factura.',
          'Si ninguna de las dos está prendida, o querés hacer un ajuste, tocá “Emitir nota de crédito” en la venta facturada: el monto arranca con lo devuelto sin nota de crédito y lo podés cambiar hasta lo que queda de la factura.',
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
          'Tocá “Publicar”: se crea con el título, las fotos, la descripción, los datos de la ficha técnica que Mercado Libre reconoce y el stock del producto (menos el colchón anti-sobreventa), y nace vinculada. Si el colchón se come todo el stock (por ejemplo, 2 de colchón y 2 disponibles), no se publica y te lo avisa.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Con qué precio se publica',
            text: 'Con “Sincronizar precios” prendido, sale con el precio de tu catálogo más el “Recargo para Mercado Libre (%)”. Con la sincronización de precios apagada, sale al mismo precio que en tu tienda: el recargo no se aplica.',
          },
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
          'Cargá el costo y tocá “Guardar” en esa fila. El margen se calcula al instante (en rojo si es menor al 15%) para que veas si estás vendiendo demasiado barato. Arriba ves cuántas variantes tienen costo, el margen promedio, cuántas tienen margen bajo y cuántas faltan cargar.',
          'Para catálogos grandes usá el CSV: la plantilla de Exportar/Importar tiene la columna «Costo». Exportá, completá esa columna en Excel y volvé a importar.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            text: 'Si cargás tus compras en Compras e importaciones, al recibir la mercadería el costo de cada variante se actualiza solo con lo que te costó de verdad puesta en el depósito, con los gastos que cargaste en esa compra (flete, despachante, impuestos) repartidos entre los productos.',
          },
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
          'La ganancia solo se calcula sobre las ventas cuyos productos tenían costo cargado al momento de venderse — el resto se excluye para no inventar números. Con “Cargar costos” vas directo a Productos → Costos. A medida que cargues costos, las ventas nuevas van a entrar completas.',
          'Si ninguna venta del período tiene costo, en lugar de los números ves ese aviso. Y si en el período no hubo ventas, te lo dice y te ofrece mirar un período más largo: no es que falten costos.',
          'El envío cobrado al cliente no se cuenta como ganancia: se asume que cubre lo que le pagás al correo.',
        ],
      },
      {
        heading: 'Ganancia por canal y Mercado Libre',
        paragraphs: [
          '“Ganancia por canal” separa lo que te deja cada origen de venta, según la marca de origen (utm_source) del link que trajo al comprador: redes, email, publicidad o directo. Cómo marcar tus links está en el artículo “Estadísticas”. La tarjeta “Canal Mercado Libre” usa la comisión real que cobró ML en cada venta, así ves si ese canal te conviene de verdad o solo te mueve volumen. Ojo: ahí el costo es el de HOY de las variantes vinculadas (no el del día de la venta), y si dice “sin dato” en comisiones, traelas con “Importar últimas ventas” en Configuración → Mercado Libre.',
        ],
      },
      {
        heading: 'El retorno real de tu publicidad en Meta',
        paragraphs: [
          'Abajo de todo, en “Pauta de Meta Ads”, tocá “Conectar Meta Ads”, autorizá con tu usuario de Facebook y elegí la cuenta publicitaria. Desde ahí ves el gasto del período, la ganancia real del mismo período y el ROAS real, también por campaña. Esta sección aparece siempre, aunque todavía no tengas ventas o costos cargados, para que puedas conectarla desde el primer día.',
          'El ROAS real es ganancia ÷ gasto, no facturación ÷ gasto como lo calcula Meta. Por eso da más bajo, y por eso sirve: menos de 1 (en rojo) significa que la publicidad te cuesta más de lo que te deja.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'La conexión con Meta dura unos 60 días; cuando vence, el botón pasa a “Reconectar Meta”. Esto no es el píxel: el píxel se carga aparte, en Configuración → Medición y píxeles. Si en vez del botón ves solo un texto, la plataforma todavía no tiene configurada la app de Meta.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Desconectar o cambiar de cuenta',
            text: '“Desconectar”, arriba a la derecha de la tarjeta, borra la conexión: se deja de leer el gasto y el ROAS real desaparece, pero tus campañas en Meta no se tocan. Es también la forma de pasar a otra cuenta de Meta: desconectás y volvés a conectar con la otra. Conectar, elegir la cuenta y desconectar los puede hacer quien tiene el permiso “Conectar Meta Ads”; el resto del equipo ve la pauta pero no esos botones.',
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
          'Agregá los productos buscándolos por nombre o SKU, con la cantidad de cada uno. Si dejás un precio vacío, se completa con el que le toca al cliente; lo podés cambiar línea por línea.',
          'Si querés, poné un “Descuento ($)” sobre el total y unas “Notas” con las condiciones (entrega, formas de pago).',
          'En “Válido hasta” poné hasta cuándo vale. Por defecto son 15 días.',
          'Tocá “Guardar”. Con “Imprimir” lo pasás a papel o a PDF para mandarlo, y cuando se lo mandes tocá “Marcar como enviado”.',
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
          'Si acepta, tocás "El cliente aceptó" y elegís cómo se cobra: efectivo, transferencia o cuenta corriente. Se crea la venta con los precios del presupuesto, se descuenta el stock y sale la factura si tenés la facturación automática activa. El presupuesto queda con el link "Se convirtió en una venta — verla en Ventas" y ya no se edita: si hay que cambiar algo, se hace sobre la venta.',
          'Si rechaza, tocás "El cliente lo rechazó". Después lo podés reabrir con "Reabrir para renegociar": no hace falta empezar de cero.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Un presupuesto vencido no se acepta',
            text: 'Con inflación, cerrar al precio del mes pasado es vender a pérdida. Para poder aceptarlo, revisá los precios y tocá “Extender 15 días más”: es un botón aparte justamente para que sea una decisión y no un descuido.',
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

  seguimiento: {
    title: 'Números de pedido, “Seguí tu pedido” y la cuenta del comprador',
    intro:
      'Cada venta tiene un número corto de tu tienda (#1001, #1002…) y el comprador puede ver en qué está su pedido, con cuenta o sin ella.',
    category: 'Ventas y pagos',
    keywords: [
      'número de orden',
      'nro de pedido',
      'tracking',
      'estado del pedido',
      'mis pedidos',
      'direcciones',
    ],
    sections: [
      {
        heading: 'El número de pedido',
        paragraphs: [
          'Las ventas se numeran solas, en orden y por tienda, empezando en #1001. Es el número que ve el comprador en la página de gracias, en los mails y en WhatsApp, el que se imprime en la etiqueta de Correo Argentino y el que trae la planilla de ventas.',
          'En Ventas podés buscar por número: “1042” o “#1042” trae ese pedido exacto. Las ventas de antes de la numeración recibieron su número en el orden en que se hicieron; el código viejo de 8 letras (el de las etiquetas anteriores) se sigue encontrando.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            text: 'Si editaste los mails automáticos, {{order_id}} ahora es el número de pedido (sin el #) y {{tracking_link}} es el link a “Seguí tu pedido” de esa compra.',
          },
        ],
      },
      {
        heading: 'Seguí tu pedido (sin cuenta)',
        paragraphs: [
          'En /seguimiento el comprador escribe el email con el que compró y el número de pedido, y ve los pasos (recibido, pago acreditado, despachado o listo para retirar, entregado), el link del correo para seguir el envío y el detalle de la compra. Si pagó por transferencia o va a pagar al retirar y todavía no registraste el pago, ahí mismo ve cuánto y cómo pagar. Los mails de confirmación traen un link que lo abre directo, sin escribir nada.',
          '“Entregado” solo aparece en los envíos de Andreani y Zipnova creados desde el panel, y recién cuando alguien consulta el estado desde la venta (“Seguimiento” en Andreani, “Actualizar estado” en Zipnova): no se actualiza solo. Con el resto, el último paso que ve el comprador es “Despachado”.',
          'El link está en el pie de la tienda, en “Mi cuenta” y en los mails. Si el email o el número no coinciden, la respuesta es siempre la misma: nadie puede averiguar quién compró en tu tienda probando emails. Y hay un tope de intentos por conexión.',
        ],
      },
      {
        heading: 'El link del correo',
        paragraphs: [
          'Con los envíos creados desde el panel (Andreani, Zipnova) el link sale solo. Si cargás el seguimiento a mano al despachar, se arma para Correo Argentino (cuando el medio de envío dice “Correo” o el número tiene el formato CP123456789AR) y para Andreani; también podés pegar directamente el link del correo.',
        ],
      },
      {
        heading: 'La cuenta del comprador',
        paragraphs: [
          'Con cuenta, el comprador ve todos sus pedidos con su número y el seguimiento, entra al detalle de cada uno (factura en PDF si está emitida, “Volver a comprar”, el chat posventa y el Botón de arrepentimiento con el número ya cargado) y guarda sus direcciones con una predeterminada, que el checkout usa para completarse solo. En “Mis conversaciones” tiene juntas todas sus consultas del chat posventa (lo explica el artículo «Chat posventa»).',
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
