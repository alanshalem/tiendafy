# 10 — Errores, códigos de rechazo y mensajes al comprador

---

## 1. Los tres niveles de error

Es fundamental separarlos porque el tratamiento es completamente distinto:

| Nivel | Ejemplo | Quién falló | Reintentable | Qué mostrar |
|---|---|---|---|---|
| **1. Error de integración** | `400 malformed_request_error`, `401 authentication_error` | **Nosotros** | ❌ Nunca | Mensaje genérico + alerta a on-call |
| **2. Rechazo de la transacción** | `402` con `status: "rejected"` y `reason.id: 51` | El **emisor** de la tarjeta | ⚠️ Depende del código | Mensaje específico y accionable |
| **3. Error de infraestructura** | `5xx`, timeout, error de red | **Payway** o la red | ⚠️ Solo tras verificar | "Estamos procesando tu pago" |

> ⚠️ **El error más común al integrar Payway es tratar el `402` como excepción HTTP.** No lo es. El SDK .NET lo dice explícitamente en `Service.cs`:
> ```csharp
> protected bool isErrorResponse(int statusCode) {
>     if (statusCode == 402) return false;   // <-- 402 NO es error de API
>     else if (statusCode >= 400 && statusCode < 500) return true;
>     else return false;
> }
> ```
> El body de un `402` es un `PaymentResponse` completo con el detalle del rechazo. Si el `HttpClient` lanza excepción, se pierde esa información.

---

## 2. Códigos HTTP de la API

| HTTP | `error_type` | Significado | Reintentable | Acción |
|---|---|---|---|---|
| `200` | — | OK (consultas, capturas, DELETE de refunds) | — | Continuar |
| `201` | — | Creado (pago, token, devolución, cierre de lote) | — | Leer `status` |
| `204` | — | Sin contenido (DELETE de card token) | — | Continuar |
| `400` | `malformed_request_error` | Payload inválido o mal formado | ❌ **No** | Bug nuestro. Loguear el payload sanitizado y alertar |
| `401` | `authentication_error` | API key inválida, faltante o de otro ambiente | ❌ **No** | Bug de configuración. **Alerta crítica**: puede afectar a un tenant entero |
| **`402`** | `invalid_request_error` | **Transacción rechazada.** Body = `PaymentResponse` | ⚠️ Ver §3 | Mapear `reason.id` a mensaje de usuario |
| `404` | `not_found_error` | Recurso inexistente (payment_id, refund_id) | ❌ No | Verificar el id |
| `409` | `api_error` | Conflicto — posible operación duplicada | ⚠️ **Consultar primero** | `GET /payments?siteOperationId=` antes de cualquier reintento |
| `5xx` | — | Error de Payway | ⚠️ **Solo tras verificar** | Ver §5 |

Fuentes: https://raw.githubusercontent.com/payway-ar/sdk-net-ventaonline/master/Solution/Decidir/Services/Service.cs · https://raw.githubusercontent.com/payway-ar/sdk-php-ventaonline/master/Decidir/lib/RESTClient.php · README de forks del SDK PHP v2

### Estructura del body de error (cuando no es 402)

```json
{
  "error_type": "malformed_request_error",
  "validation_errors": [ { "code": "...", "param": "..." } ],
  "message": "...",
  "code": "..."
}
```
Fuente: https://raw.githubusercontent.com/payway-ar/sdk-net-ventaonline/master/Solution/Decidir/Model/ErrorResponse.cs

El SDK PHP detecta el error por la **presencia de la clave `error_type`**:
```php
if (array_key_exists("error_type", $data)) { throw new SdkException(...); }
```

---

## 3. Códigos de rechazo del medio de pago

### 3.1 Estructura

```json
{
  "status": "rejected",
  "status_details": {
    "ticket": "21",
    "card_authorization_code": null,
    "error": {
      "type": "invalid_card",
      "reason": {
        "id": 51,
        "description": "FONDOS INSUFICIENTES",
        "additional_description": ""
      }
    }
  }
}
```

`reason.id` es un **entero**. Fuente: https://cdn.jsdelivr.net/gh/payway-ar/sdk-java-ventaonline@V2.3.0/src/main/java/com/decidir/sdk/dto/CardErrorReason.java

> **Los SDKs no traen catálogo local de códigos.** `description` y `additional_description` los devuelve el servidor. La tabla completa vive en el portal de developers, inaccesible desde este entorno (**GAP-02**).

### 3.2 Tabla de códigos — Visa

⚠️ **Fuente: GitBook oficial histórico de Decidir (generación v1).** https://decidir.gitbooks.io/documentacion/content/Anexos/TablasReferencia/IdsMotivo.html
Los códigos coinciden con los que emite la v2 según ActiveMerchant, pero **hay que validar la tabla con Payway antes de producción**.

Columna "Mensaje al comprador" **redactada por mí**, en español neutro, sin jerga técnica.

| Código | Descripción oficial | Causa probable | Reintentable | **Mensaje al comprador** |
|---|---|---|---|---|
| 1 | PEDIR AUTORIZACIÓN | El emisor requiere autorización manual | ❌ No | *Tu banco necesita autorizar esta compra. Llamá al número que figura al dorso de tu tarjeta y volvé a intentar.* |
| 76 | LLAMAR AL EMISOR | Ídem | ❌ No | *Tu banco necesita autorizar esta compra. Llamá al número que figura al dorso de tu tarjeta y volvé a intentar.* |
| 3 | COMERCIO INVÁLIDO | Configuración del comercio | ❌ No | *No pudimos procesar el pago. Probá con otro medio de pago o escribinos.* ⚠️ **Alerta interna: es un problema de configuración nuestro** |
| 4 | CAPTURAR TARJETA | Tarjeta reportada | ❌ **No** | *El pago fue rechazado. Probá con otra tarjeta.* |
| 5 | DENEGADA | Rechazo genérico del emisor | ❌ No | *Tu banco rechazó el pago. Probá con otra tarjeta o consultá con tu banco.* |
| 7 | RETENGA Y LLAME | Tarjeta reportada | ❌ **No** | *El pago fue rechazado. Probá con otra tarjeta.* |
| 43 | RETENER TARJETA | Tarjeta reportada robada | ❌ **No** | *El pago fue rechazado. Probá con otra tarjeta.* |
| 12 | TRANSACCIÓN INVÁLIDA | Operación no soportada | ❌ No | *No pudimos procesar el pago. Probá con otro medio de pago.* |
| 13 | MONTO INVÁLIDO | Monto fuera de rango | ❌ No | *No pudimos procesar el pago. Probá con otro medio de pago.* ⚠️ **Revisar el monto enviado** |
| 14 | TARJETA INVÁLIDA | Número de tarjeta incorrecto | ✅ Sí, corrigiendo | *Revisá el número de tarjeta: parece que hay un error.* |
| 39 | INGRESO MANUAL INCORRECTO | Datos mal ingresados | ✅ Sí, corrigiendo | *Revisá los datos de la tarjeta y volvé a intentar.* |
| 45 | NO OPERA EN CUOTAS | La tarjeta no admite cuotas | ✅ Sí, en 1 cuota | *Esta tarjeta no permite pagar en cuotas. Probá en 1 pago.* |
| 46 | TARJETA NO VIGENTE | Tarjeta aún no activa | ❌ No | *Tu tarjeta todavía no está habilitada. Consultá con tu banco.* |
| 48 | EXCEDE MÁX. CUOTAS | Más cuotas de las permitidas | ✅ Sí, con menos cuotas | *Esta tarjeta no permite esa cantidad de cuotas. Elegí un plan más corto.* |
| 51 | FONDOS INSUFICIENTES | Sin saldo o límite | ✅ Sí, más tarde | *No hay fondos suficientes. Probá con otra tarjeta o consultá con tu banco.* |
| 54 | TARJETA VENCIDA | Vencimiento pasado | ✅ Sí, con otra tarjeta | *La tarjeta está vencida. Probá con otra.* |
| 56 | TARJETA NO HABILITADA | Tarjeta no habilitada para compras online | ❌ No | *Tu tarjeta no está habilitada para compras online. Consultá con tu banco.* |
| 57 | TRANSACCIÓN NO PERMITIDA | Operación no permitida para esa tarjeta | ❌ No | *Tu banco no permite este tipo de operación con esta tarjeta.* |
| 61 | EXCEDE LÍMITE | Supera el límite de compra | ✅ Sí, con monto menor | *Superaste el límite de tu tarjeta. Probá con otra tarjeta o un monto menor.* |
| 91 | EMISOR FUERA DE LÍNEA | Banco emisor no disponible | ✅ **Sí, más tarde** | *Tu banco no está respondiendo en este momento. Probá de nuevo en unos minutos.* |
| 96 | ERROR EN SISTEMA | Error del procesador | ✅ **Sí, más tarde** | *Tuvimos un problema al procesar el pago. Probá de nuevo en unos minutos.* |
| 10001 | ERROR AL RECIBIR DEL MÓDULO DE COMUNICACIONES | Error de comunicación | ✅ Sí, más tarde | *Tuvimos un problema de comunicación. Probá de nuevo en unos minutos.* |
| 10003 | ERROR DE TIMEOUT DEL SOCKET | Timeout interno | ✅ **Sí, tras verificar** | *Estamos verificando tu pago. No vuelvas a intentar todavía.* ⚠️ **Consultar por `siteOperationId` antes de cualquier reintento** |

### 3.3 Tabla de códigos — Mastercard / Diners / Argencard

Misma fuente. `payment_method_id` 15, 8, 30.

| Código | Descripción oficial | Reintentable | **Mensaje al comprador** |
|---|---|---|---|
| 34 | The operation failed for financial reasons | ❌ No | *Tu banco necesita autorizar esta compra. Consultá con tu banco.* |
| 8 | A duplicate object exists | ❌ **No** | *Parece que este pago ya fue procesado. Revisá tus pedidos antes de reintentar.* ⚠️ **Consultar por `siteOperationId`** |
| 51 | An error occurred during the user authentication | ❌ No | *No pudimos validar los datos de tu tarjeta. Revisalos y volvé a intentar.* |
| 53 | An unhandled exception occurred | ✅ Sí, más tarde | *Tuvimos un problema al procesar el pago. Probá de nuevo en unos minutos.* |

### 3.4 Tabla de códigos — American Express

Misma fuente.

| Código | Descripción oficial | Reintentable | **Mensaje al comprador** |
|---|---|---|---|
| 1 | PEDIR AUTORIZACIÓN | ❌ No | *American Express necesita autorizar esta compra. Llamá al número del dorso de tu tarjeta.* |
| 4 | CAPTURAR TARJETA | ❌ No | *El pago fue rechazado. Probá con otra tarjeta.* |
| 5 | DENEGADA | ❌ No | *Tu banco rechazó el pago. Probá con otra tarjeta.* |
| 3 | COMERCIO INVÁLIDO | ❌ No | *No pudimos procesar el pago.* ⚠️ **Alerta interna** |
| 25 | NO EXISTE ORIGINAL | ❌ No | *No pudimos procesar el pago. Probá con otro medio de pago.* |
| 77 | ERROR PLAN/CUOTAS | ✅ Sí, con otro plan | *Esta tarjeta no permite esa cantidad de cuotas. Elegí otro plan.* |
| 14 | TARJETA INVÁLIDA | ✅ Sí, corrigiendo | *Revisá el número de tarjeta: parece que hay un error.* |
| 10001 | ERROR AL RECIBIR DEL MÓDULO DE COMUNICACIONES | ✅ Sí, más tarde | *Tuvimos un problema de comunicación. Probá de nuevo en unos minutos.* |
| 10005 | DATOS DE TRANSACCIÓN INCORRECTOS | ✅ Sí, corrigiendo | *Revisá los datos de la tarjeta y volvé a intentar.* |

> **Nota oficial de la fuente:** *"Ante cualquier otro IDMOTIVO que se reciba sugerimos inducir a repetir la trx"*.
> **No coincidimos con esa recomendación como regla general.** Ver §4.

### 3.5 Categorización de ActiveMerchant (validación cruzada)

Fuente: https://github.com/activemerchant/active_merchant/blob/master/lib/active_merchant/billing/gateways/decidir.rb — código productivo contra el sandbox real. Confirma qué `reason.id` emite realmente la **v2**.

| reason.id | Categoría | | reason.id | Categoría |
|---|---|---|---|---|
| -1 | processing_error | | 46 | invalid_number |
| 1 | call_issuer | | 47 | card_declined |
| 2 | call_issuer | | 48 | card_declined |
| 3 | config_error | | 49 | invalid_expiry_date |
| 4 | pickup_card | | 51 | card_declined |
| 5 | card_declined | | 53 | card_declined |
| 7 | pickup_card | | 54 | expired_card |
| 12 | processing_error | | 55 | incorrect_pin |
| 14 | invalid_number | | 56 | card_declined |
| 28 | processing_error | | 57 | card_declined |
| 38 | incorrect_pin | | 76 | call_issuer |
| 39 | invalid_number | | 91 | call_issuer |
| 43 | pickup_card | | 96 | processing_error |
| 45 | card_declined | | 97 | processing_error |

Códigos que aparecen acá y **no** en la tabla oficial v1 (mensajes propuestos):

| Código | Categoría | **Mensaje al comprador** |
|---|---|---|
| -1 | processing_error | *Tuvimos un problema al procesar el pago. Probá de nuevo en unos minutos.* |
| 2 | call_issuer | *Tu banco necesita autorizar esta compra. Consultá con tu banco.* |
| 28 | processing_error | *Tuvimos un problema al procesar el pago. Probá de nuevo en unos minutos.* |
| 38 | incorrect_pin | *El PIN ingresado no es correcto.* |
| 47 | card_declined | *Tu banco rechazó el pago. Probá con otra tarjeta.* |
| 49 | invalid_expiry_date | *La fecha de vencimiento no es correcta. Revisala y volvé a intentar.* |
| 55 | incorrect_pin | *El PIN ingresado no es correcto.* |
| 97 | processing_error | *Tuvimos un problema al procesar el pago. Probá de nuevo en unos minutos.* |

> **GAP-02:** faltan los códigos 58, 62, 63, 65, 89, 94, 98, 99 y los específicos de Cabal y Naranja. **Pedir la tabla vigente a soporte.**

### 3.6 Fallback obligatorio

Cualquier `reason.id` no mapeado:

> *Tu banco rechazó el pago. Probá con otra tarjeta o consultá con tu banco.*

Y **loguear el código no mapeado con nivel WARNING** para poder ampliar la tabla.

---

## 4. Política de reintentos ante rechazo

### 4.1 La regla de Payway

Payway lo marca como **mandatorio**:

> *"No reintentes transacciones denegadas"*
> — https://ayuda.payway.com.ar/novedades/mandatorio-no-reintentes-transacciones-denegadas-consulta-estas-instrucciones

Las marcas penalizan (con multas reales) a los comercios con alta tasa de reintentos sobre transacciones denegadas. Esto no es una recomendación de estilo.

### 4.2 Lo que implementamos

| Situación | Política |
|---|---|
| Rechazo del emisor (`402` con `reason.id`) | **Nunca reintento automático.** El comprador decide, con datos nuevos |
| Reintento del comprador tras rechazo | ✅ Permitido, pero: **token nuevo obligatorio** (el anterior está quemado), `attempt_number` incrementado, y **máximo 3 intentos por orden por hora** |
| Códigos "reintentable más tarde" (51, 61, 91, 96) | Ofrecer el reintento en la UI, **sin automatizarlo** |
| Códigos de tarjeta reportada (4, 7, 43) | ❌ **Bloquear reintentos con esa misma tarjeta.** Ofrecer solo cambiar de medio de pago |
| Error de integración (400/401/404) | ❌ Nunca reintentar. Alertar |
| `5xx` / timeout | ⚠️ Solo tras `GET /payments?siteOperationId=`. Ver §5 |

**Implementación:** un contador en Redis por `(tenant_id, order_id)` con TTL de 1 hora. Al llegar a 3, la orden queda bloqueada para pago y se ofrece contactar a soporte.

---

## 5. Timeouts, 5xx y rate limits

### 5.1 Regla fundamental

> **Un timeout no significa que no se cobró. Significa que no sabemos si se cobró.**

Nunca reintentar un `POST /payments` que timeouteó, sin antes verificar. El procedimiento completo está en `05-flujo-de-pago.md` §6.3.

### 5.2 Timeouts recomendados

Ver `05-flujo-de-pago.md` §7. Resumen: **35 s para `POST /payments`**, no menos.

Referencia del SDK PHP oficial:
> *"Standard Timeout: 6 segundos; casos excepcionales con transacciones concurrentes pueden variar entre 20-30 segundos."*

### 5.3 Rate limits

**GAP-07.** No hay números publicados. La única evidencia es cualitativa: el SDK Java lanza `ApiException` ante *"Llamadas demasiado frecuentes al API Payway"*.

**Política defensiva mientras no sepamos el límite:**

| Regla | Valor |
|---|---|
| Concurrencia máxima por tenant hacia Payway | 10 requests simultáneos |
| Concurrencia global | 100 requests simultáneos |
| Polling de reconciliación | Backoff exponencial, nunca fijo |
| Ante un `429` (si aparece) | Respetar `Retry-After`. Si no viene, backoff de 60 s |
| Circuit breaker | Abrir tras 5 fallos consecutivos, medio-abierto a los 30 s |

### 5.4 Comportamiento ante 5xx

```
POST /payments → 5xx o timeout
  │
  ├─ 1. NO reintentar el POST
  ├─ 2. Marcar el intento como `unknown`
  ├─ 3. Encolar reconciliación con backoff: 1s, 3s, 9s, 30s, 2min, 5min
  ├─ 4. En cada tick: GET /payments?siteOperationId={site_transaction_id}
  │      ├─ encontrado  → adoptar su status. FIN. NO reintentar
  │      └─ no encontrado → siguiente tick
  ├─ 5. Tras 5 minutos sin resultado:
  │      ├─ marcar la orden como PaymentUnknown
  │      ├─ alertar a operaciones
  │      └─ NO despachar mercadería
  └─ 6. Al comprador: "Estamos verificando tu pago, te avisamos por mail"
         (nunca "el pago falló, reintentá")
```

El mensaje del paso 6 importa: decirle "falló, reintentá" a alguien a quien quizás sí se le cobró es la forma más rápida de generar un doble cobro.

### 5.5 Resiliencia con Polly (.NET)

```
Política combinada para el HttpClient de Payway:

1. Timeout        → 35 s (optimistic, con CancellationToken)
2. Retry          → SOLO para operaciones idempotentes por naturaleza
                    (GET /payments, GET /payments/{id}/refunds).
                    3 intentos, backoff exponencial + jitter.
                    NUNCA para POST /payments ni POST /refunds.
3. Circuit Breaker→ 5 fallos consecutivos → abierto 30 s.
                    Por tenant, no global (un tenant con keys mal
                    configuradas no debe tumbar a los demás).
4. Bulkhead       → 10 ejecuciones concurrentes por tenant.
```

**El punto 2 es el crítico.** Un `retryPolicy` genérico aplicado a todo el `HttpClient` es exactamente cómo se generan cobros duplicados. La política de retry debe estar **explícitamente restringida a los GET**.

---

## 6. Errores de tokenización (frontend)

El `decidir.js` valida localmente antes de llamar a la API. Tabla completa:

Fuente: https://github.com/payway-ar/sdk-javascript-ventaonline (README)

| `type` | Mensaje del SDK | **Mensaje al comprador** |
|---|---|---|
| `empty_card_number` | Card Number is empty | *Ingresá el número de tarjeta.* |
| `empty_card_holder_name` | Card Holder Name is empty | *Ingresá el nombre que figura en la tarjeta.* |
| `nan_card_number` | Card Number must be a number | *El número de tarjeta solo puede tener dígitos.* |
| `invalid_card_number` | Invalid Card Number | *El número de tarjeta no es válido. Revisalo.* |
| `invalid_expiry_date` | Expiry date is invalid | *La fecha de vencimiento no es válida.* |
| `empty_token` | Token is empty | *Hubo un problema. Recargá la página y volvé a intentar.* |
| `invalid_param` | Invalid param | *Revisá los datos ingresados.* |

Formato del error:
```json
{ "error": [ { "isValid": false, "error": { "type": "invalid_expiry_date", "message": "Expiry date is invalid", "param": "expiry_date" } } ] }
```

**Recomendación:** no depender de estas validaciones. Validar también del lado nuestro (Luhn, formato de vencimiento, longitud de CVV por marca) para dar feedback inmediato sin round-trip.

---

## 7. Resumen: matriz de decisión

| Señal | Estado interno | ¿Despachar? | ¿Reintentar? | Mensaje |
|---|---|---|---|---|
| `201` + `approved` | `Paid` | ✅ Sí | — | *¡Listo! Tu pago fue aprobado.* |
| `201` + `review` | `PaymentUnderReview` | ❌ **No** | ❌ | *Estamos revisando tu pago. Te avisamos por mail.* |
| `201` + `challenge pending` | `PaymentInProgress` | ❌ No | — | Continuar flujo 3DS |
| `402` + `rejected` | `PaymentFailed` | ❌ No | Solo el comprador, con token nuevo | Mensaje por `reason.id` (§3) |
| `400` / `401` / `404` | `PaymentFailed` | ❌ No | ❌ **Nunca** | *No pudimos procesar el pago.* + **alerta on-call** |
| `409` | `PaymentUnknown` | ❌ No | Solo tras consultar | *Estamos verificando tu pago.* |
| `5xx` / timeout | `PaymentUnknown` | ❌ **No** | Solo tras consultar | *Estamos verificando tu pago, te avisamos por mail.* |
