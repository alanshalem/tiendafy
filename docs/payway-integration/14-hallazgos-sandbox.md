# 14 — Hallazgos verificados contra el sandbox

> Verificado el 2026-08-21 ejecutando llamadas reales contra
> `https://developers.decidir.com/api/v2` con las credenciales de ejemplo que
> publican los SDKs oficiales (`public_key = e9cdb99f…`, `private_key = 92b71cf7…`).
>
> Esto **cierra cuatro GAPs** que el relevamiento había dejado abiertos porque el
> portal de developers es una SPA vacía y no se pudo leer.

---

## 1. El sandbox responde y las keys de ejemplo funcionan

`GET /healthcheck` → `200`. `POST /tokens` y `POST /payments` responden con las
keys de la documentación. Sirven para desarrollar; **no** reemplazan a las
propias, que Payway tiene que entregar con el alta del comercio.

---

## 2. TTL del token: 15 minutos — **GAP cerrado**

La respuesta de `POST /tokens` trae las dos fechas y la diferencia es exacta:

```json
{ "date_created": "2026-08-21T01:21Z", "date_due": "2026-08-21T01:36Z" }
```

El relevamiento estimaba "~15 minutos por evidencia empírica". Queda confirmado.

**Consecuencia para el checkout:** un comprador que deja el formulario abierto
más de quince minutos y después paga recibe un error de token vencido. El
formulario tiene que poder volver a tokenizar sin perder el resto de los datos.

---

## 3. El token es de un solo uso — **GAP cerrado**

Reenviar un token ya consumido devuelve `400`:

```json
{ "error_type": "invalid_request_error",
  "validation_errors": [ { "code": "repeated", "param": "token" } ] }
```

Es una red de contención más contra el doble cobro, además del
`site_transaction_id` y su índice único. Se detecta explícitamente
(`PaywayMaps.IsRepeatedToken`) porque casi siempre significa que el comprador
reenvió el formulario, y merece un mensaje propio y no un "datos inválidos".

---

## 4. Un rechazo es `402` con el pago completo en el cuerpo — confirmado

```
HTTP 402
{ "id": 16053824, "status": "rejected",
  "status_details": { "ticket": "2929", "card_authorization_code": "",
    "error": { "type": "request_authorization_card",
               "reason": { "id": 1, "description": "PEDIR AUTORIZACION" } } } }
```

Tratarlo como error HTTP perdería el motivo, que es justo lo que hay que
mostrarle al comprador. Se procesa como resultado de negocio.

---

## 5. La consulta por nuestro id funciona — confirmado

`GET /payments?siteOperationId={site_transaction_id}&pageSize=1` devuelve

```json
{ "limit": 1, "offset": 0, "results": [ { /* el pago completo */ } ] }
```

Es la pieza que permite averiguar si un cobro que dio timeout llegó a existir.
Sin ella no habría forma de recuperarse de un timeout sin arriesgar un doble
cobro.

---

## 6. Diferencias contra lo que decía el relevamiento

| Punto | Lo relevado | Lo observado |
|---|---|---|
| `tid` (transaction id de la marca) | "viene en las aprobadas de Visa/Master/Amex" | **No vino** en el pago aprobado de prueba. Se lee como opcional |
| `customer_token` | "token persistente del cliente" | Vino `null` sin mandar `user_id`. Coherente: la tarjeta se tokeniza solo si se informa el usuario |
| Campos extra | — | La respuesta trae además `payment_mode`, `aggregate_data`, `authenticated_token` |
| Monto | centavos | Confirmado: `125045` entra y vuelve como `125045` |
| Moneda | mayúsculas al mandar, minúsculas al volver | Confirmado: se manda `"ARS"`, vuelve `"ars"` |

---

## 7. Lo que sigue sin poder verificarse

Nada de esto se puede cerrar sin credenciales propias y sin respuesta de soporte:

- **Host de producción (GAP-11).** Los SDKs siguen sin coincidir: ActiveMerchant
  y el SDK .NET usan `live.decidir.com`, los de Node y Java
  `ventasonline.payway.com.ar`. Se toma el primero por defecto y la conexión
  tiene un host alternativo configurable para corregirlo sin deploy.
- **Tabla de `payment_method_id` vigente (GAP-12).** Sigue el conflicto entre la
  clásica (Mastercard 15) y la nueva (Mastercard 104). Se usa la clásica y el id
  usado queda guardado en cada intento, para detectar rápido si una marca
  empieza a rechazar en masa.
- **Webhooks (GAP-06), promociones (GAP-09), pre-autorización (GAP-16).**
