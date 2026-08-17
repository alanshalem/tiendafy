/**
 * Plantillas legales por defecto del storefront (Argentina). Se muestran en
 * /terminos y /privacidad cuando el merchant NO creó su propia página CMS con
 * ese slug — así toda tienda cumple con lo mínimo desde el día uno y el
 * merchant puede reemplazarlas con su texto propio cuando quiera.
 * Texto plano estructurado (title + sections); el render lo formatea.
 */

interface LegalSection {
  heading: string;
  body: string;
}

export interface LegalDoc {
  title: string;
  intro: string;
  sections: LegalSection[];
}

export function defaultTerms(storeName: string): LegalDoc {
  return {
    title: 'Términos y condiciones',
    intro: `Estos términos regulan la compra de productos en la tienda online de ${storeName}. Al realizar un pedido aceptás estas condiciones.`,
    sections: [
      {
        heading: 'Sobre la tienda',
        body: `${storeName} ofrece sus productos a través de esta tienda online. Los datos de contacto del vendedor están disponibles en la página de Contacto, conforme a la Resolución 104/2005 de Defensa del Consumidor.`,
      },
      {
        heading: 'Precios y pagos',
        body: 'Los precios están expresados en pesos argentinos (ARS) e incluyen IVA salvo indicación en contrario. Los medios de pago disponibles se muestran al finalizar la compra. La operación queda confirmada una vez acreditado el pago.',
      },
      {
        heading: 'Envíos y entrega',
        body: 'Los costos y plazos de envío se informan antes de confirmar la compra. Los plazos son estimados y pueden variar por causas ajenas al vendedor. Ante demoras o inconvenientes con la entrega, contactanos por los medios indicados en la página de Contacto.',
      },
      {
        heading: 'Derecho de arrepentimiento',
        body: 'De acuerdo con el art. 34 de la Ley 24.240 y la Resolución 424/2020, tenés derecho a arrepentirte de la compra dentro de los 10 (diez) días corridos desde la entrega del producto o la celebración del contrato, sin costo adicional. Podés ejercerlo desde el Botón de Arrepentimiento disponible en esta tienda. El producto debe devolverse sin uso y en el mismo estado en que fue recibido.',
      },
      {
        heading: 'Cambios y devoluciones',
        body: 'Además del derecho de arrepentimiento, los cambios y devoluciones por otras causas se rigen por la política informada por la tienda en sus páginas y canales de contacto, y por la Ley 24.240 de Defensa del Consumidor (garantía legal de productos).',
      },
      {
        heading: 'Defensa del consumidor',
        body: 'Ante cualquier reclamo podés comunicarte con la tienda por los canales de Contacto. También podés dirigirte a la Dirección Nacional de Defensa del Consumidor: https://www.argentina.gob.ar/produccion/defensadelconsumidor',
      },
    ],
  };
}

export function defaultPrivacy(storeName: string): LegalDoc {
  return {
    title: 'Política de privacidad',
    intro: `Esta política describe cómo ${storeName} trata los datos personales de quienes compran o navegan en esta tienda online, conforme a la Ley 25.326 de Protección de Datos Personales.`,
    sections: [
      {
        heading: 'Qué datos recolectamos',
        body: 'Datos de contacto y entrega que ingresás al comprar (nombre, email, teléfono, dirección), historial de pedidos, y datos técnicos de navegación (páginas visitadas) con fines estadísticos. Los datos de pago son procesados directamente por el proveedor de pagos (por ejemplo Mercado Pago); esta tienda no almacena números de tarjeta.',
      },
      {
        heading: 'Para qué los usamos',
        body: 'Para procesar y entregar tus pedidos, emitir comprobantes, responder consultas, y —solo si lo aceptaste— enviarte novedades. No vendemos ni cedemos tus datos a terceros, salvo los proveedores necesarios para operar la tienda (procesador de pagos, correo/logística, facturación electrónica ante ARCA).',
      },
      {
        heading: 'Tus derechos',
        body: 'Podés solicitar el acceso, la rectificación o la supresión de tus datos personales en cualquier momento, escribiendo a los canales de la página de Contacto. La Agencia de Acceso a la Información Pública (www.argentina.gob.ar/aaip) es el órgano de control de la Ley 25.326 y atiende denuncias por incumplimiento.',
      },
      {
        heading: 'Seguridad y conservación',
        body: 'Los datos se almacenan con medidas de seguridad razonables y se conservan mientras exista relación comercial o lo exijan obligaciones legales (por ejemplo, fiscales). Al solicitar la supresión, se eliminan salvo los datos que la ley obligue a conservar.',
      },
    ],
  };
}
