# 04 — API Reference

> **Base URLs** (ver `02-alta-y-credenciales.md`)
> Sandbox v2: `https://developers.decidir.com/api/v2`
> Producción v2: `https://ventasonline.payway.com.ar/api/v2` ⚠️ ver **GAP-11**
>
> **Todos los montos (`amount`) viajan en centavos como entero.** `$1.250,45` → `125045`.
> Excepción: `total_price` del checkout hosted viaja en pesos con decimales (`2500.49`). Inconsistencia real de la API.

---

## Índice de endpoints

| # | Operación | Método | Path | Key |
|---|---|---|---|---|
| 1 | Health check | GET | `/healthcheck` | pública |
| 2 | Tokenización de tarjeta | POST | `/tokens` | **pública** |
| 3 | Ejecución del pago | POST | `/payments` | privada |
| 4 | Consulta de un pago | GET | `/payments/{id}` | privada |
| 5 | Listado de pagos | GET | `/payments` | privada |
| 6 | Captura / confirmación | PUT | `/payments/{id}` | privada |
| 7 | Devolución total | POST | `/payments/{id}/refunds` | privada |
| 8 | Devolución parcial | POST | `/payments/{id}/refunds` | privada |
| 9 | Historial de devoluciones | GET | `/payments/{id}/refunds` | privada |
| 10 | Anulación de devolución | DELETE | `/payments/{id}/refunds/{refundId}` | privada |
| 11 | Challenge 3DS | POST | `/threeds/instruction` | privada + `X-Consumer-Username` |
| 12 | Listar tarjetas tokenizadas | GET | `/usersite/{userId}/cardtokens` | privada |
| 13 | Borrar tarjeta tokenizada | DELETE | `/cardtokens/{cardTokenId}` | privada |
| 14 | Cierre de lote | POST | `/api/v1/closures/batchclosure` | privada |
| 15 | Validate (form hosted) | POST | `/web/validate` | form/PCI + `X-Consumer-Username` |
| 16 | Link de checkout | POST | `/api/v1/checkout-payment-button/link` | privada |
| 17 | Medios de pago por moneda | GET | `/payment-methods/{currencyId}` | ⚠️ ver nota |

---

## 1. Health Check

### Health check
- **Método y path:** `GET /healthcheck`
- **Ambiente:** sandbox `https://developers.decidir.com/api/v2/healthcheck` · producción `https://ventasonline.payway.com.ar/api/v2/healthcheck`
- **Auth:** `apikey: <public_key>` (SDK Node) / `<private_key>` (SDK PHP) — ambos funcionan
- **Headers adicionales:** ninguno
- **Request:** sin body
- **Response OK (200):**

| Campo | Tipo | Descripción |
|---|---|---|
| name | string | Nombre del servicio |
| version | string | Versión de la API |
| buildTime | string | Fecha de build |

```json
{ "name": "decidir-api", "version": "2.x", "buildTime": "..." }
```
- **Notas y trampas:** útil como probe de liveness, no como health de negocio — puede responder 200 con el adquirente caído.
- **Fuente:** https://raw.githubusercontent.com/payway-ar/sdk-node-ventaonline/master/lib/services/healthcheck.js · https://raw.githubusercontent.com/payway-ar/sdk-php-ventaonline/master/Decidir/lib/HealthCheck.php

---

## 2. Tokenización

### Tokenización de tarjeta (uso desde el browser)
- **Método y path:** `POST /tokens`
- **Ambiente:** sandbox `https://developers.decidir.com/api/v2/tokens` · producción `https://ventasonline.payway.com.ar/api/v2/tokens`
- **Auth:** `apikey: <PUBLIC_KEY>` — **clave pública**. Esta es la única llamada que se hace desde el browser.
- **Headers adicionales:** `Content-Type: application/json`
- **Request:**

| Campo | Tipo | Oblig. | Formato/longitud | Descripción |
|---|---|---|---|---|
| card_number | string | **Sí** | 13–19 dígitos, sin espacios | PAN |
| card_expiration_month | string | **Sí** | `MM` (2 dígitos) | Mes de vencimiento |
| card_expiration_year | string | **Sí** | `YY` (2 dígitos) | Año de vencimiento |
| card_holder_name | string | **Sí** | Tal como figura en la tarjeta | Titular |
| security_code | string | No* | 3–4 dígitos | CVV/CVC. *Obligatorio de hecho para autorizar. |
| card_holder_identification | object | No | — | Documento del titular |
| card_holder_identification.type | string | No | `"dni"` \| `"no doc"` \| `"cuil"` | Tipo de documento |
| card_holder_identification.number | string | No | numérico | Nro. de documento |
| card_holder_birthday | string | No | `DDMMAAAA` | Fecha de nacimiento (requerido por algunas promociones) |
| card_holder_door_number | int | No | numérico | Nro. de puerta del domicilio |
| fraud_detection | object | No | — | Antifraude en tokenización |
| fraud_detection.device_unique_identifier | string | No | — | Device fingerprint de Cybersource |
| ip_address | string | No | IPv4 | IP del comprador |

> **GAP-13:** ningún SDK valida longitudes ni formatos. La columna "formato/longitud" es inferida de los ejemplos oficiales, no de una spec.

- **Ejemplo de request:**
```json
{
  "card_number": "4507990000004905",
  "card_expiration_month": "12",
  "card_expiration_year": "30",
  "card_holder_name": "VALENTIN SANTIAGO GOMEZ",
  "security_code": "123",
  "card_holder_identification": { "type": "dni", "number": "29123456" },
  "fraud_detection": { "device_unique_identifier": "a1b2c3d4-..." },
  "ip_address": "190.12.34.56"
}
```

- **Response OK (201):**

| Campo | Tipo | Descripción |
|---|---|---|
| id | string (UUID) | **El token de pago.** Es lo que va en `token` de `/payments` |
| status | string | Estado del token (p.ej. `active`) |
| card_number_length | int | Longitud del PAN |
| date_created | string | ISO 8601 |
| bin | string | Primeros 6 dígitos — **guardar, es obligatorio en `/payments`** |
| last_four_digits | string | Últimos 4 dígitos |
| security_code_length | int | Longitud del CVV |
| expiration_month | int | Mes de vencimiento |
| expiration_year | int | Año de vencimiento |
| date_due | string | **Fecha de expiración del token** |
| cardholder | object | `{ name, identification: { type, number }, birthday, nro_puerta }` |

```json
{
  "id": "be211413-757b-487e-bb0c-283d21c0fb6f",
  "status": "active",
  "card_number_length": 16,
  "date_created": "2026-08-20T14:03:11Z",
  "bin": "450799",
  "last_four_digits": "4905",
  "security_code_length": 3,
  "expiration_month": 12,
  "expiration_year": 30,
  "date_due": "2026-08-20T14:18:11Z",
  "cardholder": { "name": "VALENTIN SANTIAGO GOMEZ", "identification": { "type": "dni", "number": "29123456" } }
}
```

- **Responses de error:**
  - `400` — datos mal formados
  - `401` — API key inválida
  - Errores de validación del `decidir.js` (locales, no HTTP):
    ```json
    { "error": [ { "isValid": false, "error": { "type": "invalid_expiry_date", "message": "Expiry date is invalid", "param": "expiry_date" } } ] }
    ```
    Tipos: `empty_card_number`, `empty_card_holder_name`, `nan_card_number`, `invalid_card_number`, `invalid_expiry_date`, `empty_token`, `invalid_param`.

- **Notas y trampas:**
  - **El token es de un solo uso y de vida corta.** El campo `date_due` de la respuesta lo confirma. **GAP:** el TTL exacto no está documentado; la evidencia empírica de integraciones con Decidir indica ~15 minutos, pero hay que confirmarlo (ver `01-resumen-ejecutivo.md`).
  - **El PAN nunca debe pasar por nuestro backend.** Esta llamada se hace desde el browser.
  - Hay que **propagar el `bin`** de la respuesta al backend porque `POST /payments` lo exige.
  - Existe una variante `POST /tokens` con `apikey` pública que además envía `fraud_detection` (a veces llamada `tokenCs` en los SDKs) — es el **mismo endpoint**, solo cambia el payload.
- **Fuente:** https://raw.githubusercontent.com/payway-ar/sdk-php-ventaonline/master/Decidir/lib/Token/Data.php · https://raw.githubusercontent.com/payway-ar/sdk-net-ventaonline/master/Solution/Decidir/Model/TokenRequest.cs · https://cdn.jsdelivr.net/gh/payway-ar/sdk-java-ventaonline@V2.3.0/src/main/java/com/decidir/sdk/dto/tokens/TokenResponse.java · https://github.com/payway-ar/sdk-javascript-ventaonline

---

## 3. Ejecución del pago

### Ejecución del pago
- **Método y path:** `POST /payments`
- **Ambiente:** sandbox `https://developers.decidir.com/api/v2/payments` · producción `https://ventasonline.payway.com.ar/api/v2/payments`
- **Auth:** `apikey: <PRIVATE_KEY>` — **solo backend**
- **Headers adicionales:**
  ```
  Content-Type: application/json
  Cache-Control: no-cache
  X-Source: <base64, opcional>
  ```
- **Request:**

| Campo | Tipo | Oblig. | Formato/longitud | Descripción |
|---|---|---|---|---|
| site_transaction_id | string | **Sí** | alfanumérico ≤ 39 | Id de la transacción **del comercio**. Único. Es nuestra clave de idempotencia. |
| token | string | **Sí** | UUID ≤ 36 | Token devuelto por `POST /tokens` |
| payment_method_id | int | **Sí** | ver `06-cuotas-y-promociones.md` | Medio de pago (1 = Visa, 65 = Amex) |
| bin | string | **Sí** | 6 dígitos | BIN de la tarjeta (viene de la respuesta del token) |
| amount | long | **Sí** | **centavos**, min 1, max 922337203685 | Importe total |
| currency | string | **Sí** | `"ARS"` \| `"USD"` | Moneda |
| installments | int | **Sí** | 1–99 | Cantidad de cuotas |
| payment_type | string | **Sí** | `"single"` \| `"distributed"` | Tipo de pago |
| sub_payments | array | **Sí** | `[]` si es `single` | Subpagos del pago distribuido |
| sub_payments[].site_id | string | Cond. | — | Site del subpago |
| sub_payments[].amount | long | Cond. | centavos | Debe sumar exactamente `amount` |
| sub_payments[].installments | int | Cond. | — | Cuotas del subpago |
| establishment_name | string | **Sí** | — | Nombre del establecimiento (aparece en el resumen) |
| customer | object | **Sí** | — | Datos del comprador |
| customer.id | string | **Sí** | — | Id del cliente en nuestro sitio |
| customer.email | string | **Sí** | email | Email del comprador |
| customer.ip_address | string | **Sí** | IPv4 | IP real del comprador |
| site_id | string | Cond. | numérico | Nro. de comercio. Solo si se opera con un site distinto al de la API key |
| description | string | No | — | Descripción libre |
| user_id | string | No | — | Id de usuario para tokenización de tarjetas guardadas |
| first_installment_expiration_date | string | No | fecha | Vencimiento de la 1ª cuota |
| plan_id | string | No | — | Plan de cuotas (Ahora 12/18) |
| payment_mode | string | No | `"offline"` | Solo para pagos con cupón |
| cardholder_auth_required | bool | No | — | `true` activa 3DS |
| auth_3ds_data | object | Cond. | — | Requerido si `cardholder_auth_required = true`. Ver `07-seguridad-3ds-pci.md` |
| aggregate_data | object | Cond. | — | Solo en modelo agregador. Ver `02-alta-y-credenciales.md` §4.2.C |
| fraud_detection | object | No | — | Cybersource. Ver `07-seguridad-3ds-pci.md` |
| card_data | object | No | — | **Solo flujo PCI.** No usar en Tiendafy |
| is_tokenized_payment | bool | No | — | `true` para pago con token de red (wallet) |
| token_card_data | object | Cond. | `{ token, eci, cryptogram }` | Token de red (DPAN), solo si `is_tokenized_payment` |

> **Nota sobre obligatoriedad:** la columna "Oblig." refleja `setRequiredFields()` del SDK PHP (`Decidir/lib/Payment/Data.php`), que es la fuente más precisa disponible. El SDK PHP declara requeridos: `id`, `email`, `ip_address` (de `customer`), `site_transaction_id`, `token`, `payment_method_id`, `bin`, `amount`, `currency`, `installments`, `payment_type`, `establishment_name`, `sub_payments`, `aggregate_data`, `customer`, `site_id`. En la práctica `aggregate_data` y `site_id` solo son necesarios en el modelo agregador — el SDK es más estricto que el backend.

- **Ejemplo de request:**
```json
{
  "site_transaction_id": "TF-ORD-2026-000123",
  "token": "be211413-757b-487e-bb0c-283d21c0fb6f",
  "payment_method_id": 1,
  "bin": "450799",
  "amount": 125045,
  "currency": "ARS",
  "installments": 3,
  "description": "Pedido #123 - Tienda Ejemplo",
  "payment_type": "single",
  "sub_payments": [],
  "establishment_name": "TIENDA EJEMPLO",
  "customer": {
    "id": "cust_9f2a",
    "email": "comprador@example.com",
    "ip_address": "190.12.34.56"
  }
}
```

- **Response OK (201):**

| Campo | Tipo | Descripción |
|---|---|---|
| id | long | **Payment ID de Payway.** Clave para consultar/devolver |
| site_transaction_id | string | Eco de nuestro id |
| payment_method_id | int | Medio de pago usado |
| card_brand | string | Marca resuelta por Payway (`"Visa"`, `"Amex MT"`) |
| amount | long | Monto en centavos |
| currency | string | Moneda (**en minúsculas en la respuesta**: `"ars"`) |
| status | string | Estado. Ver `05-flujo-de-pago.md` §4 |
| status_details | object | Detalle del resultado |
| status_details.ticket | string | Nro. de ticket |
| status_details.card_authorization_code | string | **Código de autorización del emisor** |
| status_details.address_validation_code | string | Código de validación de domicilio |
| status_details.error | object\|null | `null` si aprobado. Ver `10-errores-y-codigos.md` |
| date | string | Fecha de la operación |
| customer | object | Eco del comprador |
| bin | string | BIN |
| installments | int | Cuotas |
| first_installment_expiration_date | string\|null | Vencimiento 1ª cuota |
| payment_type | string | `single` / `distributed` |
| sub_payments | array | Detalle por subpago |
| site_id | string | Site que procesó |
| fraud_detection | object | `{ status }` — resultado de Cybersource |
| establishment_name | string\|null | |
| spv | object\|null | Datos SPV |
| confirmed | object\|null | Datos de captura si hubo confirmación en dos pasos |
| pan | string\|null | PAN enmascarado |
| customer_token | string | **Token persistente del cliente** (para tarjetas guardadas) |
| card_data | string | Referencia relativa `"/tokens/971344"` |
| tid | string | **Transaction ID de la marca.** Solo Visa/Master/Amex y solo si fue aprobada. Es la clave para cruzar contra liquidación y contracargos |
| auth_3ds_response | object | Resultado 3DS: `{ id, status, authentication_value, commerce_indicator, protocol_version, directory_server_transaction_id }` |

```json
{
  "id": 971344,
  "site_transaction_id": "TF-ORD-2026-000123",
  "payment_method_id": 1,
  "card_brand": "Visa",
  "amount": 125045,
  "currency": "ars",
  "status": "approved",
  "status_details": {
    "ticket": "4",
    "card_authorization_code": "203430",
    "address_validation_code": "VTE0011",
    "error": null
  },
  "date": "2026-08-20T14:05Z",
  "customer": { "id": "cust_9f2a", "email": "comprador@example.com", "ip_address": "190.12.34.56" },
  "bin": "450799",
  "installments": 3,
  "first_installment_expiration_date": null,
  "payment_type": "single",
  "sub_payments": [],
  "site_id": "00020220",
  "fraud_detection": { "status": null },
  "establishment_name": null,
  "spv": null,
  "confirmed": null,
  "pan": null,
  "customer_token": "23e560af28e73b3c001f465d5d54c15ee1f34826744a4ddf68dc6b469dc604f5",
  "card_data": "/tokens/971344",
  "tid": "364656548412345"
}
```

- **Responses de error:**

| HTTP | Significado | Cómo tratarlo |
|---|---|---|
| `201` | Transacción creada (puede estar `approved` o `review`) | Leer `status` |
| **`402`** | **Transacción rechazada.** ⚠️ El body **no** es un error de API, es un `PaymentResponse` completo con `status: "rejected"` y `status_details.error` | **No es un error de integración.** Mapear el `reason.id` a mensaje de usuario |
| `400` | `malformed_request_error` — payload inválido | Bug nuestro. No reintentar |
| `401` | `authentication_error` — API key inválida | Bug de configuración. Alertar |
| `404` | `not_found_error` | No reintentar |
| `409` | `api_error` | Posible duplicado. Consultar antes de reintentar |
| `5xx` | Error de Payway | Reintentar con backoff **solo tras verificar por consulta** que no se cobró |

  Body de error (cuando **no** es 402):
  ```json
  { "error_type": "...", "validation_errors": [ { ... } ], "message": "...", "code": "..." }
  ```

- **Notas y trampas:**
  - ⚠️ **`402` NO es un error.** El SDK .NET lo trata explícitamente así: `if (statusCode == 402) return false;` en `isErrorResponse()`. Una implementación propia que trate 402 como excepción HTTP va a perder el detalle del rechazo.
  - ⚠️ **`amount` en centavos.** El SDK .NET hace `Convert.ToInt64(this.amount * 100)` antes de enviar. Si mandás `1250.45` en vez de `125045`, cobrás mal.
  - ⚠️ **No hay header de idempotencia.** Ver `05-flujo-de-pago.md` §6.
  - ⚠️ **`currency` va en mayúsculas en el request (`"ARS"`) y vuelve en minúsculas en la respuesta (`"ars"`).** No comparar sin normalizar.
  - ⚠️ En pago distribuido, `sum(sub_payments[].amount) == amount` **exacto**, o la operación falla.
  - `seller_id` dentro de `aggregate_data` **solo se envía si el medio de pago es American Express**.
- **Fuente:** https://raw.githubusercontent.com/payway-ar/sdk-php-ventaonline/master/Decidir/lib/Payment/Data.php · https://raw.githubusercontent.com/payway-ar/sdk-net-ventaonline/master/Solution/Decidir/Model/Payment.cs · https://cdn.jsdelivr.net/gh/payway-ar/sdk-java-ventaonline@V2.3.0/src/main/java/com/decidir/sdk/dto/payments/PaymentResponse.java · https://raw.githubusercontent.com/payway-ar/sdk-net-ventaonline/master/Solution/Decidir/Services/Service.cs

---

## 4. Consulta de un pago

### Consulta de un pago
- **Método y path:** `GET /payments/{paymentId}`
- **Variante con datos de tarjeta:** `GET /payments/{paymentId}?expand=card_data`
- **Auth:** `apikey: <PRIVATE_KEY>`
- **Headers adicionales:** ninguno (los GET del SDK Node mandan solo `apikey`)
- **Request:** sin body. `paymentId` es el `id` numérico devuelto por `/payments`.
- **Response OK (200):** idéntica a la respuesta de `POST /payments`.
- **Responses de error:** `401`, `404`
- **Notas y trampas:**
  - `?expand=card_data` devuelve el PAN enmascarado y la identificación del titular. **No persistir esos datos.**
  - Esta es la operación central de la estrategia de recuperación ante timeout y de la conciliación por polling (no hay webhooks confirmados — **GAP-06**).
- **Fuente:** https://raw.githubusercontent.com/payway-ar/sdk-node-ventaonline/master/lib/services/payments.js · https://cdn.jsdelivr.net/gh/payway-ar/sdk-java-ventaonline@V2.3.0/src/main/java/com/decidir/sdk/resources/PaymentApi.java

### Listado de pagos
- **Método y path:** `GET /payments?offset={n}&pageSize={n}&siteOperationId={id}&merchantId={id}`
- **Auth:** `apikey: <PRIVATE_KEY>`
- **Request (query params):**

| Campo | Tipo | Oblig. | Default | Descripción |
|---|---|---|---|---|
| offset | int | No | `0` | Desplazamiento |
| pageSize | int | No | `50` | Máximo de resultados |
| siteOperationId | string | No | — | **Nuestro `site_transaction_id`** |
| merchantId | string | No | — | Site del comercio. ⚠️ El SDK Java usa `siteId` para esto |

- **Response OK (200):**
```json
{ "limit": 50, "offset": 0, "results": [ { /* PaymentResponse */ } ], "has_more": false }
```
- **Notas y trampas:**
  - **`siteOperationId` es la vía para buscar por nuestro id**, lo que lo convierte en la pieza clave de la recuperación de idempotencia: si un `POST /payments` timeoutea, consultamos por `siteOperationId` para saber si se creó.
  - ⚠️ Discrepancia real: Node manda `merchantId`, Java manda `siteId`. Probar ambos en sandbox.
- **Fuente:** https://raw.githubusercontent.com/payway-ar/sdk-node-ventaonline/master/lib/services/payments.js · README del SDK .NET

---

## 5. Captura / confirmación (pre-autorización)

### Captura de un pago pre-autorizado
- **Método y path:** `PUT /payments/{paymentId}`
- **Auth:** `apikey: <PRIVATE_KEY>`. El SDK Java además manda un header `User`.
- **Request:**

| Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|
| amount | long | Sí | Monto a capturar, en centavos. Puede ser ≤ al pre-autorizado |

```json
{ "amount": 125045 }
```
- **Response OK (200):** `PaymentResponse` con el objeto `confirmed` poblado: `{ id, origin_amount, date }`.
- **Notas y trampas:**
  - Los SDKs llaman a esta operación `CapturePayment` (.NET/PHP) y `confirmPayment` (Node/Java) — **es la misma**.
  - ⚠️ **GAP-16:** no está documentado **cómo se solicita** la pre-autorización (¿un flag en `/payments`? ¿un `payment_mode`? ¿configuración del site?), ni el plazo máximo para capturar, ni qué pasa si no se captura. El estado `pre_approved` del enum sugiere que existe, pero el contrato de entrada no aparece en ningún SDK. **Pregunta directa a soporte.**
- **Fuente:** https://raw.githubusercontent.com/payway-ar/sdk-node-ventaonline/master/lib/services/payments.js · https://raw.githubusercontent.com/payway-ar/sdk-net-ventaonline/master/Solution/Decidir/Services/Payments.cs

---

## 6. Devoluciones y anulaciones

### Devolución total / anulación
- **Método y path:** `POST /payments/{paymentId}/refunds`
- **Auth:** `apikey: <PRIVATE_KEY>`
- **Request:** body vacío
```json
{}
```
- **Response OK (201):**

| Campo | Tipo | Descripción |
|---|---|---|
| id | long | **Id de la devolución.** Necesario para anularla |
| amount | long | Monto devuelto (centavos) |
| status | string | `annulled` (si es del día) / `refunded` / `refund_approved` |
| status_details | object | `{ ticket, card_authorization_code, address_validation_code, error }` |
| error | object\|null | `{ type, reason: { id, description, additional_description } }` |
| tid | string | Transaction ID de la marca |
| sub_payments | array | Detalle por subpago |

- **Notas y trampas:** ver `08-postventa.md` para la diferencia anulación vs. devolución.
- **Fuente:** https://raw.githubusercontent.com/payway-ar/sdk-php-ventaonline/master/Decidir/lib/Refund/Data.php · https://cdn.jsdelivr.net/gh/payway-ar/sdk-java-ventaonline@V2.3.0/src/main/java/com/decidir/sdk/dto/refunds/RefundPaymentResponse.java

### Devolución parcial
- **Método y path:** `POST /payments/{paymentId}/refunds` (mismo endpoint, con body)
- **Auth:** `apikey: <PRIVATE_KEY>`
- **Request:**

| Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|
| amount | long | Cond. | Monto parcial a devolver, en centavos |
| sub_payments | array | Cond. | Devolución parcial por subpago |
| sub_payments[].id | long | Cond. | Id del subpago (`subpayment_id` de la respuesta del pago) |
| sub_payments[].amount | long | Cond. | Monto a devolver de ese subpago |

```json
{ "amount": 50000 }
```
```json
{ "sub_payments": [ { "id": 1265395, "amount": 50000 } ] }
```
- **Response OK (201):** igual a la devolución total.
- **Notas y trampas:**
  - **Visa Débito no acepta devoluciones parciales en e-commerce.** Fuente: README del SDK .NET, nota al pie de la tabla de medios de pago.
  - Se pueden encadenar varias devoluciones parciales hasta agotar el monto. **GAP:** el límite de devoluciones parciales por transacción no está documentado.
- **Fuente:** https://raw.githubusercontent.com/payway-ar/sdk-net-ventaonline/master/Solution/Decidir/Model/PartialRefund.cs · https://raw.githubusercontent.com/payway-ar/sdk-php-ventaonline/master/Decidir/lib/PartialRefund/Data.php

### Anulación de una devolución
- **Método y path:** `DELETE /payments/{paymentId}/refunds/{refundId}`
- **Auth:** `apikey: <PRIVATE_KEY>`
- **Request:** sin body
- **Response OK:** `200` o `204`. El SDK PHP convierte un `204` en `{"status":"success"}`.
- **Notas y trampas:** sirve tanto para anular devoluciones totales como parciales. Los SDKs exponen métodos separados (`DeleteRefund` / `DeletePartialRefund`) pero es el mismo endpoint.
- **Fuente:** https://raw.githubusercontent.com/payway-ar/sdk-node-ventaonline/master/lib/services/refunds.js

### Historial de devoluciones
- **Método y path:** `GET /payments/{paymentId}/refunds`
- **Auth:** `apikey: <PRIVATE_KEY>`
- **Response OK (200):** lista de devoluciones asociadas al pago.
- **Fuente:** https://cdn.jsdelivr.net/gh/payway-ar/sdk-java-ventaonline@V2.3.0/src/main/java/com/decidir/sdk/resources/RefundApi.java

---

## 7. 3D Secure

### Envío de instrucción de challenge 3DS
- **Método y path:** `POST /threeds/instruction`
- **Auth:** `apikey: <PRIVATE_KEY>`
- **Headers adicionales:**
  ```
  Content-Type: application/json
  X-Consumer-Username: <x_consumer_username provisto por Payway>
  X-Source: <base64, opcional>
  ```
- **Request:**

| Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|
| id | string | **Sí** | Id del pago devuelto por `/payments` cuando quedó en `challenge pending` |
| instruction_value | string | **Sí** | Valor devuelto por Payway en la respuesta del pago |

```json
{ "id": "971344", "instruction_value": "eyJhbGciOi..." }
```
- **Response OK (200):** un `PaymentAuth3dsResponse` con la **misma forma** que la respuesta de `/payments`.
- **Notas y trampas:**
  - ⚠️ **El pago se retoma con la respuesta de este mismo endpoint.** No hay un segundo `POST /payments`.
  - Los estados intermedios de 3DS son literalmente `"CHALLENGE PENDING"` y `"FINGERPRINT PENDING"` (con espacio, no guion bajo). El enum Java los serializa en minúsculas: `challenge pending`, `fingerprint pending`.
  - Flujo completo en `07-seguridad-3ds-pci.md`.
- **Fuente:** https://raw.githubusercontent.com/payway-ar/sdk-php-ventaonline/master/Decidir/lib/Threeds/Data.php · https://raw.githubusercontent.com/payway-ar/sdk-net-ventaonline/master/Solution/Decidir/Services/Service.cs

---

## 8. Tarjetas tokenizadas (guardadas)

### Listar tarjetas tokenizadas de un usuario
- **Método y path:** `GET /usersite/{userSiteId}/cardtokens`
- **Auth:** `apikey: <PRIVATE_KEY>`
- **Request:** `userSiteId` es el `user_id` que enviamos en `POST /payments`
- **Response OK (200):** lista de:

| Campo | Tipo | Descripción |
|---|---|---|
| token | string | Token persistente de la tarjeta |
| payment_method_id | int | Medio de pago |
| bin | string | BIN |
| last_four_digits | string | Últimos 4 |
| expiration_month | string | Mes |
| expiration_year | string | Año |
| expired | bool | Si está vencida |

- **Notas y trampas:** las tarjetas se tokenizan **implícitamente al hacer el primer pago exitoso** con `user_id`; no hay endpoint de "guardar tarjeta". El token persistente aparece en el campo `token` de la respuesta del pago. Para volver a cobrar, solo se pide el CVV.
- **Fuente:** https://raw.githubusercontent.com/payway-ar/sdk-php-ventaonline/master/Decidir/lib/Tokenization.php · https://cdn.jsdelivr.net/gh/payway-ar/sdk-java-ventaonline@V2.3.0/src/main/java/com/decidir/sdk/dto/tokens/CardToken.java

### Eliminar una tarjeta tokenizada
- **Método y path:** `DELETE /cardtokens/{cardTokenId}`
- **Auth:** `apikey: <PRIVATE_KEY>`
- **Response OK:** `204 No Content`
- **Fuente:** ídem

---

## 9. Cierre de lote

### Cierre de lote
- **Método y path:** `POST /api/v1/closures/batchclosure` ⚠️ **es v1, no v2**
- **Auth:** `apikey: <PRIVATE_KEY>`, `Cache-Control: no-cache`
- **Response OK:** `201`
- **Notas y trampas:** normalmente el cierre es automático del lado de Payway. Solo se usa manualmente en configuraciones específicas. **GAP:** contrato del request no documentado.
- **Fuente:** https://raw.githubusercontent.com/payway-ar/sdk-node-ventaonline/master/lib/services/batchClosure.js

---

## 10. Formulario hosted (solo si se elige el modelo C)

### Validate — obtención del hash del formulario
- **Método y path:** `POST /web/validate` ⚠️ **fuera de `/api/`**
- **Ambiente:** sandbox `https://developers.decidir.com/web/validate` · producción `https://ventasonline.payway.com.ar/web/validate`
- **Auth:** `apikey: <FORM_API_KEY>` (la clave PCI/form, distinta de la privada)
- **Headers adicionales:** `X-Consumer-Username: <site del comercio>`
- **Request:**

| Campo | Tipo | Oblig. | Restricciones | Descripción |
|---|---|---|---|---|
| site.id | string | Cond. | numérico 20 díg. | Merchant. Solo si difiere del site de la API key |
| site.template.id | int | **Sí** | numérico 20 díg. | **Id del formulario, único por comercio, lo genera Payway** |
| site.transaction_id | string | **Sí** | alfanumérico 40 | Nro. de operación |
| customer.id | string | No | alfanumérico 40 | Id del usuario |
| customer.email | string | Cond. | alfanumérico 40 | Requerido si se quiere envío de mails |
| payment.amount | long | **Sí** | numérico | Monto |
| payment.currency | string | No | `ARS` / `USD` | Moneda |
| payment.payment_method_id | int | **Sí** | numérico | Medio de pago |
| payment.bin | string | No | numérico | Primeros 6 dígitos |
| payment.installments | int | **Sí** | numérico | Cuotas |
| payment.payment_type | string | **Sí** | `single` / `distributed` | Tipo |
| payment.sub_payments | array | Cond. | — | Requerido si es distribuido **por monto** |
| success_url | string | **Sí** | URL | Redirección tras finalizar |
| cancel_url | string | **Sí** | URL | Redirección si cancela |
| redirect_url | string | Cond. | URL | Requerido si no se informa `success_url` |
| fraud_detection | object | No | — | Cybersource |

```json
{
  "site": { "id": "00123123", "template": { "id": 5 }, "transaction_id": "TF-ORD-000123" },
  "customer": { "id": "cust_9f2a", "email": "comprador@example.com" },
  "payment": { "amount": 125045, "currency": "ARS", "payment_method_id": 1, "installments": 3, "payment_type": "single", "sub_payments": [] },
  "success_url": "https://tienda.com/checkout/exito",
  "cancel_url": "https://tienda.com/checkout/cancelado"
}
```
- **Response OK (201):**
```json
{ "statusCode": 201, "hash": "a1652d02-ba6e-427e-833f-b686efeed29f" }
```
- **Paso siguiente:** redirigir el browser a
  `GET {base}/web/forms/{hash}?apikey={PUBLIC_KEY}`
- **Notas y trampas:** el `template_id` lo crea Payway por comercio. En multi-tenant significa una dependencia operativa con Payway por cada tienda nueva. Es la razón principal por la que descartamos este modelo.
- **Fuente:** README del SDK .NET (tabla de campos) · https://raw.githubusercontent.com/payway-ar/sdk-php-ventaonline/master/Decidir/lib/Validate/Data.php

---

## 11. Checkout / botón de pago

### Generación de link de pago
- **Método y path:** `POST /api/v1/checkout-payment-button/link`
  ⚠️ **GAP-14:** el SDK .NET usa `POST {checkoutBase}payments/link`. Verificar cuál está vigente.
- **Ambiente:** sandbox `https://developers.decidir.com/api/v1/checkout-payment-button/link` · producción `https://ventasonline.payway.com.ar/api/v1/checkout-payment-button/link`
- **Auth:** `apikey: <PRIVATE_KEY>`
- **Headers adicionales:** `Content-Type: application/json`, `X-Source`
- **Request:**

| Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|
| origin_platform | string | Sí | Plataforma origen (`"Tiendafy"`) |
| payment_description | string | Sí | Descripción de la compra |
| total_price | double | Sí | ⚠️ **En pesos con decimales**, no centavos (`2500.49`) |
| site | string | Sí | Nro. de comercio |
| public_apikey | string | Sí | API key **pública** que usará el checkout |
| currency | string | ? | `"ARS"`. Aparece en el ejemplo oficial pero **no en los DTOs tipados** |
| template_id | int | No | `1` = sin Cybersource, `2` = con Cybersource |
| installments | int[] | No | Cuotas habilitadas (`[1,3,6]`) |
| plan_gobierno | bool | No | Ahora 12 / Ahora 18 |
| id_payment_method | int | No | Forzar un medio de pago |
| products | array | No | `{ id, value, description, quantity }` |
| success_url | string | No | Redirección de éxito |
| cancel_url | string | No | Redirección de cancelación |
| redirect_url | string | No | Redirección de datos |
| **notifications_url** | string | No | ⚠️ **URL de notificaciones — el único indicio de webhook en toda la API.** Ver GAP-06 |
| life_time | long | No | Vigencia del link |
| auth_3ds | bool | ? | Aparece en el ejemplo oficial, no en los DTOs |

- **Response OK (201):**
```json
{ "payment_id": "83bbf463-950f-4af4-9a0c-eb651cef0cp4", "status": "..." }
```
- **URL final del checkout:** `{base}/web/checkout/{payment_id}`
  Sandbox: `https://developers.decidir.com/web/checkout/{payment_id}`
  Producción: `https://live.decidir.com/web/checkout/{payment_id}` ⚠️ ver GAP-11
- **Notas y trampas:** `total_price` en pesos, no centavos. Es la única inconsistencia de unidad de la API.
- **Fuente:** https://raw.githubusercontent.com/payway-ar/sdk-node-ventaonline/master/lib/services/checkout.js · https://cdn.jsdelivr.net/gh/payway-ar/sdk-java-ventaonline@V2.3.0/src/main/java/com/decidir/sdk/dto/checkout/CheckoutRequest.java

---

## 12. Medios de pago por moneda

### Consulta de medios de pago habilitados
- **Método y path:** `GET /payment-methods/{currencyId}`
- **Auth:** `apikey`
- **Notas y trampas:** ⚠️ **De dudosa utilidad.** Un issue oficial de Payway reporta que *"siempre me devuelve vacío con las keys que nos han enviado"* y no tuvo respuesta. No hay endpoint de consulta de BIN. Ver **GAP-10**.
- **Fuente:** https://github.com/payway-ar/sdk-php-ventaonline/issues/33

---

## 13. Endpoints que NO existen

Confirmado por ausencia en los 5 SDKs oficiales, los 3 plugins oficiales y ActiveMerchant:

- ❌ Consulta de **BIN** → detección de emisor/banco
- ❌ Consulta de **promociones y planes de cuotas vigentes** (GAP-09)
- ❌ Registro/configuración de **webhooks** (GAP-06)
- ❌ Descarga de **reportes de conciliación** (GAP-15)
- ❌ **Alta de comercios** / onboarding
- ❌ **Rotación de API keys**
