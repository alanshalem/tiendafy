import type { HelpLinkId } from './features';

export interface HelpSection {
  heading: string;
  paragraphs?: string[];
  steps?: string[];
}

export interface HelpArticle {
  title: string;
  intro: string;
  sections: HelpSection[];
}

/** Manuales reales de cada parte del sistema. Se muestran en /ayuda/:topic. */
export const HELP_CONTENT: Record<HelpLinkId, HelpArticle> = {
  payments: {
    title: 'Medios de pago',
    intro: 'Cobrá las ventas de tu tienda conectando Mercado Pago. La plata va directo a tu cuenta — Tiendafy nunca la toca.',
    sections: [
      {
        heading: 'Conectá tu cuenta de Mercado Pago',
        paragraphs: [
          'En Configuración → Medios de pago, tocá “Conectá tu cuenta”. Te llevamos a Mercado Pago para que autorices; al volver, quedás conectado.',
          'Usamos OAuth oficial: guardamos un token cifrado, nunca tu usuario ni tu contraseña. Podés desconectar la cuenta cuando quieras.',
        ],
      },
      {
        heading: 'Elegí cómo cobrar',
        steps: [
          'Checkout Pro (recomendado): el cliente paga en Mercado Pago y vuelve a tu tienda. Simple y con la mejor tasa de aprobación.',
          'Checkout on-site: el cliente paga sin salir de tu tienda, con tu diseño. Ideal si querés controlar toda la experiencia.',
        ],
      },
      {
        heading: 'Probalo sin riesgo',
        paragraphs: [
          'Mercado Pago no tiene un “sandbox” aparte: se prueba con cuentas de prueba. Creá un usuario vendedor y uno comprador en tu panel de Mercado Pago, conectá el vendedor, y pagá con las tarjetas de prueba.',
          'El estado lo forzás por el nombre del titular: APRO aprueba, OTHE rechaza, CONT deja pendiente.',
        ],
      },
      {
        heading: 'Comisiones y acreditación',
        paragraphs: [
          'Mercado Pago cobra su comisión según el plazo de acreditación: a 18 días ronda 3,39% + IVA; a 35 días ~1,5% + IVA. Elegís el plazo en tu cuenta de Mercado Pago.',
          'Tiendafy no agrega comisión por venta (queda en 0% por defecto).',
        ],
      },
    ],
  },

  shipping: {
    title: 'Medios de envío',
    intro: 'Definí cómo le llegan los productos a tus clientes y cuánto pagan por el envío.',
    sections: [
      {
        heading: 'Tipos de envío',
        steps: [
          'Envío a domicilio: con costo fijo o gratis a partir de cierto monto.',
          'Retiro en el local / punto de retiro.',
          'A convenir con el comprador (coordinan por WhatsApp o email).',
        ],
      },
      {
        heading: 'Envío gratis como gancho',
        paragraphs: [
          'Activá la barra de “envío gratis” desde el editor de diseño (sección Carrito). Le muestra al cliente cuánto le falta para alcanzar el envío sin cargo y sube el ticket promedio.',
        ],
      },
      {
        heading: 'Próximamente',
        paragraphs: [
          'Las integraciones automáticas con correos (cálculo de costo por código postal en tiempo real) están en el roadmap. Por ahora configurás costos manuales por zona.',
        ],
      },
    ],
  },

  distributionCenters: {
    title: 'Centros de distribución',
    intro: 'Si despachás desde más de un depósito o local, registrá cada uno acá.',
    sections: [
      {
        heading: '¿Para qué sirve?',
        paragraphs: [
          'Un centro de distribución es un punto desde el que salen tus envíos o donde el cliente retira. Si tenés varios, los administrás por separado.',
        ],
      },
      {
        heading: 'Cómo agregar uno',
        steps: [
          'Tocá “Agregar”.',
          'Cargá el nombre y la dirección del centro.',
          'Guardá. Después podés asociarlo a tus medios de envío.',
        ],
      },
    ],
  },

  contact: {
    title: 'Información de contacto',
    intro: 'Mostrar tus datos de contacto en la tienda es obligatorio por ley en Argentina.',
    sections: [
      {
        heading: '¿Por qué es obligatorio?',
        paragraphs: [
          'La Resolución N° 104/2005 de Defensa del Consumidor exige que tu tienda online muestre datos de contacto reales y visibles (email, dirección y teléfono).',
          'No cumplir puede traerte sanciones. Cargá la info verdadera de tu negocio.',
        ],
      },
      {
        heading: 'Qué cargar',
        steps: [
          'Email de la tienda (puede ser distinto al de tu login).',
          'Dirección del local o showroom.',
          'Teléfono de contacto.',
          'Un texto informativo opcional (horarios, aclaraciones).',
        ],
      },
      {
        heading: '¿Dónde aparece?',
        paragraphs: [
          'En la página de Contacto de tu tienda y en el pie de página, para que cualquier comprador pueda verlos.',
        ],
      },
    ],
  },

  whatsapp: {
    title: 'Botón de WhatsApp',
    intro: 'Mostrá un botón flotante para que tus clientes te escriban por WhatsApp con un toque.',
    sections: [
      {
        heading: 'Cargá tu número',
        paragraphs: [
          'Ingresá el número con código de país y sin el “+”. Para Argentina el formato es: 54 + 9 (celular) + característica + número.',
          'Ejemplo: para 11 2345-6789 (CABA, celular) se carga 5491123456789.',
        ],
      },
      {
        heading: 'Activalo',
        steps: [
          'Tildá “Mostrar un botón flotante en la tienda”.',
          'Tocá Guardar.',
          'Aparece abajo a la derecha en tu tienda y abre el chat de WhatsApp con un mensaje predefinido.',
        ],
      },
    ],
  },

  autoEmails: {
    title: 'E-mails automáticos',
    intro: 'Tu tienda manda emails transaccionales sola, sin que hagas nada.',
    sections: [
      {
        heading: 'Qué se envía hoy',
        paragraphs: [
          'Cuando un pago se aprueba, el cliente recibe automáticamente la confirmación de compra con el detalle del pedido. Si una venta se reembolsa, también se le avisa.',
        ],
      },
      {
        heading: 'Próximamente',
        paragraphs: [
          'Más avisos configurables uno por uno: confirmación de envío, pedido listo para retirar, cancelación y factura.',
        ],
      },
      {
        heading: 'Envío real',
        paragraphs: [
          'En desarrollo los emails se registran en los logs. En producción se envían por el servidor SMTP que configures.',
        ],
      },
    ],
  },

  checkout: {
    title: 'Opciones del checkout',
    intro: 'Configurá cómo es el proceso de pago de tu tienda.',
    sections: [
      {
        heading: 'Modo de cobro',
        paragraphs: [
          'Elegís entre Checkout Pro (el cliente paga en Mercado Pago) o on-site (paga dentro de tu tienda) desde Medios de pago.',
        ],
      },
      {
        heading: 'Quién puede comprar',
        paragraphs: [
          'Permitís comprar a todos los clientes o solo a los registrados, según prefieras controlar quién te compra.',
        ],
      },
      {
        heading: 'Checkout acelerado',
        paragraphs: [
          'Autocompleta datos personales y direcciones para que tus clientes compren más rápido guardando su info de forma segura.',
        ],
      },
    ],
  },

  customerMessage: {
    title: 'Mensaje para clientes',
    intro: 'Mostrá un mensaje informativo a tus compradores en momentos clave.',
    sections: [
      {
        heading: '¿Para qué?',
        paragraphs: [
          'Sirve para avisos como demoras, horarios de despacho, promociones o aclaraciones. Aparece durante el checkout y en el seguimiento del pedido.',
        ],
      },
      {
        heading: 'Tiempos de entrega',
        paragraphs: [
          'Si preferís no comprometerte con plazos, podés ocultar los tiempos de entrega de cada medio de envío.',
        ],
      },
    ],
  },

  users: {
    title: 'Usuarios y permisos',
    intro: 'Invitá a tu equipo y definí qué puede ver y hacer cada persona.',
    sections: [
      {
        heading: 'Agregar usuarios',
        steps: [
          'Tocá “Agregar”.',
          'Cargá el email de la persona.',
          'Recibe acceso a tu tienda con los permisos que le asignes.',
        ],
      },
      {
        heading: 'Permisos',
        paragraphs: [
          'Asignás permisos por área (productos, ventas, configuración) para que cada uno toque solo lo suyo. Los roles granulares llegan pronto.',
        ],
      },
      {
        heading: 'Notificaciones',
        paragraphs: [
          'Cada usuario elige qué notificaciones quiere recibir (nuevas ventas, etc.).',
        ],
      },
    ],
  },

  domains: {
    title: 'Dominios',
    intro: 'Tu tienda ya vive en un subdominio gratis; cuando quieras, conectás tu dominio propio.',
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
          'Comprá tu dominio en cualquier registrador (por ej. tudominio.com).',
          'En el panel de tu registrador, apuntá un registro CNAME a la plataforma.',
          'Agregá el dominio en la sección Dominios y guardá.',
          'Esperá la propagación de DNS (puede tardar hasta 48 hs).',
        ],
      },
      {
        heading: 'Verificá la configuración',
        paragraphs: [
          'Cuando el DNS propague, el estado del dominio pasa a “Activado”. Si sigue pendiente después de 48 hs, revisá que el CNAME apunte exactamente a donde indicamos y que no haya registros A en conflicto.',
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
          'El candado HTTPS se emite y renueva solo, sin que hagas nada. Cuando el dominio queda activo, el estado del certificado pasa a “SSL activado”. Puede tardar unos minutos extra después de que el dominio propague.',
        ],
      },
    ],
  },
};
