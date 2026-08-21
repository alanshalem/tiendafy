# 05 — Flujo de cotización en el checkout

Responde las preguntas 8, 9, 10 y 11 del checklist.

## 5.1 Dónde entra la cotización en el flujo de Tiendafy

La cotización ocurre **antes de pagar**, en dos momentos:

1. **Carrito** — estimación con el CP que el comprador ingresa a mano. Barata, tolerante a error, cacheable con agresividad.
2. **Checkout** — cotización firme con la dirección completa ya validada. Es la que se muestra como precio final y la que se congela en la orden.

La diferencia importa: en el carrito una latencia de 800 ms es incómoda; en el checkout es abandono de compra.

## 5.2 Diagrama de secuencia

```mermaid
sequenceDiagram
    autonumber
    actor C as Comprador
    participant FE as Next.js (tienda)
    participant API as Tiendafy API (.NET)
    participant R as Redis
    participant PG as PostgreSQL
    participant AND as apis.andreani.com

    C->>FE: Ingresa CP / dirección
    FE->>API: POST /carts/{id}/shipping-quotes {cp, items}
    API->>PG: Valida CP contra catálogo de localidades
    alt CP inexistente
        API-->>FE: 422 CP_INVALIDO
        FE-->>C: "Revisá el código postal"
    end
    API->>API: Calcula bultos (peso, volumen, valor declarado)
    API->>R: GET quote:andreani:{tenant}:{contrato}:{cp}:{hashBultos}
    alt HIT
        R-->>API: Tarifa cacheada
    else MISS
        API->>R: GET token:andreani:{tenant}
        alt Token ausente o vencido
            API->>AND: POST /login (Basic)
            AND-->>API: header x-authorization-token
            API->>R: SET token TTL 20h
        end
        par Cotización por modalidad
            API->>AND: GET tarifas (contrato domicilio, cpDestino)
            AND-->>API: 200 {pesoAforado, tarifaConIva{...}}
        and
            API->>AND: GET tarifas (contrato sucursal, cpDestino)
            AND-->>API: 200 {...}
        end
        API->>R: SET quote:... TTL 30min
    end
    API->>API: Aplica margen / regla de envío gratis del tenant
    API-->>FE: 200 [{carrier, modalidad, precio, plazoEstimado?}]
    FE-->>C: Muestra opciones de envío
```

> **Nota sobre el paralelismo:** cotizar domicilio y sucursal son **dos llamadas** porque son **dos contratos**. Hacerlas en paralelo con `Task.WhenAll` es obligatorio: en serie se duplica la latencia percibida en el checkout.

## 5.3 Contrato de la cotización

Endpoint: `GET /tarifas` (🟡 los SDKs de terceros usan `/v1/tarifas` — ver `04` §4.10). Detalle completo en `04-api-reference.md` §4.2.

> 🚨 **Recordatorio de GAP-01:** la documentación oficial de Andreani **no publica ningún parámetro de entrada** para este endpoint, y el path difiere entre la doc (`tarifas`) y los SDKs (`/v1/tarifas`). Los parámetros documentados provienen de dos SDKs de terceros que convergen de forma independiente en el mismo formato. **Antes de escribir el cliente HTTP, validar en QA.**

Campos mínimos que hay que resolver del lado de Tiendafy:

| Dato Andreani | De dónde sale en Tiendafy |
|---|---|
| `contrato` | Configuración del tenant, seleccionado por modalidad (domicilio/sucursal) |
| `cliente` | Configuración del tenant (código de cliente, 10 dígitos sin `CL`) |
| `sucursalOrigen` | Configuración del tenant: centro de imposición de origen |
| `cpDestino` | Dirección del comprador, ya validada contra el catálogo de localidades |
| `bultos[N][kilos]` | Suma de pesos de los ítems del carrito, agrupados en bultos |
| `bultos[N][volumen]` | Volumen calculado del bulto en cm³ |
| `bultos[N][valorDeclarado]` | Valor de la mercadería del bulto |

## 5.4 Peso, dimensiones y peso volumétrico

### Unidades exactas

🟢 **OFICIAL**, de la tabla de `bultos[]` en `POST /ordenes-de-envio`:

| Campo | Unidad | Precisión declarada |
|---|---|---|
| `kilos` | **kilogramos** | `12,3` → hasta 3 decimales (gramos) |
| `largoCm`, `altoCm`, `anchoCm` | **centímetros** | — |
| `volumenCm` | **centímetros cúbicos (cm³)** | `6,3` → máx. 999999.999 cm³ |
| `valorDeclaradoSinImpuestos` | pesos argentinos | `12,2` |

> ⚠️ En la **respuesta** de `GET /envios/{n}` el mismo dato aparece como `volumen: 0.000005` para un bulto de `kilos: 0.005`. Eso son 5 cm³ expresados en **metros cúbicos**. La API **usa unidades distintas en request y response**. No reutilizar el mismo DTO para ambos.

### Quién calcula el peso volumétrico

🟢 **Andreani.** La respuesta de la cotización incluye `pesoAforado`, que es el peso facturable resultante. El cliente envía peso real y volumen; Andreani decide cuál usa.

⛔ **La fórmula del aforo no está publicada.** No hay factor de conversión documentado (el estándar de la industria en Argentina suele rondar 1 kg por cada 4.000–6.000 cm³, pero **eso es conocimiento general, no dato de Andreani**).

**Implicancia práctica:** no intentes predecir el costo del envío sin llamar a la API. No se puede calcular offline. Esto condiciona el diseño: **no hay forma de estimar tarifas sin red**, y por lo tanto la cotización es un punto de falla del checkout que necesita degradación elegante (§5.7).

### Cómo armar los bultos

Tiendafy tiene que decidir cómo agrupar los ítems del carrito en bultos. Tres estrategias, de menor a mayor esfuerzo:

| Estrategia | Cómo funciona | Cuándo usarla |
|---|---|---|
| **Bulto único** | Un solo bulto. Peso = suma de pesos. Volumen = suma de volúmenes | Fase 1. Simple, y suficiente para la mayoría de las tiendas |
| **Por producto** | Un bulto por ítem (respetando cantidades) | Cuando los productos son voluminosos e indivisibles |
| **Bin packing** | Algoritmo de empaquetado sobre un catálogo de cajas del tenant | Fase 3+. Solo si el ahorro justifica el esfuerzo |

**Empezar por bulto único.** La suma de volúmenes sobreestima (ignora el hueco entre productos) pero nunca subestima, así que no se pierde plata. Y evita el problema de `volumenCm` máximo de ~1 m³ mientras los envíos sean chicos.

**Fallback obligatorio:** los productos sin peso o dimensiones cargadas rompen la cotización. Definir valores por defecto **a nivel tenant** (ej. 0.5 kg y 20×15×10 cm) y **avisar en el panel admin** qué productos los están usando. Un producto sin peso es un envío mal cotizado, y en volumen es plata que se pierde.

## 5.5 Respuesta: desglose de costos

| Campo | Qué representa | Uso en Tiendafy |
|---|---|---|
| `pesoAforado` | Peso facturable | Persistir para auditoría y para explicar diferencias de facturación |
| `tarifaSinIva.distribucion` | Flete sin IVA | Contabilidad |
| `tarifaSinIva.seguroDistribucion` | Seguro sin IVA | Contabilidad |
| `tarifaSinIva.total` | Total sin IVA | Base para el cálculo fiscal (ARCA/AFIP) |
| `tarifaConIva.total` | **Total con IVA** | **Precio a mostrar al comprador** |

**Impuestos:** el desglose es solo con/sin IVA. ⛔ No hay discriminación de percepciones, IIBB ni otros tributos.

**Plazo de entrega:** ⛔ **la cotización no devuelve plazo.** Ver §5.6.

**Vigencia de la tarifa:** ⛔ **no hay TTL ni fecha de vigencia en la respuesta.**

## 5.6 El problema del plazo de entrega

Esto merece su propia sección porque afecta directamente la conversión del checkout.

**Hechos:**

- El endpoint de cotización **no devuelve plazo de entrega**. 🟢 Verificado.
- `POST /ordenes-de-envio` devuelve `fechaEstimadaDeEntrega`, pero **en el ejemplo oficial viene vacío** (`""`). 🟢
- No hay endpoint de "plazos por CP".

**Consecuencia:** en el momento en que el comprador decide, Tiendafy **no tiene un plazo de entrega de fuente Andreani**.

**Opciones, de mejor a peor:**

1. **Pedirle a Andreani la matriz de plazos por zona.** Es un dato que existe comercialmente (está en los acuerdos de servicio). Cargarla como tabla propia por tenant y mostrarla como estimación. **Es la opción correcta.**
2. **Configuración manual por tenant.** El comercio carga "3 a 5 días hábiles para AMBA, 5 a 8 para interior". Menos preciso, pero honesto y sin dependencia.
3. **No mostrar plazo.** Solo "Envío por Andreani — $X". Legal y honesto, pero convierte peor.
4. ❌ **Inventar un plazo.** No. Genera reclamos y expone al comercio.

**Recomendación:** opción 2 en Fase 1 (desbloquea el checkout sin depender de Andreani), migrando a la opción 1 apenas se tenga la matriz.

## 5.7 Estrategia de cache con Redis

### ¿Es viable cachear cotizaciones?

**Sí, y es necesario** — no tanto por rate limits (⛔ que no están documentados, **GAP-08**) sino por tres razones concretas:

1. **Latencia del checkout.** Cada cotización es un round-trip a un gateway externo. Con dos modalidades son dos. En el peor caso, más un login previo.
2. **Volatilidad real muy baja.** Las tarifas de Andreani se actualizan por acuerdo comercial, con frecuencia mensual o trimestral. Cachear 30 minutos no introduce error material.
3. **Patrón de acceso muy repetitivo.** Un e-commerce cotiza el mismo CP con carritos parecidos decenas de veces por hora.

### Diseño de la clave

```
quote:andreani:{tenantId}:{contrato}:{cpDestino}:{hashBultos}
```

donde `hashBultos` es un **SHA-256 truncado** de la lista normalizada y ordenada de bultos:

```
[{kilos:1.300, volumen:9000, valorDeclarado:45000.00}, ...]
```

**Reglas de normalización — importantes para que el cache sirva de algo:**

- Redondear `kilos` a 3 decimales y `volumen` a entero **antes** de hashear.
- Redondear `valorDeclarado` a la centena (`45.123 → 45.100`). El valor declarado impacta solo en el seguro, que es un porcentaje pequeño del total. Sin este redondeo el hit rate se desploma, porque cada carrito tiene un valor distinto.
- Ordenar los bultos de forma determinística.

> Sin redondeo del valor declarado, el cache tiene un hit rate cercano a cero. Con redondeo a la centena, el error introducido en el seguro es de centavos.

### TTL e invalidación

| Clave | TTL | Invalidación |
|---|---|---|
| `quote:andreani:{tenant}:{contrato}:{cp}:{hash}` | **30 min** | Por TTL. Purga masiva por prefijo `quote:andreani:{tenant}:*` cuando el tenant cambia su configuración de Andreani |
| `token:andreani:{tenant}` | **20 h** | Al recibir 401. Ver `02-alta-credenciales-ambientes.md` §2.2.1 |
| `andreani:puntos:{contrato}:{cp}` | 12 h | Por TTL |
| Catálogo de localidades | — | En PostgreSQL, job semanal |

**Criterios de invalidación explícita:**

- Cambio de credenciales, contrato o centro de imposición del tenant → purgar `quote:andreani:{tenant}:*` y `token:andreani:{tenant}`.
- Cambio de ambiente (QA↔PROD) → purgar todo lo del tenant.
- Aviso de actualización tarifaria de Andreani → purga global de `quote:andreani:*`. Dejar esta acción disponible como comando de operación en el panel de administración de la plataforma.

### Congelamiento de la tarifa en la orden

La tarifa cacheada sirve para **mostrar**. Cuando el comprador confirma el pedido, el precio de envío que aceptó se **congela en la orden** con su desglose y timestamp. No se re-cotiza al confirmar el pago: si Andreani subió la tarifa entre la cotización y el pago, la diferencia la absorbe el comercio y se ve en la conciliación.

Re-cotizar al confirmar el pago para "ajustar" el precio es una mala idea: el comprador ya aceptó un total.

### Degradación cuando Andreani no responde

Un checkout que se cae porque un carrier no responde es inaceptable. Cascada:

1. **Cache HIT** → responder desde Redis.
2. **Cache MISS + Andreani OK** → cotizar y cachear.
3. **Cache MISS + Andreani lento (>2 s)** → cortar por timeout, seguir a 4.
4. **Cache MISS + Andreani caído (circuit breaker abierto)** → responder con las **otras opciones de carrier** que sí cotizaron, y omitir Andreani de la lista.
5. **Ningún carrier disponible** → mostrar "No pudimos calcular el envío en este momento" con opción de reintentar, y **no bloquear la compra**: ofrecer retiro en local o "coordinamos el envío por email" si el tenant lo tiene habilitado.

**Nunca mostrar un precio de envío inventado.** Es mejor no tener la opción que tenerla mal.

## 5.8 Rate limits

⛔ **GAP-08 — Andreani no publica rate limits, timeouts, SLA, ventanas de mantenimiento ni status page.** Verificado en las tres superficies de documentación.

Como no hay números, el diseño defensivo es:

| Parámetro | Valor propuesto | Razón |
|---|---|---|
| Timeout de cotización | **2 s** | Umbral de tolerancia del checkout |
| Timeout de creación de orden | **15 s** | Es asíncrono desde el punto de vista del usuario |
| Reintentos en cotización | **1**, backoff 200 ms | Más reintentos empeoran la latencia sin ganar mucho |
| Reintentos en creación | **3**, backoff exponencial con jitter | Ver `06-flujo-generacion-envio.md` §6.5 sobre el riesgo de duplicados |
| Circuit breaker | 5 fallos consecutivos → abierto 30 s | Protege el checkout |
| Concurrencia máxima por tenant | Bulkhead de 10 | Evita que un tenant con mucho tráfico agote el pool |

**Preguntar a Andreani los límites reales.** Hasta tenerlos, monitorear la tasa de 429 y 5xx en producción como señal.

## 5.9 GAPs de este documento

| ID | GAP | Pregunta a Andreani |
|---|---|---|
| GAP-01 | Path y parámetros de `tarifas` sin documentar | ¿Es `/tarifas` o `/v1/tarifas`? ¿Cuál es el contrato exacto? ¿`cliente` y `sucursalOrigen` son obligatorios? ¿Soporta múltiples bultos? ¿Requiere token? |
| — | Fórmula de aforo | ¿Cuál es el factor de conversión volumen→peso aforado de mi contrato? |
| — | Plazo de entrega | ¿Hay endpoint o matriz de plazos por CP? ¿`fechaEstimadaDeEntrega` se puebla en producción? |
| — | Vigencia de tarifa | ¿Cuánto tiempo es válida una cotización? ¿Con cuánta anticipación se avisan los cambios tarifarios? |
| GAP-08 | Rate limits | ¿Cuáles son los límites por contrato/usuario? ¿Hay 429 con `Retry-After`? |
