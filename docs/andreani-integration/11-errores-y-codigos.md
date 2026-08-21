# 11 — Errores, códigos y operación

Responde las preguntas 27, 28 y 29 del checklist.

## 11.1 Los dos esquemas de error

🟢 Andreani expone **dos formatos de error incompatibles** según el producto. Un cliente que consuma ambas familias necesita **dos parsers**.

### A — Transporte y distribución (el que nos importa)

Fuente: 🟢 [OpenAPI beta, creación de orden](https://developers-sandbox.andreani.com/docs/andreani/beta/creacion-de-una-nueva-orden-de-envio)

Es un **array**, no un objeto:

```json
[
  { "code": "string", "property": "string", "message": "string" }
]
```

| Campo | Tipo | Significado |
|---|---|---|
| `code` | string, nullable | Código interno del error |
| `property` | string, nullable | **Campo del request que falló** |
| `message` | string, nullable | Descripción |

Códigos HTTP declarados: **202** (éxito), **400**, **500**. **No hay 401 ni 404 declarados** en este esquema.
Content-types de respuesta: `text/plain`, `application/json`, `text/json`.

> Que `property` exista es una buena noticia: permite mapear el error al campo exacto del formulario en el panel admin, en vez de mostrar un mensaje genérico.

### B — Almacenes / Fulfillment (fuera de alcance, pero conviene saberlo)

Fuente: 🟢 [OpenAPI, obtener acondicionamiento](https://developers-sandbox.andreani.com/docs/andreani/obtener-acondicionamiento)

ProblemDetails estilo RFC 7807, un **objeto**:

```json
{
  "type": "string", "title": "string", "status": 0, "detail": "string",
  "errors": [ { "field": "string", "message": "string" } ]
}
```

Códigos: **200**, **400**, **401**, **404**, **500**. Nótese `field` en vez de `property`, y anidado bajo `errors`.

### Parser defensivo

Como los formatos difieren y ninguno está garantizado, el deserializador tiene que ser tolerante:

```
1. ¿El body empieza con '['?  → esquema A (array)
2. ¿Tiene "errors" o "title"? → esquema B (ProblemDetails)
3. ¿Es texto plano?           → guardar como mensaje crudo
4. ¿Está vacío?               → error genérico con el status HTTP
```

Nunca hacer `JsonSerializer.Deserialize<ErrorA[]>` sin try/catch. El `Content-Type` declarado incluye `text/plain`: un 500 puede devolver un stack trace, un HTML de gateway o nada.

## 11.2 Tabla de errores

⛔ **GAP-07 — Andreani no publica ni un solo valor concreto de `code` ni un `message` de ejemplo.** El esquema declara los campos; el catálogo no existe públicamente.

Lo que sigue es una tabla **operativa**: mapea códigos HTTP y situaciones a comportamiento del sistema. Los `code` internos se completan a medida que aparezcan en QA.

| HTTP | Situación | `code` interno | Causa probable | ¿Reintentable? | Mensaje al operador | Mensaje al comprador |
|---|---|---|---|---|---|---|
| **200 / 202** | Éxito | — | — | — | — | — |
| **400** | Validación del request | ⛔ | Campo faltante, longitud excedida, localidad inexistente, CP inválido, formato de documento | **No** | "Andreani rechazó el envío: {message} (campo: {property})" | "Estamos verificando los datos de tu envío" |
| **401** | Token vencido o inválido | ⛔ | Expiración del token | **Sí, una vez** tras re-login | *(transparente)* | *(ninguno)* |
| **401** | Credenciales incorrectas | ⛔ | Usuario/clave mal cargados | **No** | "Credenciales de Andreani inválidas. Revisá la configuración de la tienda" | "El envío no está disponible en este momento" |
| **403** | **Restricción por IP** | ⛔ | 🟢 GlobAllPack: "un HTTP 403 indica problema de IP" | **No** | "Bloqueo por IP. Contactar a infraestructura y a Andreani" | genérico |
| **403** | Endpoint no habilitado | ⛔ | 🟢 Trazas requiere habilitación explícita del usuario por Andreani | **No** | "Endpoint no habilitado para tu usuario. Contactar al ejecutivo de Andreani" | genérico |
| **404** | Recurso inexistente | ⛔ | `numeroAndreani` mal, envío de otro contrato | **No** | "Envío no encontrado en Andreani" | genérico |
| **408 / timeout** | Sin respuesta | — | Latencia del gateway | **Depende de la operación** — ver `06` §6.5 | Según caso | genérico |
| **429** | Rate limit | ⛔ | ⛔ Límites no documentados | **Sí**, respetando `Retry-After` | *(transparente, alerta si persiste)* | *(ninguno)* |
| **500 / 502 / 503 / 504** | Error del servidor | ⛔ | Falla interna o mantenimiento | **Sí**, backoff exponencial | "Andreani no responde. Reintentando" | "No pudimos calcular el envío. Probá en unos minutos" |
| *(sin categoría)* | Fuera de cobertura | ⛔ | CP sin servicio | **No** | "Andreani no cubre ese destino" | "Andreani no llega a tu dirección. Elegí otra opción de envío" |

**Reglas transversales:**

- **Nunca mostrar el `message` crudo de Andreani al comprador.** Está en inglés a medias, tiene jerga interna y puede filtrar datos del contrato. Al operador sí — es información útil.
- **Loguear siempre `code`, `property` y `message`** junto al `traceId` de la request. Es lo único que permite construir el catálogo que Andreani no publica.
- **Construir el catálogo internamente.** Una tabla `carrier_error_catalog` que se puebla con cada error nuevo visto en producción, con su clasificación y su mensaje. En seis meses vale más que la documentación oficial.

## 11.3 Clasificación en excepciones de dominio

Traducir el error HTTP a una excepción de dominio en la capa de infraestructura, y **nunca** dejar que un `HttpRequestException` llegue a la capa de aplicación.

| Excepción de dominio | Cuándo | Efecto |
|---|---|---|
| `CarrierValidationException` | 400 | No reintentar. Estado `ERROR_VALIDACION` + detalle por campo |
| `CarrierAuthException` | 401 tras re-login, 403 | No reintentar. Alerta de configuración |
| `CarrierNotFoundException` | 404 | No reintentar |
| `CarrierRateLimitException` | 429 | Reintentar con `Retry-After` |
| `CarrierUnavailableException` | 5xx, timeout, circuito abierto | Reintentar con backoff. Degradar |
| `CarrierNoCoverageException` | Fuera de cobertura | No reintentar. Omitir el carrier de las opciones |
| `CarrierUnknownException` | Todo lo demás | No reintentar. Alerta |

Esto es lo que permite que la capa de aplicación decida sin saber nada de HTTP: `CarrierValidationException` → mostrar al operador; `CarrierUnavailableException` → degradar a otros carriers.

## 11.4 Rate limits, timeouts y SLA

⛔ **GAP-08 — Andreani no publica nada de esto.** Verificado en las tres superficies:

| Aspecto | Estado |
|---|---|
| Rate limits | ⛔ No documentados. Ningún header `X-RateLimit-*`, ningún 429 declarado |
| Timeouts | ⛔ No documentados |
| SLA de disponibilidad | ⛔ No publicado |
| Ventanas de mantenimiento | ⛔ No publicadas |
| Status page | ⛔ **No existe** |
| Horario de QA | 🟢 Solo para GlobAllPack: **08:00–20:00 ART**, con extensión de 15 días a pedido. 🔵 Podría aplicar a la API nacional |

### Parámetros defensivos propuestos

| Operación | Timeout | Reintentos | Circuit breaker |
|---|---|---|---|
| `POST /login` | 5 s | 2, backoff 500 ms | 3 fallos → 60 s |
| `GET /tarifas` (cotización) | **2 s** | 1, backoff 200 ms | 5 fallos → 30 s |
| `POST /ordenes-de-envio` | 15 s | 3, exponencial + jitter | 5 fallos → 60 s |
| `GET .../etiquetas` | 20 s | 2 | 5 fallos → 30 s |
| `GET .../trazas` | 10 s | 2 | 10 fallos → 60 s |
| `GET /sucursales`, `/localidades` | 30 s | 2 | — (son jobs, no bloquean nada) |

**Jitter obligatorio en los reintentos.** Sin jitter, N workers que fallan juntos reintentan juntos y sostienen la caída.

**Ante 429:** respetar `Retry-After` si viene. Si no viene, backoff exponencial arrancando en 5 s. Y **alertar**: un 429 sostenido significa que el diseño está mal dimensionado, no que haya que reintentar más.

**Ante 5xx sostenido:** abrir el circuito, degradar el checkout (ver `05` §5.7) y alertar. No seguir golpeando.

### Monitoreo mínimo

Como no hay status page, la observabilidad la construye Tiendafy:

| Métrica | Alerta |
|---|---|
| Tasa de error por endpoint (5m) | > 10% durante 5 min |
| p95 de latencia de cotización | > 2 s |
| Circuito abierto | Cualquier apertura |
| Envíos en `CREACION_INCIERTA` | > 0 |
| Envíos sin traza nueva hace > 7 días | > umbral por tenant |
| Silencio de webhook en horario hábil | > 2 h |
| Fallos de login por tenant | > 3 en 10 min |

## 11.5 Validaciones de datos argentinos

Esta es, en la práctica, la fuente número uno de errores en integraciones logísticas argentinas. **Validar antes de llamar a la API**, no después de recibir el 400.

### Código postal

| Regla | Detalle |
|---|---|
| Formato | 4 dígitos numéricos. El campo acepta 12 caracteres para soportar formatos internacionales |
| CPA (8 caracteres, `C1425DKE`) | ⛔ **No documentado como aceptado.** Usar los 4 dígitos. Si el comprador ingresa un CPA, extraer los 4 dígitos centrales |
| Existencia | Validar contra el catálogo local precargado de `GET /localidades` |
| ⛔ CP inexistente | Comportamiento de la API no documentado. Prevenir con validación local |

### Localidad

**El punto más delicado de todo el request.** Máximo 40 caracteres, y **debe coincidir con el catálogo de Andreani**.

| Regla | Detalle |
|---|---|
| Fuente de verdad | `GET /localidades` (sin auth). Precargar en PostgreSQL |
| Formato observado | **Mayúsculas, sin acentos**: `PASO DE LOS LIBRES`, `C.A.B.A.`, `CORRIENTES` |
| Normalización | Comparar sin acentos, case-insensitive, colapsando espacios. **Enviar el string exacto del catálogo** |
| Casos conflictivos | "CABA" / "Capital Federal" / "Ciudad Autónoma de Buenos Aires" → todos a `C.A.B.A.` Mantener una tabla de alias |
| Ambigüedad | Un CP puede tener varias localidades y una localidad varios CP. Resolver por el par `(CP, localidad)` y, si hay ambigüedad, pedir al comprador que elija |

### Provincia / `region`

| Regla | Detalle |
|---|---|
| Formato | 🟢 **ISO 3166-2:AR** — códigos de una letra (`C` CABA, `B` Buenos Aires, `X` Córdoba, `S` Santa Fe, `M` Mendoza, `T` Tucumán…) |
| Obligatoriedad | **Opcional** |
| Recomendación | ⛔ Andreani no publica su tabla de códigos. Como el campo es opcional, **ante la duda no enviarlo**. Enviarlo mal es peor que omitirlo |

### CUIT / CUIL / DNI

| Regla | Detalle |
|---|---|
| `documentoTipo` | 🟢 `DNI` / `CUIT` / `CUIL`. ⛔ ¿Hay más? ¿Pasaporte? No documentado |
| `documentoNumero` | Máx 20 caracteres |
| Formato | ⛔ No documentado si acepta guiones. **Enviar solo dígitos** (`30712345678`, no `30-71234567-8`) |
| Validación de CUIT | Validar el **dígito verificador** (módulo 11) antes de enviar. Tiendafy ya lo tiene implementado para ARCA/AFIP: reutilizar ese validador |
| Validación de DNI | 7 u 8 dígitos, sin puntos |
| ⛔ CUIT inválido | Comportamiento de la API no documentado |

### Teléfono

| Regla | Detalle |
|---|---|
| Longitud | Máx 15 |
| Formato | ⛔ No documentado. **Normalizar a solo dígitos**, sin `+54`, sin `0`, sin `15`, sin guiones ni paréntesis |
| `tipo` | 🚨 **Enumeración distinta para remitente (0-3) y destinatario (1-4).** Ver `04` §4.3 |

### Nombres, calles y direcciones

| Campo | Máx | Estrategia si excede |
|---|---|---|
| `nombreCompleto` | 40 | Truncar preservando nombre + apellido, no cortar a ciegas |
| `calle` | 40 | Truncar. Loguear cuando ocurre |
| `numero` | 40 | Si no hay altura, usar `"S/N"` |
| `componentesDeDireccion[].contenido` | 40 c/u | Piso, depto, entrecalles, referencias van acá como `{meta, contenido}` |
| `eMail` destinatario | **40** | ⚠️ Es corto. Un email de 45 caracteres es común. **Validar en el checkout**, no al despachar |

> El límite de 40 en el email del destinatario merece atención: es más restrictivo que el estándar y va a rechazar direcciones legítimas. Validarlo en el formulario de checkout, donde el comprador puede corregirlo, y no en el worker de despacho, donde ya es tarde.

### Resumen de validación previa

```
1. CP: 4 dígitos + existe en catálogo
2. Localidad: normalizada contra catálogo, string exacto
3. Documento: tipo válido + dígito verificador (CUIT) + solo dígitos
4. Teléfono: solo dígitos, ≤ 15, tipo según rol
5. Email destinatario: válido y ≤ 40 caracteres
6. Longitudes de todos los strings
7. Bultos: kilos > 0, volumenCm ≤ 999999.999
8. origen y destino: exactamente uno de postal|sucursal
```

Ejecutarlo como un `IValidator` en la capa de aplicación **antes** de construir el request. Si algo falla, el error es de Tiendafy, no de Andreani, y el mensaje es específico y accionable.

## 11.6 GAPs de este documento

| ID | GAP | Pregunta a Andreani |
|---|---|---|
| GAP-07 | Sin catálogo de errores | **¿Existe una tabla de códigos de error con su significado?** |
| GAP-08 | Sin rate limits, SLA ni status page | ¿Cuáles son los límites? ¿Hay 429 con `Retry-After`? ¿Hay status page o canal de avisos de incidentes y mantenimiento? |
| — | Validaciones argentinas | ¿Qué devuelve la API ante CP inexistente, localidad mal escrita o CUIT inválido? |
| — | Formatos | ¿El CPA de 8 caracteres es aceptado? ¿`documentoNumero` acepta guiones? ¿Qué formato de teléfono espera? |
| — | Tabla ISO 3166-2:AR | ¿Cuál es la tabla de códigos de `region` que usan? |
| — | Tipos de documento | ¿La lista es solo DNI/CUIT/CUIL? |
