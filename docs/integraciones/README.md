# Integraciones

Un documento por servicio externo: qué hace en Tiendafy, dónde está el código,
cómo se configura, lo que aprendimos de la API real, cómo probarlo y qué falta.
Estado al 15-oct-2026.

| Servicio | Para qué | Estado |
|---|---|---|
| [Mercado Pago](./mercadopago.md) | Cobro con tarjeta (Checkout Pro y Brick), webhooks, reembolsos | Código completo. Falta crear la app de la plataforma |
| [Payway](./payway.md) | Segundo medio de pago con tarjeta | Código completo. Falta alta comercial y certificación; antes de cobrar de verdad hay que habilitarlo en la CSP de la tienda y rutear su reembolso (ver Pendiente) |
| [ARCA (AFIP)](./arca.md) | Factura electrónica, notas de crédito, padrón | Código completo. Falta el certificado para el primer CAE real |
| [Andreani](./andreani.md) | Cotización en el checkout, envío, etiqueta, seguimiento | Cotización probada contra la API real; envío y etiqueta sin probar |
| [Correo Argentino](./correo-argentino.md) | MiCorreo: cotización, sucursales, alta del envío | Código completo. Falta probar con credenciales reales |
| [Zipnova](./zipnova.md) | Cotización multi-carrier, envío, etiqueta, seguimiento | Código completo. Falta el modo testing en la cuenta |
| [Mercado Libre](./mercadolibre.md) | Ventas, preguntas, mensajes, reclamos, stock y precio, publicar | Probado contra una API simulada. Falta la app real |
| [Redes sociales y Meta Ads](./redes-sociales.md) | Publicar en Facebook, Instagram, X y Telegram; gasto real de anuncios | Telegram listo; faltan las apps de Meta y X |
| [Email (Resend)](./email-resend.md) | Mails transaccionales, plantillas editables, campañas, bajas | En producción. Confirmar el webhook de rebotes en Resend |
| [WhatsApp](./whatsapp.md) | Avisos por WhatsApp Cloud API con plantillas aprobadas | Código completo. Falta probar con un número real |

Las imágenes de las tiendas (Cloudflare R2) y los backups fuera del servidor
están en [DEPLOY.md](../DEPLOY.md). Las variables de cada servicio, con qué
conseguir y dónde, en [CONFIGURACION.md](../CONFIGURACION.md).

## Antes de prender cada una

Lo que los documentos marcan como bloqueante, juntado acá:

- **Payway:** la política de seguridad de la tienda (`storefront/src/lib/csp.ts`)
  no deja cargar `decidir.js` ni hablar con su API, y el reembolso desde el
  panel de una venta cobrada con Payway va contra Mercado Pago.
- **ARCA:** en producción, `servicios1.afip.gov.ar` puede rechazar el TLS con
  `DH_KEY_TOO_SMALL` y la imagen de la API no baja el nivel de seguridad de
  OpenSSL. Probarlo contra producción apenas esté el certificado.
- **Mercado Libre:** cargar `MELI_CLIENT_ID` y `MELI_CLIENT_SECRET` en `.env.prod`
  (el compose ya arma el resto).
