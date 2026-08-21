# 13 — Payway vs. Mercado Pago: mapa de equivalencias

> ⚠️ **Este documento es un mapa mental, no una fuente de verdad.** Nada de lo que se afirma acá sobre Payway debe usarse si no está respaldado en `04-api-reference.md`. La comparación sirve para orientarse rápido viniendo de MP, y sobre todo para **detectar dónde la analogía se rompe** — que es donde están los bugs.

---

## 1. Equivalencias conceptuales

| Concepto | Mercado Pago | Payway | ¿Análogo real? |
|---|---|---|---|
| Credencial pública | `PUBLIC_KEY` | `public_key` | ✅ Sí |
| Credencial privada | `ACCESS_TOKEN` | `private_key` | ⚠️ **Parcial.** El de MP es un token OAuth renovable con scopes; el de Payway es una API key estática sin scopes ni expiración |
| Header de auth | `Authorization: Bearer <token>` | `apikey: <key>` | ⚠️ Distinto formato |
| Identificador del comercio | `collector_id` / `user_id` | `site_id` | ✅ Sí |
| SDK de tokenización frontend | `MercadoPago.js` / Secure Fields | `decidir.js` | ✅ Sí |
| Tokenización | `POST /v1/card_tokens` | `POST /api/v2/tokens` | ✅ Sí |
| Ejecución del pago | `POST /v1/payments` | `POST /api/v2/payments` | ✅ Sí |
| Nuestro id de referencia | `external_reference` | `site_transaction_id` | ✅ Sí |
| Id del pago del proveedor | `id` | `id` | ✅ Sí |
| Consulta de un pago | `GET /v1/payments/{id}` | `GET /api/v2/payments/{id}` | ✅ Sí |
| Búsqueda por nuestro id | `GET /v1/payments/search?external_reference=` | `GET /api/v2/payments?siteOperationId=` | ✅ Sí |
| Devolución total | `POST /v1/payments/{id}/refunds` | `POST /api/v2/payments/{id}/refunds` | ✅ Sí |
| Devolución parcial | `POST /v1/payments/{id}/refunds` con `{amount}` | Ídem | ✅ Sí |
| Anular una devolución | ❌ **No existe** | `DELETE /payments/{id}/refunds/{refundId}` | ⚠️ **Payway tiene algo que MP no** |
| Cuotas | `installments` | `installments` | ⚠️ Ver §3.3 |
| Marca del medio de pago | `payment_method_id: "visa"` (**string**) | `payment_method_id: 1` (**int**) | ⚠️ **Tipos distintos** |
| Monto | `transaction_amount: 1250.45` (**decimal, pesos**) | `amount: 125045` (**int, centavos**) | ❌ **NO son análogos. Ver §3.1** |
| Checkout hosted | Checkout Pro (`preference_id`) | `/web/validate` + `/web/forms/{hash}` | ⚠️ Similar, mecánica distinta |
| Link de pago | Payment Link | `POST /checkout-payment-button/link` | ✅ Sí |
| Tarjetas guardadas | `POST /v1/customers/{id}/cards` (explícito) | Implícito al pagar con `user_id` | ⚠️ **Mecánica muy distinta. Ver §3.4** |
| 3D Secure | `three_d_secure_mode` | `cardholder_auth_required` + `auth_3ds_data` | ⚠️ Ver §3.5 |
| Antifraude | Integrado, transparente | Cybersource, ~40 campos explícitos | ❌ **Muy distinto** |
| Idempotencia | `X-Idempotency-Key` | ❌ **No existe** | ❌ **Ver §3.2** |
| Webhooks | IPN / Webhooks con firma | ❌ **No existen** | ❌ **Ver §3.6** |
| Marketplace / split | `application_fee` + `marketplace` | `sub_payments[]` / `aggregate_data` | ⚠️ Conceptos distintos |
| Consulta de cuotas | `GET /v1/payment_methods/installments` | ❌ **No existe** | ❌ **Ver §3.7** |
| Consulta de BIN | `GET /v1/payment_methods/search?bin=` | ❌ **No existe** | ❌ |
| Ambientes | Un solo host, distingue por credencial | Hosts distintos por ambiente | ⚠️ |

---

## 2. Mapeo de estados

| Payway | Mercado Pago (`status` / `status_detail`) | Notas |
|---|---|---|
| `approved` | `approved` / `accredited` | ✅ Equivalente |
| `rejected` | `rejected` / (varios `status_detail`) | ✅ Equivalente |
| `review` | `in_process` | ✅ Equivalente conceptual |
| `pre_approved` | `authorized` (con `capture: false`) | ⚠️ En MP es explícito; en Payway el mecanismo es un GAP |
| `challenge pending` | `pending` / `pending_challenge` | ✅ Equivalente |
| `fingerprint pending` | (sin equivalente directo) | Payway expone un paso que MP oculta |
| `annulled` | `cancelled` | ✅ |
| `refunded` | `refunded` | ✅ |
| `approved_with_refund` | `approved` + refund parcial asociado | ⚠️ MP no tiene un estado propio para esto |
| `accredited`, `adhered`, `reversed`, `cancelled` | — | ❌ **GAP-04**: semántica desconocida |

**Observación:** MP concentra la información en `status` + `status_detail` (dos campos). Payway la reparte entre `status` + `status_details.error.reason.id` (un enum de 20 valores + un catálogo de códigos numéricos). El enum neutro de siete estados de `12-plan-de-implementacion.md` §1.5 absorbe ambos.

---

## 3. Dónde la analogía se rompe

Esta es la sección que importa. Cada punto acá es un bug esperando ocurrir si se asume paridad.

### 3.1 🔴 El monto — el error más caro

| | Mercado Pago | Payway |
|---|---|---|
| Campo | `transaction_amount` | `amount` |
| Tipo | `decimal` | `long` |
| Unidad | **Pesos** (`1250.45`) | **Centavos** (`125045`) |

Un mapper que copie `order.Total` de la implementación de MP a la de Payway **cobra 100 veces menos**. Y como la operación se aprueba sin error, nadie se entera hasta la conciliación.

**Mitigación de diseño:** el DTO neutral usa un Value Object `Money` que expone `AmountInCents` y `AmountInMajorUnits` como propiedades distintas. Cada gateway toma la que corresponde. La columna de la base es `amount_cents bigint`. **Nunca existe una variable llamada `amount` a secas.**

**Excepción interna de Payway:** el checkout hosted usa `total_price` **en pesos con decimales**. Es inconsistente con `/payments` dentro de la misma API. Si se implementa el checkout, atención especial.

### 3.2 🔴 Idempotencia — no existe

MP tiene `X-Idempotency-Key`: mandás el mismo header dos veces y el segundo request devuelve el resultado del primero, sin cobrar de nuevo. **Payway no tiene nada equivalente.**

Consecuencia: **toda la lógica de prevención de duplicados es responsabilidad nuestra.** Ver `05-flujo-de-pago.md` §6.

Un `retryPolicy` de Polly que funciona perfectamente contra MP (donde el header protege) genera **cobros duplicados** contra Payway. Por eso la política de retry está explícitamente restringida a los GET (`12-plan-de-implementacion.md` §4.1).

### 3.3 🟡 Cuotas — modelo distinto

| | Mercado Pago | Payway |
|---|---|---|
| Consulta de planes | `GET /v1/payment_methods/installments?bin=&amount=` — devuelve planes vigentes con `installment_rate`, `total_amount`, TEA, CFT | ❌ **No existe** |
| Quién calcula el total | MP lo devuelve calculado | **Nosotros**, con un coeficiente que cargamos a mano |
| Campo `installments` | Lo que se muestra = lo que se envía | `fee_period` (mostrado) ≠ `fee_to_send` (enviado) |

Esto es la diferencia de esfuerzo más grande entre las dos integraciones. Con MP, la grilla de cuotas es una llamada a la API. Con Payway, es un módulo de administración completo. Ver `06-cuotas-y-promociones.md`.

### 3.4 🟡 Tarjetas guardadas — mecánica inversa

| | Mercado Pago | Payway |
|---|---|---|
| Guardar | Explícito: `POST /v1/customers/{id}/cards` | **Implícito**: se guarda como efecto del primer pago con `user_id` |
| Listar | `GET /v1/customers/{id}/cards` | `GET /usersite/{userId}/cardtokens` |
| Borrar | `DELETE /v1/customers/{id}/cards/{cardId}` | `DELETE /cardtokens/{id}` |
| Alcance | Por `customer` del comercio | Por `user_id` dentro del `site_id` |

En MP se puede guardar una tarjeta sin cobrar. **En Payway no**: hay que cobrar primero. Si el producto quiere "agregá tu tarjeta ahora, pagá después", con Payway hace falta un cobro de verificación (típicamente $1 + anulación inmediata), lo cual tiene implicancias de UX y de costo.

### 3.5 🟡 3D Secure — control manual

MP maneja 3DS de forma bastante transparente (`three_d_secure_mode: "optional"` y devuelve una URL de challenge). Payway expone la mecánica completa: hay que recolectar 10 campos de browser, manejar dos estados intermedios (`fingerprint pending` → `challenge pending`) y llamar a `/threeds/instruction`.

Además, **`accept_header` e `ip` no se pueden obtener desde JavaScript** — el backend debe completarlos. Es un detalle que no existe en MP y que rompe la simetría del mapper.

### 3.6 🔴 Webhooks — no existen

MP tiene webhooks con firma (`x-signature`) y reintentos. Payway **no tiene webhooks** (salvo el `notifications_url` no especificado del checkout hosted — **GAP-06**).

Consecuencia arquitectónica: la capa de integración debe soportar **dos modelos de actualización de estado**: push (MP) y pull (Payway). Por eso `PaymentGatewayCapabilities` expone `SupportsWebhooks` y `RequiresPolling`.

**Diseño que resuelve ambos elegantemente:** el webhook de MP no ejecuta lógica de negocio — solo publica un `ReconcileCommand` en la misma cola que usa el polling de Payway. El handler es el mismo. Push y pull convergen en un único camino de código. Ver `09-webhooks-conciliacion.md` §2.5.

### 3.7 🟡 Marketplace — conceptos distintos

| | Mercado Pago | Payway |
|---|---|---|
| Modelo | OAuth: el vendedor autoriza a la plataforma. La plataforma cobra con el `access_token` del vendedor y se queda `application_fee` | Sin OAuth. O bien un set de credenciales por comercio, o bien `sub_payments[]` (distribuido), o bien `aggregate_data` (agregador) |
| Comisión de la plataforma | `application_fee` — campo nativo | Un `sub_payment` más apuntando a nuestro `site_id` |
| Onboarding del vendedor | Self-service vía OAuth | **Manual, comercial, con Payway** |

Esta es la diferencia operativa más grande para una plataforma SaaS. Con MP, una tienda nueva se conecta sola en dos clics. Con Payway, hay que gestionar un alta comercial por cada tienda. **Eso condiciona el time-to-value del onboarding de Tiendafy y hay que comunicárselo al negocio.**

### 3.8 🟡 Tipos del `payment_method_id`

MP: string legible (`"visa"`, `"master"`, `"amex"`).
Payway: entero (`1`, `15`, `65`) — **y con una tabla en disputa** (**GAP-12**).

El DTO neutral usa `ProviderMethodCode` como `string` opaco, y la traducción marca→código vive en `payment_provider_method_map` (una fila por proveedor). Así el dominio nunca ve ni `"visa"` ni `1`.

### 3.9 🟢 Lo que Payway hace mejor

Para ser justos, no todo es desventaja:

- **`DELETE /payments/{id}/refunds/{refundId}`** — anular una devolución. MP no lo tiene.
- **TID de la marca** en la respuesta — trazabilidad directa contra liquidación y contracargos, explícita y documentada.
- **Pago distribuido nativo** con TID por subpago, sin OAuth de por medio.
- **Estados de 3DS explícitos** — más trabajo, pero más control y mejor debugging.
- **Sin expiración de credenciales** — no hay que implementar refresh de tokens ni manejar la ventana de renovación.

---

## 4. Resumen para el equipo

Si venís de la integración de Mercado Pago, **estas son las cinco cosas que tenés que desaprender**:

1. **El monto va en centavos, como entero.** No en pesos, no decimal.
2. **No hay `X-Idempotency-Key`.** Nunca reintentes un `POST /payments`. Verificá con `GET /payments?siteOperationId=`.
3. **`402` no es un error HTTP.** Es un rechazo con todo el detalle en el body.
4. **No hay API de cuotas.** Los planes los administramos nosotros, por tenant.
5. **No hay webhooks.** El estado se resuelve sincrónicamente o por polling.

Y **la que tenés que recordar**: el `tid` de la respuesta es lo único que te va a permitir responder "¿esta liquidación de qué venta es?" y "¿este contracargo de qué orden es?". **Guardalo siempre.**
