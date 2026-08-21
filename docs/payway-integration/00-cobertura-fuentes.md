# 00 — Cobertura de fuentes

**Fecha de relevamiento:** 2026-08-20
**Alcance:** documentación pública de Payway (ex Decidir 2) para integración de pagos con tarjeta en e-commerce.

---

## 1. Limitación de entorno (leer primero)

El relevamiento **no pudo hacerse sobre el portal oficial de developers**. Los tres dominios que pediste están inaccesibles desde este entorno de ejecución:

| URL | Resultado | Detalle |
|---|---|---|
| https://developers.payway.com.ar/catalog | ❌ **INACCESIBLE** | SPA Next.js: el HTML servido está vacío, el contenido se hidrata por JS. El proxy de red del sandbox además devuelve `403` en el `CONNECT` al dominio, por lo que tampoco se pudo renderizar con navegador headless (`net::ERR_TUNNEL_CONNECTION_FAILED`). |
| https://developers.payway.com.ar/catalog?category=Pagos | ❌ **INACCESIBLE** | Ídem. |
| https://docs.payway.com.ar/ | ❌ **INACCESIBLE** | Ídem. Sin `sitemap.xml`. |
| https://developers.payway.com.ar/catalog/doc/ms_documentation_proxy_v1 | ❌ **INACCESIBLE** | Ídem. No se pudo extraer OpenAPI/Swagger. |
| https://documentacion-ventasonline.payway.com.ar/ | ❌ **INACCESIBLE** | Stoplight SPA. HTML vacío, sin `sitemap.xml` (404). |
| https://web.archive.org / archive.ph | ❌ **BLOQUEADO** | `403` del proxy. No se pudieron recuperar snapshots históricos. |
| https://api.github.com | ❌ **BLOQUEADO** | `403` del proxy (se sorteó usando `data.jsdelivr.com` como listador de árboles). |

**Consecuencia metodológica:** el índice del catálogo de productos de Payway **no pudo enumerarse** y se declara como **GAP-01**. Toda la especificación se construyó a partir del **código fuente de los SDKs y plugins oficiales de Payway publicados en GitHub bajo la organización `payway-ar`**, más fuentes de tercero explícitamente marcadas como tales.

Esto tiene una ventaja no menor: **el código fuente es más confiable que la prosa de la documentación** para los contratos HTTP (paths, headers, campos, obligatoriedad), porque es lo que efectivamente se ejecuta contra la API. Y una desventaja: **las tablas de referencia (códigos de rechazo, tarjetas de prueba, significado de cada estado) no viven en el código** y quedan como GAPs o cubiertas por fuentes de tercero.

---

## 2. Fuentes efectivamente leídas

### 2.1 Repositorios oficiales de Payway (organización `payway-ar`)

Listado completo de la organización (fuente: https://github.com/orgs/payway-ar/repositories):

| Repo | Lenguaje | Qué aportó |
|---|---|---|
| [`sdk-javascript-ventaonline`](https://github.com/payway-ar/sdk-javascript-ventaonline) | JS (frontend) | URL del script `decidir.js`, método `createToken`, atributos `data-decidir`, tabla de errores de validación de tokenización, base URLs de sandbox/prod |
| [`sdk-net-ventaonline`](https://github.com/payway-ar/sdk-net-ventaonline) | C# | README completo (60 KB): flujo de pago, formulario hosted, TID, pago agregador, 3DS, offline, Cybersource, tabla de provincias, divisas. Código: `DecidirConnector.cs`, `Constants/Ambiente.cs`, `Services/*.cs`, `Model/*.cs` (DTOs de request/response), `Clients/RestClient.cs` |
| [`sdk-php-ventaonline`](https://github.com/payway-ar/sdk-php-ventaonline) | PHP | `Decidir/lib/RESTClient.php` (ruteo v1/v2/web, headers, timeouts, códigos HTTP de éxito, selección de API key por operación), `Decidir/lib/*/Data.php` (**obligatoriedad campo por campo**), `Decidir/lib/Exception/*` |
| [`sdk-java-ventaonline`](https://github.com/payway-ar/sdk-java-ventaonline) | Java | `dto/Status.java` (**enum completo de estados**), `dto/StatusDetails.java`, `dto/CardError.java`, `dto/CardErrorReason.java`, `dto/payments/PaymentResponse.java` (**respuesta completa**), `dto/refunds/*`, `dto/checkout/*`, `dto/forms/*`, `configuration/DecidirConfiguration.java` (headers, timeouts) |
| [`sdk-node-ventaonline`](https://github.com/payway-ar/sdk-node-ventaonline) | JS (backend) | `lib/utils/constants.js` (**todas las base URLs por ambiente**), `lib/services/*.js` (**paths exactos por operación**), `lib/utils/functions.js` (header `X-Source`), README (ejemplos JSON, contrato de checkout) |
| [`plugin-woocommerce`](https://github.com/payway-ar/plugin-woocommerce) | PHP | **Modelo de promociones y planes de cuotas** (`class-payway-core-functions.php`, `class-payway-promotion-factory.php`), **fórmula de cálculo de interés** (`assets/js/frontend/payment.js`), decisiones Cybersource, códigos HTTP de éxito, host de producción alternativo |
| [`plugin-prestashop`](https://github.com/payway-ar/plugin-prestashop) | PHP | Mapeo de estados Payway → estados de orden, mensajes al usuario en español, controlador AJAX de promociones |
| [`plugin-magento-promotions`](https://github.com/payway-ar/plugin-magento-promotions) | PHP | Confirmación de que las promociones son **locales al comercio**, no un endpoint remoto |
| [`docs`](https://github.com/payway-ar/docs) | MD | Solo plantillas de documentación. Sin contenido técnico. |

### 2.2 Fuentes de tercero (marcadas como tales en cada dato)

| Fuente | URL | Qué aportó | Confiabilidad |
|---|---|---|---|
| GitBook oficial histórico "Manual de Integración Decidir" (v1/SPS) | https://decidir.gitbooks.io/documentacion/content/Anexos/TablasReferencia/MediosDePago.html · `/IdsMotivo.html` | **Tabla de medios de pago** y **tabla de códigos de rechazo por marca** | Oficial pero de la generación v1 — usar con cautela en v2 |
| ActiveMerchant (Shopify) — gateway Decidir | https://github.com/activemerchant/active_merchant/blob/master/lib/active_merchant/billing/gateways/decidir.rb | Mapeo de `reason.id` → categoría de error, `payment_method_id` de la plataforma nueva (104/105/106/108/139) | Tercero, pero código productivo contra el sandbox real |
| ActiveMerchant — tests remotos | https://github.com/activemerchant/active_merchant/blob/master/test/remote/gateways/remote_decidir_test.rb | **Tarjetas de prueba**, incluida la que fuerza rechazo | Tercero, ejecutable contra sandbox |
| Forks del SDK PHP/.NET v2 con README íntegro | https://github.com/guiwoda/decidir-sdk-php-v2 · https://github.com/fjlenatz/sdk-php-v2 · https://github.com/sindrunas/sdk-.net-v2 | Tabla de medios de pago v2 (idéntica en 3 forks independientes) | Tercero, copia literal del README oficial |
| KB Quinttos | https://quinttos.zohodesk.com/portal/es/kb/articles/tarjetas-de-crédito-y-débito-de-prueba-de-decidir-25-9-2023 | Tarjetas de prueba con datos de titular | Tercero |
| Ayuda Payway | https://ayuda.payway.com.ar/novedades/mandatorio-no-reintentes-transacciones-denegadas-consulta-estas-instrucciones | Política de no reintentar transacciones denegadas | Oficial (portal de ayuda, no de developers) |
| Issues públicos de los SDKs | https://github.com/payway-ar/sdk-php-ventaonline/issues/33 · https://github.com/payway-ar/sdk-node-ventaonline/issues/42 | Endpoint `payment-methods/{id-moneda}`, ejemplo real de respuesta `review` | Oficial (repo de Payway) |

---

## 3. Registro de GAPs

| ID | GAP | Impacto | Cómo cerrarlo |
|---|---|---|---|
| **GAP-01** | Índice del catálogo de productos de `developers.payway.com.ar/catalog` | Bajo para esta integración (solo afecta el "qué más ofrece Payway") | Abrir el portal desde una red sin proxy |
| **GAP-02** | Tabla oficial y vigente de **códigos de rechazo v2** (`status_details.error.reason.id`) con descripción en español | **Alto** — condiciona el mapeo de mensajes al comprador | Página "Manejo de errores de medios de pago" del portal, o pedirla a soporte |
| **GAP-03** | Tabla de **reason codes de Cybersource** y significado de las decisiones `green/red/yellow/BLUE/black` | Medio | Página "Manejo de errores CyberSource" |
| **GAP-04** | **Significado textual** de cada estado del enum `Status` (¿qué implica `pre_approved` vs `accredited` vs `adhered`?) | **Alto** — condiciona la máquina de estados de la orden | Manual de Integración |
| **GAP-05** | Tarjetas de prueba **oficiales** de sandbox y mecanismo para forzar cada escenario de rechazo | Medio (mitigado parcialmente por ActiveMerchant) | Manual de Integración / soporte |
| **GAP-06** | Existencia, payload, firma y política de reintentos de **webhooks**. Solo existe evidencia de un campo `notifications_url` en el checkout hosted, sin especificación | **Alto** — define si la arquitectura es push o polling | Pregunta directa a soporte (ver `01-resumen-ejecutivo.md`) |
| **GAP-07** | **Rate limits** numéricos de la API | Medio | Soporte |
| **GAP-08** | Existencia de un **modelo marketplace/split** real y su relación con multi-tenant | **Alto** — es la decisión arquitectónica central de Tiendafy | Soporte comercial |
| **GAP-09** | Endpoint remoto de **promociones/cuotas vigentes**. La evidencia indica que **no existe**: los tres plugins oficiales las modelan localmente | **Alto** — implica cargar planes a mano en Tiendafy | Soporte |
| **GAP-10** | Endpoint de **consulta de BIN**. No existe en ningún SDK. Existe `GET /payment-methods/{id-moneda}` pero un issue oficial reporta que devuelve vacío | Medio | Soporte |
| **GAP-11** | Contradicción de host productivo entre SDKs: `live.decidir.com` (.NET) vs `ventasonline.payway.com.ar` (Node/PHP/Java) | **Alto** — hay que saber a cuál apuntar | Soporte / certificación |
| **GAP-12** | Contradicción en `payment_method_id` de Mastercard/Maestro/Cabal entre la tabla clásica (15/99/67) y la plataforma nueva vía ActiveMerchant (104/106/108) | **Alto** | Soporte |
| **GAP-13** | Longitudes, formatos y regex de validación de cada campo. Ningún SDK los valida | Medio | Manual de Integración |
| **GAP-14** | Contradicción de path del checkout: `/checkout-payment-button/link` (Node/PHP) vs `payments/link` (.NET) | Medio | Solo relevante si se elige checkout hosted |
| **GAP-15** | Reportes de conciliación: formato, frecuencia, canal de acceso | Medio | Soporte / portal de comercios |
| **GAP-16** | Existencia y contrato de **pre-autorización + captura en dos pasos**. Hay un `PUT /payments/{id}` llamado `confirmPayment`/`CapturePayment` en los SDKs, pero sin documentación de plazos ni de cómo se solicita la pre-autorización | **Alto** si se necesita reserva de fondos | Manual de Integración |

---

## 4. Contradicciones detectadas entre fuentes

Se documentan explícitamente porque son trampas reales de implementación.

1. **Host de producción** — ver GAP-11. Tres valores en circulación: `https://ventasonline.payway.com.ar/api/v2` (SDK Node `constants.js`, SDK Java), `https://live.decidir.com/api/v2/` (SDK .NET `DecidirConnector.cs`, ActiveMerchant), `https://api.decidir.com/api/v2/` (SDK PHP embebido en el plugin WooCommerce). El más reciente y con marca Payway es `ventasonline.payway.com.ar`.
2. **`payment_method_id` de Mastercard** — ver GAP-12. `15` en la tabla clásica, `104` en ActiveMerchant (plataforma nueva).
3. **Timeout por defecto del SDK Java** — el README dice 20 s, el código (`Decidir.java`) dice `private static Integer timeOut = 79;`.
4. **Estructura de `card_data`** — el .NET la modela plana (`card_number`, `card_holder_name`, `security_code`, …); el Java la modela anidada (`{ card_number, card_holder: {...} }`).
5. **`amount` en centavos vs. pesos** — `/payments` espera **centavos** (el SDK .NET multiplica ×100 antes de enviar), pero el checkout hosted usa `total_price` **en pesos con decimales** (`2500.49`). Inconsistencia real entre endpoints.
6. **`X-Source`** — Node y PHP lo envían siempre; el .NET no. No parece obligatorio.
7. **Listado de pagos** — Node filtra por `merchantId`, Java por `siteId`. Mismo endpoint, distinto nombre de query param.
8. **Filtración de infraestructura interna** — `constants.js` del SDK Node expone `http://decidir.payway-dev.tanzu.intra` y `http://decidir.payway-qa.tanzu.intra`. No usar; son redes internas de Payway.

---

## 5. Cobertura del checklist de 26 preguntas

Ver el detalle al final de `01-resumen-ejecutivo.md`. Resumen: **14/26 respondidas con fuente verificada**, **10/26 parciales con GAP declarado**, **2/26 sin respuesta** (pre-autorización y consulta de BIN).
