import type { HelpArticle } from './helpContent';

export const FINANZAS = {
  tesoreria: {
    title: 'Tesorería: cajas y bancos',
    intro:
      'Dónde está la plata. Cada caja y cada cuenta bancaria con su saldo real, y todo lo que entró y salió de cada una.',
    category: 'Finanzas',
    sections: [
      {
        heading: 'Qué resuelve',
        paragraphs: [
          'Saber cuánto vendiste no te dice dónde está la plata: una parte en Mercado Pago, otra en el banco, otra en la caja del local. Tesorería te lo ordena.',
          'Tesorería son tus cuentas: la caja del mostrador, la caja chica, cada cuenta bancaria. Cada una tiene un saldo que NO se guarda como un número suelto: se calcula sumando su saldo inicial y todos sus movimientos. Por eso el saldo nunca puede quedar discutido con el listado — son la misma cosa.',
        ],
        blocks: [{ type: 'path', segments: ['Tesorería', 'Cajas y bancos'] }],
      },
      {
        heading: 'Crear tus cuentas',
        steps: [
          'Entrá a Tesorería y tocá "Nueva cuenta".',
          'Elegí si es efectivo (una caja) o una cuenta bancaria, y en qué moneda.',
          'Cargá el saldo inicial: lo que hay HOY en esa cuenta. De ahí en adelante el saldo lo calculan los movimientos.',
          'Repetilo para cada lugar donde tengas plata. Lo normal es arrancar con dos o tres.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'tip',
            title: 'El saldo inicial es el único número que cargás a mano',
            text: 'Es la foto del día que empezás a usar el sistema, y se carga solo al crear la cuenta: después no se edita (tampoco el tipo ni la moneda). Si te equivocaste, corregilo con un movimiento de entrada o salida que diga “Corrección del saldo inicial”. Conviene contarla bien una vez.',
          },
        ],
      },
      {
        heading: 'Movimientos y transferencias',
        paragraphs: [
          'Con el botón “Movimiento” cargás cualquier entrada o salida que no viene de un cobro o un pago de Cuentas corrientes: un gasto, un retiro del dueño, un aporte. Lleva concepto y, si querés, una referencia (número de comprobante, de cheque).',
          'Con “Transferir” (aparece cuando tenés dos cuentas o más) movés plata de una cuenta tuya a otra: del efectivo al banco, por ejemplo. No es un ingreso ni un gasto, así que quedan los dos movimientos atados entre sí y no infla los totales de entradas y salidas.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Entre monedas distintas no se puede',
            text: 'Pasar de una cuenta en pesos a una en dólares necesita un tipo de cambio, y el sistema prefiere negarse antes que inventar una equivalencia. Hacelo como dos movimientos, uno en cada cuenta, con el tipo de cambio en el concepto.',
          },
        ],
      },
      {
        heading: 'Lo que entra solo',
        paragraphs: [
          'Los cobros y pagos que registrás en Cuentas corrientes mueven la caja o el banco automáticamente: cuando cobrás una factura, la plata entra a la cuenta que elegiste en el mismo acto. No hay que cargarlo dos veces.',
          'El total por moneda que ves arriba suma solo las cuentas activas, y nunca mezcla monedas: sumar pesos con dólares no significa nada.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Las ventas no entran solas a la caja',
            text: 'Lo que cobrás por la tienda (Mercado Pago, Payway, transferencia, efectivo al retirar) y las ventas manuales cobradas en el momento no generan movimientos en Tesorería. Cuando la plata llega a tu banco o a tu caja, cargala con “Movimiento”. Lo único que entra solo son los cobros y pagos de Cuentas corrientes.',
          },
        ],
      },
    ],
  },

  cuentasCorrientes: {
    title: 'Cuentas corrientes',
    intro:
      'Quién te debe y a quién le debés, comprobante por comprobante — y cómo se salda cada uno cuando cobrás o pagás.',
    category: 'Finanzas',
    sections: [
      {
        heading: 'Cómo se lee un saldo',
        paragraphs: [
          'El signo se lee siempre desde tu lado. Para un cliente, saldo positivo significa que te debe. Para un proveedor, saldo negativo significa que le debés. Es una sola regla en vez de dos, justamente para que nadie lea un saldo al revés.',
          'La pantalla lo dice con palabras abajo de cada número ("Nos debe", "Le debemos", "Saldo a favor"), así que no hace falta acordarse del signo.',
        ],
        blocks: [
          {
            type: 'terms',
            items: [
              {
                term: 'Debe',
                def: 'Lo que sube lo que te deben: una venta en cuenta corriente, un pago que le hiciste a un proveedor.',
              },
              {
                term: 'Haber',
                def: 'Lo que baja lo que te deben: un cobro que recibiste, la factura que te emitió un proveedor.',
              },
              {
                term: 'Pendiente',
                def: 'Lo que queda por saldar de un comprobante puntual. Una factura de $100.000 con $60.000 cobrados tiene $40.000 pendientes.',
              },
              {
                term: 'Imputar',
                def: 'Decir a qué comprobante se aplica la plata que entra. Sin imputar, el saldo baja pero no se sabe qué factura quedó saldada.',
              },
            ],
          },
        ],
      },
      {
        heading: 'De dónde salen los movimientos',
        paragraphs: [
          'La mayoría entran solos. Una venta manual o un presupuesto aceptado con el cobro "Cuenta corriente (queda debiendo)" carga la deuda del cliente. Si después reembolsás esa venta, el reembolso no devuelve plata: baja la deuda (o le deja saldo a favor si ya la había pagado). La factura que cargás en una orden de compra carga la deuda con el proveedor.',
          'A mano se cargan dos cosas: el saldo que venía de antes del sistema, y las correcciones. Las dos con el botón "Ajuste", que siempre pide un motivo — un saldo que cambia sin dejar rastro es un saldo que no podés defender cuando el cliente lo discuta.',
        ],
        blocks: [{ type: 'path', segments: ['Tesorería', 'Cuentas corrientes'] }],
      },
      {
        heading: 'Registrar un cobro o un pago',
        steps: [
          'Tocá "Registrar cobro" (o "Registrar pago" si estás en la solapa de proveedores).',
          'Elegí el cliente o el proveedor. Tiene que estar en la agenda: el saldo se acumula por ficha.',
          'Elegí la cuenta donde entra (o de donde sale) la plata y escribí el importe.',
          'Imputá: marcá a qué comprobantes se aplica. El botón "Imputar lo más viejo primero" lo hace solo, que es como se cancela una cuenta normalmente.',
          'Guardá. Queda el recibo numerado, baja el saldo del contacto y se mueve la caja o el banco, todo junto.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Podés cobrar sin imputar todo',
            text: 'Si cobrás más de lo que imputás, la diferencia queda "a cuenta": el saldo baja igual y después la aplicás. Lo que NO se puede es imputarle a un comprobante más de lo que debe, porque el excedente quedaría invisible y el saldo mentiría.',
          },
        ],
      },
      {
        heading: 'Anular un recibo',
        paragraphs: [
          'Si un cheque rebota o cargaste mal un cobro, anulás el recibo. Se revierten las tres cosas que hizo: vuelve la deuda, se descuenta la plata de la cuenta donde entró y se liberan las imputaciones.',
          'Los movimientos de caja no se borran: se contra-asientan. Así el arqueo que hiciste ayer sigue dando lo que dio, y el recibo queda a la vista marcado como anulado en vez de desaparecer.',
        ],
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: 'Anular no es borrar',
            text: 'Es a propósito. Un comprobante que desaparece deja un agujero que nadie puede explicar tres meses después; uno anulado cuenta qué pasó.',
          },
        ],
      },
      {
        heading: 'Vender en cuenta corriente',
        paragraphs: [
          'En Ventas, tocá "Venta manual" y elegí el cobro "Cuenta corriente (queda debiendo)". La venta se cierra igual que cualquier otra —descuenta stock, factura si tenés la facturación automática activa, cuenta en las estadísticas— y lo único distinto es que la plata todavía no entró: el total queda como deuda del cliente.',
          'Hace falta elegir un cliente de la agenda. Sin ficha no hay a quién anotarle la deuda, así que el sistema no deja avanzar.',
          'Lo mismo vale para un presupuesto: al aceptarlo, en “Cómo se cobra” elegí “Cuenta corriente (queda debiendo)”.',
        ],
      },
    ],
  },
} satisfies Record<string, HelpArticle>;
