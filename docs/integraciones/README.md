# Integraciones

Un documento por servicio externo: qué hace en Tiendafy, dónde está el código,
cómo se configura, lo que aprendimos de la API real, cómo probarlo y qué falta.
Estado al 16-oct-2026.

En producción hoy andan el email (Resend) y las imágenes en Cloudflare R2. El
resto está completo en código y espera credenciales reales o una prueba de
punta a punta con una cuenta de verdad.

| Servicio | Para qué | Estado |
|---|---|---|
| [Mercado Pago](./mercadopago.md) | Cobro con tarjeta (Checkout Pro y Brick), webhooks, reembolsos | Código completo, nunca usado en producción. Falta crear la app de la plataforma y cargar `MP_*` en `.env.prod` |
| [Payway](./payway.md) | Segundo medio de pago con tarjeta | Código completo, probado contra el sandbox. Falta el alta comercial (`site_id` y claves propias) y la certificación. Se configura por tienda |
| [ARCA (AFIP)](./arca.md) | Factura electrónica, notas de crédito, padrón | Código completo, probado contra un ARCA simulado (contra el real, solo `FEDummy`). Falta activar el certificado para el primer CAE real |
| [Andreani](./andreani.md) | Cotización en el checkout, envío, etiqueta, seguimiento | Cotización probada contra la API real; envío, etiqueta y seguimiento esperan las credenciales del alta comercial |
| [Correo Argentino](./correo-argentino.md) | MiCorreo: cotización, sucursales, alta del envío, seguimiento | Código completo. Falta probar con credenciales de TEST y después de PROD |
| [Zipnova](./zipnova.md) | Cotización multi-carrier, envío, etiqueta, seguimiento | Código completo. Falta que el soporte habilite el modo testing en la cuenta |
| [Mercado Libre](./mercadolibre.md) | Ventas, preguntas, mensajes, reclamos, stock y precio, publicar | Probado contra una API simulada (y con una cuenta de demo). Falta la app real (`MELI_*` en `.env.prod`) y probar con una cuenta de verdad |
| [Redes sociales y Meta Ads](./redes-sociales.md) | Publicar en Facebook, Instagram, X y Telegram; gasto real de anuncios | Telegram se puede usar ya. Faltan las apps de Meta (con App Review) y de X (pago por uso) |
| [Email (Resend)](./email-resend.md) | Mails transaccionales, plantillas editables, campañas, bajas | En producción. Falta confirmar en Resend el webhook de rebotes y que `EMAIL_WEBHOOK_SECRET` esté cargado |
| [WhatsApp](./whatsapp.md) | Avisos por WhatsApp Cloud API con plantillas aprobadas | Código completo, credenciales por tienda. Falta probar con un número real y plantillas aprobadas |

Las imágenes de las tiendas (Cloudflare R2) y los backups fuera del servidor
están en [despliegue.md](../despliegue.md). Las variables de cada servicio, con qué
conseguir y dónde, en [configuracion.md](../configuracion.md).

## Antes de prender cada una

Lo que los documentos marcan como bloqueante, juntado acá:

- **Mercado Pago:** la creación del link de pago nunca se probó contra la API
  real (hasta el 16-oct usaba una ruta inexistente, ver
  [mercadopago.md](./mercadopago.md), Pendiente): la primera compra chica de
  prueba es obligatoria antes de abrirlo a clientes.
- **Payway:** si Payway da un host productivo distinto de `live.decidir.com`
  o `ventasonline.payway.com.ar`, sumarlo al CSP de la tienda
  (`storefront/src/lib/csp.ts`) además de cargarlo como host alternativo.
- **ARCA:** falta activar un certificado (homologación y después producción)
  y emitir el primer CAE real. El `DH_KEY_TOO_SMALL` de `servicios1.afip.gov.ar`
  ya está resuelto en el cliente (solo ECDHE, sin bajar el nivel de seguridad):
  ver [arca.md](arca.md#tls-contra-arca).
- **Mercado Libre:** cargar `MELI_CLIENT_ID` y `MELI_CLIENT_SECRET` en `.env.prod`
  (el compose ya arma el resto).
