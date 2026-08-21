# 11 — Testing

---

## 1. Ambiente de sandbox

| | |
|---|---|
| **API v2** | `https://developers.decidir.com/api/v2` |
| **API v1** | `https://developers.decidir.com/api/v1` |
| **Checkout** | `https://developers.decidir.com/api/v1/checkout-payment-button` |
| **Form hosted** | `https://developers.decidir.com/web/forms/{hash}?apikey={public}` |
| **Script JS** | `https://ventasonline.payway.com.ar/static/v2.6.4/decidir.js` (se sirve desde prod, apuntando a la URL de sandbox) |

**Credenciales de prueba que aparecen en la documentación oficial** (README del SDK .NET y PHP):
```
public_key  = e9cdb99fff374b5f91da4480c8dca741
private_key = 92b71cf711ca41f78362a7134f87ff65
```
> ⚠️ Son las keys de ejemplo de la documentación. **Payway debe entregarnos las nuestras** para sandbox — cada comercio tiene su propio par, y la configuración de medios de pago, cuotas y antifraude depende del site asociado. No asumir que estas keys van a funcionar para nuestro caso.

---

## 2. Tarjetas de prueba

> ⚠️ **GAP-05.** No se encontró la tabla oficial de tarjetas de prueba en ninguna fuente accesible. La tabla siguiente proviene de **fuentes de tercero de alta confiabilidad**: la suite de tests remotos de ActiveMerchant (que se ejecuta efectivamente contra el sandbox de Decidir) y una KB de un integrador. **Validar con Payway.**

### 2.1 Tarjetas por marca

| Marca | `payment_method_id` | Número | Fuente |
|---|---|---|---|
| Visa crédito | 1 | `4507990000004905` | ActiveMerchant + KB Quinttos + ejemplos oficiales |
| Visa crédito (alt.) | 1 | `4509790112684851` | Ejemplos de los SDKs oficiales |
| Visa crédito (alt.) | 1 | `4509790113276723` | Ejemplos de los SDKs oficiales |
| Visa Débito | 31 | `4517721004856075` | KB Quinttos |
| Mastercard | 15 (o 104 ⚠️) | `5299910010000015` | ActiveMerchant + KB Quinttos |
| American Express | 65 | `373953192351004` | ActiveMerchant + KB Quinttos |
| Diners | 8 | `36463664750005` | ActiveMerchant |
| Cabal | 27 / 63 | `5896570000000008` | ActiveMerchant + KB Quinttos |
| Naranja | 24 | `5895627823453005` | ActiveMerchant |
| Patagonia 365 | 55 | `5046562602769006` | ActiveMerchant |
| Network token Visa | 1 | `4012001037141112` | ActiveMerchant |
| **Fuerza rechazo** | 1 | **`4000300011112220`** | ActiveMerchant |

**Datos comunes** (KB Quinttos):
- Titular: `EA` (o cualquier nombre)
- Documento: `27859328`, tipo `dni`
- **CVV: cualquiera** (3 dígitos, 4 para Amex)
- **Vencimiento: cualquiera en el futuro** (ej. `08/30`)

**Nota específica de Amex en sandbox:** solo opera con montos de **$1 o $10**. Cualquier otro monto falla. (KB Quinttos)

Fuentes:
- https://github.com/activemerchant/active_merchant/blob/master/test/remote/gateways/remote_decidir_test.rb
- https://quinttos.zohodesk.com/portal/es/kb/articles/tarjetas-de-crédito-y-débito-de-prueba-de-decidir-25-9-2023

### 2.2 Datos que fuerzan un resultado de Cybersource

El único mecanismo documentado son los **emails "mágicos"** en `fraud_detection.bill_to.email`:

| Email | Resultado esperado |
|---|---|
| `accept@decidir.com.ar` | Aprobado por antifraude | 

Fuente: ejemplos del README oficial del SDK PHP. Es el patrón estándar de Cybersource (`accept@`), lo que sugiere que existen `reject@` y `review@`, pero **no están publicados**. **Pregunta a soporte.**

---

## 3. Escenarios de prueba y cómo forzarlos

| # | Escenario | Cómo forzarlo | Resultado esperado | Confianza |
|---|---|---|---|---|
| 1 | **Pago aprobado** | Visa `4507990000004905`, monto normal | `201` + `status: "approved"` + `tid` + `card_authorization_code` | ✅ Alta |
| 2 | **Rechazo genérico** | Tarjeta `4000300011112220` | `402` + `status: "rejected"` + `reason.id` | ✅ Alta |
| 3 | **Rechazo por fondos** (`reason.id: 51`) | **GAP** — mecanismo desconocido | — | ❌ **GAP-05** |
| 4 | **Rechazo por seguridad** (`4`, `7`, `43`) | **GAP** | — | ❌ **GAP-05** |
| 5 | **Tarjeta vencida** (`54`) | Vencimiento en el pasado | Rechazo. **A validar** — el SDK no valida localmente | ⚠️ Media |
| 6 | **Número inválido** (`14`) | Número que no pase Luhn | Error de tokenización local (`invalid_card_number`) antes de llegar a la API | ✅ Alta |
| 7 | **Excede cuotas** (`48`) | Pedir más cuotas de las habilitadas para el site | `402` + `reason.id: 48` | ⚠️ Media |
| 8 | **3DS challenge** | `cardholder_auth_required: true` + `auth_3ds_data{}` | `status: "challenge pending"` + `instruction_value` | ⚠️ Media — **GAP:** no se sabe qué tarjeta lo dispara |
| 9 | **3DS frictionless** | Ídem con otra tarjeta | `status: "approved"` + `auth_3ds_response` | ⚠️ Media |
| 10 | **Antifraude en review** | `send_to_cs: true` + email distinto de `accept@` | `status: "review"` | ⚠️ Media — **GAP** |
| 11 | **Timeout** | Reducir el timeout del cliente a 1 ms | `TaskCanceledException` → probar la recuperación por `siteOperationId` | ✅ Alta |
| 12 | **API key inválida** | Enviar una key basura | `401 authentication_error` | ✅ Alta |
| 13 | **Payload inválido** | Omitir `bin` | `400 malformed_request_error` | ✅ Alta |
| 14 | **Token reutilizado** | Usar el mismo token dos veces | **A validar** — debería fallar | ⚠️ **Probar explícitamente** |
| 15 | **Token expirado** | Esperar más allá del `date_due` y pagar | Error de token | ⚠️ **Probar explícitamente para determinar el TTL real** |
| 16 | **Pago distribuido OK** | `payment_type: "distributed"` con `sum(sub_payments) == amount` | `201` + `sub_payments[]` con `tid` por cada uno | ⚠️ Requiere sites habilitados |
| 17 | **Pago distribuido con suma incorrecta** | `sum(sub_payments) != amount` | Error | ⚠️ Media |
| 18 | **Amex con monto no permitido** | Amex con monto distinto de $1/$10 en sandbox | Falla | ⚠️ Media |

**Escenarios 14 y 15 son prioritarios.** El TTL y el single-use del token son supuestos centrales de nuestra estrategia de idempotencia (`05-flujo-de-pago.md` §6.2). Hay que confirmarlos empíricamente en la fase 0 del backlog.

---

## 4. Cómo probar devoluciones

```
1. POST /payments → obtener `id`
2. Esperar (o no) según se quiera probar anulación o devolución
3. GET /payments/{id}/refunds → confirmar historial vacío
4. POST /payments/{id}/refunds {} → devolución total
   → guardar el `id` de la devolución
5. GET /payments/{id} → verificar el nuevo status
6. DELETE /payments/{id}/refunds/{refundId} → anular la devolución
7. GET /payments/{id}/refunds → verificar el historial
```

**Devolución parcial:**
```
1. POST /payments con amount = 100000 ($1000)
2. POST /payments/{id}/refunds {"amount": 30000}  → $300
3. POST /payments/{id}/refunds {"amount": 30000}  → $300 (segunda parcial)
4. POST /payments/{id}/refunds {"amount": 50000}  → debe FALLAR (excede)
```

**Caso Visa Débito:** repetir el paso 2 con `payment_method_id: 31` → debe fallar (no acepta parciales en e-commerce).

> **GAP:** cómo forzar el cierre de lote en sandbox para probar la frontera anulación/devolución. Existe `POST /api/v1/closures/batchclosure` pero su contrato no está documentado. **Pregunta a soporte.**

---

## 5. Cómo probar webhooks

**No se puede: no hay webhooks** (ver `09-webhooks-conciliacion.md`).

Lo que sí hay que probar es la **estrategia de polling**:

| Test | Cómo |
|---|---|
| Reconciliación de un `review` | Forzar un `review` (si se logra) o insertar el estado manualmente y verificar que el `ReconcileHandler` lo resuelva |
| Reconciliación de un `unknown` | Timeout artificial en el `HttpClient` → verificar que se consulte por `siteOperationId` y se adopte el resultado |
| Idempotencia del consumidor | Publicar el mismo `ReconcileCommand` 5 veces en paralelo → verificar que la orden se actualice una sola vez |
| Agotamiento de reintentos | Mockear Payway devolviendo `review` siempre → verificar que tras N intentos escale a `PaymentUnknown` + alerta |
| No-polling de terminales | Verificar que un `approved` nunca genere un `ReconcileCommand` |

Si Payway confirma que `notifications_url` funciona, el test se agrega apuntándolo a un endpoint de staging con un túnel (ngrok/Cloudflare Tunnel).

---

## 6. Estrategia de testing en el proyecto

### 6.1 Pirámide

| Nivel | Qué se prueba | Herramientas |
|---|---|---|
| **Unitarios** | Cálculo de cuotas y coeficientes, conversión pesos↔centavos, mapeo de `reason.id` a mensajes, máquina de estados, generación de `site_transaction_id` | xUnit + FluentAssertions |
| **Integración (con doble)** | `PaywayGateway` contra un servidor HTTP falso que devuelve respuestas grabadas del sandbox (incluidos `402`, `5xx`, timeouts) | WireMock.Net |
| **Integración (real)** | Suite contra el sandbox real de Payway. **Marcada como `[Trait("Category","Sandbox")]`, fuera del CI por defecto**, corrida a demanda y en el pipeline nocturno | xUnit + sandbox |
| **End-to-end** | Checkout completo en Next.js contra sandbox: tokenización en el browser + pago + confirmación | Playwright |
| **Contract tests** | Snapshot de los payloads que enviamos y de los que esperamos recibir, para detectar drift de la API | Verify / snapshot testing |

### 6.2 Reglas

1. **Las respuestas grabadas del sandbox son el activo más valioso del testing.** Grabar y versionar el JSON exacto de cada escenario (aprobado, rechazado, review, 3DS, error 400/401/402/5xx), con los datos sensibles sanitizados.
2. **El caso `402` debe tener test propio.** Es el error más fácil de romper en un refactor del `HttpClient`.
3. **Test de no-regresión de la política de retry:** verificar explícitamente que `POST /payments` **no** se reintenta ante `5xx`. Es un test que protege contra el bug más caro posible.
4. **Test de aislamiento multi-tenant:** verificar que un pago del tenant A nunca use las credenciales del tenant B. Idealmente con un test que fuerce concurrencia entre tenants.
5. **Nunca commitear API keys reales**, ni siquiera de sandbox. User secrets en local, variables seguras en el pipeline.

### 6.3 Checklist de certificación con Payway

Payway suele exigir una batería de transacciones de prueba antes de habilitar producción. Preparar de antemano:

- [ ] Pago aprobado en 1 cuota
- [ ] Pago aprobado en N cuotas
- [ ] Pago rechazado
- [ ] Devolución total
- [ ] Devolución parcial
- [ ] Anulación de devolución
- [ ] Consulta de transacción por id
- [ ] Consulta por `siteOperationId`
- [ ] Manejo de timeout con recuperación
- [ ] (Si aplica) 3DS con challenge
- [ ] (Si aplica) Pago distribuido

Documentar el `site_transaction_id` y el `id` de Payway de cada una — es lo que suelen pedir.
