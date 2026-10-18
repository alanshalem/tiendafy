# Integraciones

Un documento por servicio externo: qué hace en Tiendafy, dónde está el código,
cómo se configura, lo que aprendimos de la API real, cómo probarlo y qué falta.
Estado al 18-oct-2026, revisado contra el código y contra la documentación
oficial de cada servicio (cada documento dice qué se confirmó y cuándo).

En producción hoy andan el email (Resend) y las imágenes en Cloudflare R2. El
resto está completo en código y espera credenciales reales o una prueba de
punta a punta con una cuenta de verdad; ninguno se usó todavía con un cliente.

| Servicio | Para qué | Estado |
|---|---|---|
| [Mercado Pago](./mercadopago.md) | Cobro con tarjeta (Checkout Pro y Brick con 3DS), webhooks, reembolsos totales y parciales con nota de crédito | Código completo, nunca usado en producción. Falta crear la app marketplace de la plataforma, cargar `MP_CLIENT_ID`, `MP_CLIENT_SECRET` y `MP_WEBHOOK_SECRET` en `.env.prod`, probar el 3DS en sandbox y una primera compra real chica, aprobada y devuelta |
| [Payway](./payway.md) | Segundo medio de pago con tarjeta | Código completo, probado contra el sandbox público (cobro, reconsulta y devoluciones). Falta el alta comercial (`site_id` y claves propias, se cargan por tienda), confirmar el host productivo, la certificación y un cobro real hecho y devuelto. Sin 3DS ni antifraude, a propósito |
| [ARCA (AFIP)](./arca.md) | Factura electrónica A/B/C, notas de crédito (varias por venta), padrón por constancia de inscripción | Código completo, probado contra un ARCA simulado; contra el real solo `FEDummy` en homologación. Falta activar un certificado de homologación, emitir el primer CAE real y después pasar a producción (otro certificado y un punto de venta de web services) |
| [Andreani](./andreani.md) | Cotización en el checkout y la ficha, envío, etiqueta, seguimiento | Cotización probada contra la API real. Crear envíos y pedir trazas usan rutas sin versión que la API real contesta con 404: hay que corregirlo antes de la primera prueba. Después, envío, etiqueta y seguimiento esperan las credenciales del alta comercial |
| [Correo Argentino](./correo-argentino.md) | MiCorreo: cotización, sucursales, alta del envío, seguimiento | Código completo, nunca probado con credenciales. El seguimiento manda el `shippingId` en la query y MiCorreo lo espera en el cuerpo: hay que corregirlo. Falta probar con credenciales de TEST y después de PROD |
| [Zipnova](./zipnova.md) | Cotización multi-carrier, envío, etiqueta, seguimiento | Código completo; hosts, autenticación y rutas confirmados contra la doc y la API. Falta que el soporte habilite el modo testing en la cuenta para probar crear envíos y etiquetas |
| [Mercado Libre](./mercadolibre.md) | Ventas, preguntas, mensajes, reclamos, stock y precio, publicar, facturación con NC por devolución | Probado contra una API simulada y con una cuenta de demo; no está en uso. Falta crear la app de plataforma, cargar `MELI_CLIENT_ID` y `MELI_CLIENT_SECRET` en `.env.prod` y probar con una cuenta real |
| [Redes sociales y Meta Ads](./redes-sociales.md) | Publicar en Facebook, Instagram, X y Telegram; gasto real de anuncios | Telegram se puede usar ya (bot de cada tienda). Faltan las apps de plataforma: la de Meta (`SOCIAL_META_*` y `META_*`, con App Review) y la de X (`SOCIAL_X_*`, pago por uso). Nada probado con cuentas reales |
| [Email (Resend)](./email-resend.md) | Mails transaccionales, factura y notas de crédito, plantillas editables, campañas, bajas | En producción. Falta confirmar en Resend el webhook de rebotes y quejas y que `EMAIL_WEBHOOK_SECRET` esté cargado. La factura y las NC no salen en homologación |
| [WhatsApp](./whatsapp.md) | Confirmación de compra, envío y carrito abandonado por WhatsApp Cloud API con plantillas aprobadas | Código completo, credenciales por tienda (sin variables de plataforma). Falta probar con un número de WhatsApp Business real y plantillas aprobadas. El carrito abandonado sale solo a quien tildó la casilla de WhatsApp |

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
- **Andreani:** pasar el cliente a `/v2/ordenes-de-envio` y
  `/v1/envios/{n}/trazas` (ver [andreani.md](./andreani.md), "Lo que
  aprendimos", punto 17).
- **Correo Argentino:** el seguimiento tiene que mandar el `shippingId` en el
  cuerpo (ver [correo-argentino.md](./correo-argentino.md)).
- **Mercado Libre:** cargar `MELI_CLIENT_ID` y `MELI_CLIENT_SECRET` en `.env.prod`
  (el compose ya arma el resto). Con la primera venta `partially_refunded`
  real, revisar `paid_amount` (ver [mercadolibre.md](./mercadolibre.md)).
