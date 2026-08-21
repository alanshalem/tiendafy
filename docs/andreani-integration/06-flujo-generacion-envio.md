# 06 — Generación de la orden de envío

Responde las preguntas 12, 13, 14, 15 y 16 del checklist.

## 6.1 Cuándo se genera

**Al confirmarse el pago**, no antes. Razones:

- Una orden de envío creada es un compromiso operativo con Andreani y, según el contrato, puede generar cargo aunque no se despache.
- No hay endpoint de cancelación (§6.7). Crear órdenes especulativamente deja basura irreversible.

**Disparador:** evento `PagoAcreditado` publicado en RabbitMQ por el módulo de pagos (Mercado Pago / Payway). El consumidor de envíos lo toma y crea la orden. Esto desacopla el webhook de pago del carrier: si Andreani está caído, el pago ya está confirmado y la orden de envío se reintenta sola.

## 6.2 Diagrama de secuencia

```mermaid
sequenceDiagram
    autonumber
    participant MP as Mercado Pago / Payway
    participant API as Tiendafy API
    participant MQ as RabbitMQ
    participant W as ShipmentWorker
    participant PG as PostgreSQL
    participant R as Redis
    participant AND as apis.andreani.com

    MP->>API: Webhook pago aprobado
    API->>PG: Marca orden PAGADA
    API->>MQ: publish PagoAcreditado{orderId, tenantId}
    API-->>MP: 200 OK

    MQ->>W: consume PagoAcreditado
    W->>PG: Carga orden + dirección + items + cotización congelada
    W->>PG: SELECT shipment WHERE external_reference = orderRef
    alt Ya existe (retry / mensaje duplicado)
        W-->>MQ: ack (idempotente, sin llamar a Andreani)
    end
    W->>PG: INSERT shipment (estado=CREANDO, external_reference=orderRef)
    W->>R: Token del tenant
    W->>AND: POST /ordenes-de-envio {contrato, origen, destino, bultos, referencias[idCliente=orderRef]}
    alt 200/202
        AND-->>W: {bultos:[{numeroDeEnvio, linking:[Etiqueta]}], ...}
        W->>PG: UPDATE shipment estado=CREADO + INSERT parcels (numeroDeEnvio, labelUrl)
        W->>MQ: publish EnvioCreado{shipmentId}
    else 400 (validación)
        AND-->>W: [{code, property, message}]
        W->>PG: UPDATE shipment estado=ERROR_VALIDACION + detalle
        W->>MQ: publish EnvioRequiereAtencion{shipmentId}
        Note over W: NO reintentar. Requiere corrección humana.
    else 5xx / timeout
        W->>W: Reintento con backoff exponencial + jitter
        Note over W: Tras N fallos → DLQ + alerta
    end
```

## 6.3 Contrato de creación

Detalle completo de campos en `04-api-reference.md` §4.3. Acá van las decisiones de mapeo, que es lo que la referencia no puede darte.

### Mapeo desde el dominio de Tiendafy

| Campo Andreani | Origen en Tiendafy | Nota |
|---|---|---|
| `contrato` | `TenantCarrierContract` seleccionado por modalidad | Ver `02` §2.4 |
| `tipoServicio` | `"Domicilio"` o `"Sucursal"` | ⛔ Valores no enumerados oficialmente. Usar los dos ejemplos de la doc |
| `sucursalClienteID` | Configuración del tenant | Opcional |
| `origen.postal` | Dirección de despacho del tenant | O `origen.sucursal.id` si el comercio despacha en sucursal |
| `destino.postal` / `destino.sucursal.id` | Dirección del comprador **o** punto de retiro elegido | Excluyentes |
| `remitente.*` | Datos fiscales del tenant | `documentoTipo: "CUIT"` |
| `destinatario[0].*` | Datos del comprador | `documentoTipo: "DNI"` habitualmente |
| `remito.numeroRemito` | Número de factura/remito de ARCA | Máx 35 |
| `centroDeCostos` | `tenantId` o código de tienda | Máx 40. **Útil para conciliar facturación multi-tenant** |
| `productoAEntregar` | Descripción corta del contenido | — |
| `pagoDestino` | `1` (Porte) para e-commerce prepago | `2` (Debido) solo si el destinatario paga el flete |
| `bultos[]` | Bultos calculados en la cotización | **Los mismos que se cotizaron** |
| `bultos[].referencias[meta=idCliente]` | **Referencia externa de la orden de Tiendafy** | Ver §6.4 y §6.5 |

> **`centroDeCostos` como discriminador de tenant.** En un modelo donde cada tienda tiene contrato propio, la factura de Andreani ya llega separada. Pero si en algún momento Tiendafy opera como agregador, `centroDeCostos` es el campo natural para identificar la tienda dentro de un contrato único. Poblarlo desde el día uno cuesta cero y habilita esa opción.

### Validaciones previas obligatorias

Validar **antes** de llamar a Andreani, no después de recibir el error:

| Validación | Regla | Por qué |
|---|---|---|
| Localidad | Debe existir en el catálogo de `/localidades` y enviarse con **el string exacto del catálogo** | Causa #1 de rechazos |
| Código postal | 4 dígitos numéricos, y debe existir en el catálogo | — |
| Longitudes | `nombreCompleto` ≤ 40, `calle` ≤ 40, `numero` ≤ 40, `documentoNumero` ≤ 20, `telefono` ≤ 15, `eMail` destinatario ≤ 40 | Truncar con criterio, no cortar a ciegas |
| `volumenCm` | ≤ 999999.999 (límite `6,3`) | Un bulto de más de ~1 m³ no entra |
| `kilos` | > 0, máx 3 decimales | — |
| CUIT | Validar dígito verificador antes de enviar | Ver `11-errores-y-codigos.md` §11.5 |
| Teléfono | Solo dígitos, sin `+54`, sin guiones ni paréntesis, ≤ 15 | ⛔ El formato exacto no está documentado. Normalizar a dígitos es lo más seguro |
| `telefonos.tipo` | **Enum distinto para remitente y destinatario** | Ver `04` §4.3 — es la trampa más peligrosa |

## 6.4 Múltiples bultos e identificadores

### Cómo se envían varios bultos

Un solo `POST /ordenes-de-envio` con `bultos[]` de N elementos. 🟢

**Cada bulto recibe su propio `numeroDeEnvio`.** En el ejemplo oficial, dos bultos → `360000000036820` y `360000000036830`, con `totalizador` `"1/2"` y `"2/2"`.

🟢 Para asociarlos en B2C, la doc indica: *"Para asociar bultos en B2C, enviar el meta `idCliente` con el mismo contenido"* en `bultos[].referencias`.

### Qué identificador persistir

| Identificador | Estabilidad | Uso |
|---|---|---|
| `bultos[].numeroDeEnvio` | **Estable. Es la clave.** | Tracking, etiquetas, consultas. Es lo que Andreani llama `numeroAndreani` y `numeroDeTracking` |
| `totalizador` | Estable dentro del envío | Solo presentación (`1/2`) |
| `idCliente` (en `referencias`) | Lo define Tiendafy | Agrupación lógica de bultos |
| `idPedido` (solo esquema beta) | Lo define Tiendafy | ⛔ Confirmar si existe en la versión vigente y si es consultable |

**Conclusión de modelado:** no existe un "ID de envío" único devuelto por la creación. El modelo de datos correcto es:

```
Shipment (1) ──< Parcel (N)
   external_reference               numero_de_envio  ← PK natural de Andreani
   (referencia propia de Tiendafy)  label_url
                                    totalizador
```

Un `Shipment` de Tiendafy agrupa N `Parcel`, cada uno con su `numeroDeEnvio`. El tracking se consulta **por parcel**, y el estado del `Shipment` se deriva de los estados de sus parcels (ver `08-tracking-y-estados.md` §8.6).

## 6.5 Idempotencia

⛔ **GAP-10 — Andreani no documenta ningún header ni mecanismo de idempotency key.** No hay `Idempotency-Key`, no hay deduplicación por referencia externa documentada.

Esto es serio: un timeout de red en `POST /ordenes-de-envio` deja al cliente sin saber si la orden se creó. Reintentar puede duplicar el envío; no reintentar puede dejar el pedido sin despachar. **Y no hay cancelación** para arreglar el duplicado.

### Estrategia propia — tres capas

**Capa 1 — Idempotencia local antes de llamar (la que resuelve el 95% de los casos)**

Constraint único en la base:

```sql
CREATE UNIQUE INDEX ux_shipment_tenant_extref
  ON shipments (tenant_id, carrier_code, external_reference);
```

El worker, antes de llamar a Andreani, inserta la fila con estado `CREANDO`. Si el insert viola el índice único, es un mensaje duplicado de RabbitMQ: se hace `ack` y no se llama a Andreani. Esto cubre reintentos de la cola, que son la fuente más frecuente de duplicados.

**Capa 2 — Referencia externa única en el request**

Enviar `bultos[].referencias[{meta:"idCliente", contenido:"TF-{tenantId}-{orderId}"}]` en **todos** los bultos. Y si el esquema beta está vigente, también `idPedido` con el mismo valor.

Esto no evita el duplicado del lado de Andreani, pero lo hace **detectable**: dos envíos con el mismo `idCliente` son un duplicado identificable en la conciliación diaria.

**Capa 3 — Estado `INCIERTO` y reconciliación (la que resuelve el caso feo)**

Ante **timeout o 5xx** en la creación:

1. No reintentar a ciegas. Marcar el shipment como `CREACION_INCIERTA`.
2. Un job de reconciliación intenta **verificar** antes de reintentar: consultar si la orden existe usando la referencia propia.
   ⛔ **Problema:** no hay endpoint documentado de "buscar orden por referencia propia". `GET /ordenes-de-envio/{numeroAndreani}` requiere el número que justamente no tenemos. `GET /envios` (masivo) **no tiene filtros documentados**.
   **Esta es una pregunta crítica para Andreani:** *¿cómo consulto una orden por mi referencia externa?* Sin eso, la reconciliación automática no es posible.
3. Mientras tanto: **alerta al operador** en el panel admin, con el detalle del pedido y un botón de "verificar y reintentar" que exige confirmación humana.

> **Decisión de diseño explícita:** ante la duda, **preferir no crear** y escalar a un humano, antes que crear dos veces. Un envío faltante se detecta y se crea; un envío duplicado se despacha, se factura y no se puede cancelar por API.

### Política de reintentos por tipo de error

| Situación | ¿Reintentar? | Cómo |
|---|---|---|
| Timeout de conexión (no llegó a enviarse) | Sí | Backoff exponencial + jitter, máx 3 |
| Timeout de lectura (puede haberse creado) | **No automático** | → `CREACION_INCIERTA` + alerta |
| 5xx | Sí, con cuidado | Máx 3 con backoff; luego `CREACION_INCIERTA` |
| 429 | Sí | Respetar `Retry-After` si viene; si no, backoff largo |
| 401 | Sí, **una vez** | Re-login y reintento único |
| 400 (validación) | **Nunca** | → `ERROR_VALIDACION` + alerta con el detalle de `[{code, property, message}]` |
| 403 | **Nunca** | Probable problema de whitelisting de IP → alerta de infraestructura |

## 6.6 Pre-numeración

🟢 El campo `bultos[].numeroDeEnvio` en el **request** existe: *"Numero de tracking del envío en caso de tener una pre-numeración asignada"*.

Si Andreani asigna al tenant un rango de números de envío por adelantado, el cliente puede fijar el número al crear la orden. Eso resolvería la idempotencia de raíz: el número lo define Tiendafy y un reintento con el mismo número sería naturalmente idempotente.

⛔ **No documentado:** cómo se solicita un rango de pre-numeración, cómo se administra, y qué pasa si se repite un número. **Vale la pena preguntarlo** — es la solución más limpia al problema de §6.5.

## 6.7 Modificación y cancelación

⛔ **GAP-04 — No existe endpoint de cancelación ni de modificación.**

Evidencia:
- 🟢 Las 25 secciones de la documentación oficial no incluyen ningún `DELETE`, `cancel` ni `anular`. Verificado recorriendo el índice completo.
- 🟡 El SDK PHP de terceros lo afirma explícitamente: *"En la nueva API no se pueden cancelar envíos"*, y agrega que un envío se considera cancelado solo si la distribución no llega a ocurrir.

### Cómo modelarlo en Tiendafy

**La anulación es un proceso fuera de banda.** El diseño tiene que asumirlo:

1. El estado `CANCELADO` del `Shipment` en Tiendafy es una **marca local**, no una acción sobre Andreani.
2. Al cancelarlo, el sistema:
   - Marca el envío como `CANCELACION_SOLICITADA`.
   - **Instruye al operador** en el panel: "Andreani no permite cancelar por API. Si la etiqueta no se despachó, simplemente no la despaches. Si ya se despachó, gestioná el rescate con tu ejecutivo comercial."
   - Registra quién y cuándo, para la conciliación con la factura de Andreani.
3. Si el envío ya tiene trazas (`EstadoId` de ingreso al circuito), la cancelación local **no es suficiente**: el paquete está en la red de Andreani y va a viajar. Hay que gestionarlo por canal comercial.

**Ventana de gracia recomendada:** exponer "cancelar" en el panel admin solo mientras el envío no tenga ninguna traza. Después de la primera traza, cambiar el botón por "gestionar devolución" con instrucciones.

Para modificar una dirección: **no hay forma por API**. La única vía es no despachar, marcar el envío como anulado localmente y crear uno nuevo. Con el costo de haber generado dos órdenes.

## 6.8 GAPs de este documento

| ID | GAP | Pregunta a Andreani |
|---|---|---|
| GAP-10 | Sin idempotency key | ¿Hay algún mecanismo de deduplicación? ¿`idPedido` es único e indexable? |
| — | **Consulta por referencia propia** | **¿Cómo consulto una orden usando mi referencia externa, sin conocer el `numeroAndreani`?** Es la pregunta más importante de este documento |
| GAP-04 | Sin cancelación ni modificación | ¿Se confirma que no hay API? ¿Cuál es el procedimiento y el plazo para anular? ¿Se factura un envío generado y no despachado? |
| — | Pre-numeración | ¿Cómo se solicita un rango de pre-numeración? ¿Qué pasa si repito un número? |
| — | Filtros de `GET /envios` | ¿Qué parámetros de filtro y paginación acepta? |
| — | Versión vigente | ¿El body correcto es el de `/documentacion` o el del esquema beta del sandbox? Los tipos difieren |
