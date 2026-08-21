# 01 — Resumen ejecutivo

**Integración de Andreani como carrier de Tiendafy**
Relevamiento del 2026-08-21 · Especificación para implementación

---

## 1.1 La conclusión en un párrafo

Andreani tiene una API REST funcional que cubre el ciclo completo de e-commerce nacional: cotizar, generar la orden, obtener la etiqueta y hacer seguimiento. **Se puede integrar.** Pero su documentación pública está desactualizada, fragmentada en tres portales que no se referencian entre sí, y tiene huecos en lugares críticos — el endpoint de cotización no publica ni un solo parámetro de entrada, y no existe una tabla de estados de envío. Además **no hay sandbox público**: sin pasar por un ejecutivo comercial no se puede escribir ni la primera línea de código contra QA. La integración es viable y de complejidad media, pero **el camino crítico no es técnico: es comercial**, y hay que arrancarlo el día uno.

---

## 1.2 Qué ofrece Andreani vía API

| Capacidad | Estado | Endpoint |
|---|---|---|
| Autenticación | ✅ | `POST /login` → token en header `x-authorization-token` |
| **Cotización** | ⚠️ Existe, **parámetros no documentados y path ambiguo** | `GET /tarifas` (🟡 SDKs: `/v1/tarifas`) |
| **Crear orden de envío** | ✅ Bien documentado | `POST /ordenes-de-envio` |
| **Etiqueta (PDF)** | ⚠️ Existe, path ambiguo, sin ZPL | Link en `bultos[].linking` |
| **Tracking** | ✅ Requiere habilitación explícita | `GET /envios/{n}/trazas` (🟡 SDKs: `/v2/...`) |
| **Webhook de movimientos** | ⚠️ Existe, pero **invertido** y con alta manual | El cliente define el contrato |
| Sucursales y puntos de retiro | ✅ | `GET /sucursales`, `GET /puntos-de-tercero` |
| Localidades y CP | ✅ **Sin autenticación** | `GET /localidades` |
| Constancias de entrega | ⚠️ Links, no datos estructurados | `GET /envios/{n}/multimedia` |
| Cancelación / modificación | ❌ **No existe** | — |
| Devoluciones / logística inversa | ❌ **Sin API** | — |
| Reclamos | ❌ **Sin API** | — |
| Etiquetas en lote / manifiesto | ❌ **No existe** | — |
| Fulfillment / WMS | ✅ (fuera de alcance) | `almacenes/*` |

---

## 1.3 Alcance recomendado para Tiendafy

**Modelo: contrato propio por comercio (Modelo B).** Cada tienda usa sus propias credenciales y contratos de Andreani; Tiendafy orquesta. Es lo que hacen VTEX, TiendaQuick y la mayoría de los integradores. Evita que Tiendafy sea responsable de la facturación logística de sus clientes.

**Dentro de alcance:** cotización en checkout, generación de orden post-pago, impresión de etiqueta desde el panel, tracking con notificaciones al comprador, bandeja de excepciones.

**Fuera de alcance (por ahora):** fulfillment/WMS, envíos internacionales (GlobAllPack es un producto separado), devoluciones automatizadas (no hay API), Tiendafy como agregador con contrato propio (decisión comercial, no técnica).

---

## 1.4 Esfuerzo estimado

Estimación para **un desarrollador senior backend .NET con apoyo de front**, asumiendo que Zipnova ya está integrado y que hay que definir el contrato neutral en el camino.

| Fase | Contenido | Estimación | Dependencias |
|---|---|---|---|
| **Fase 0** | Alta comercial, cuestionario de GAPs, IP fija | ⏳ **2 a 6 semanas de calendario**, ~3 días de trabajo | **Bloqueante. Arranca el día 1** |
| **Fase 1** | Contrato `IShippingCarrier` + refactor de Zipnova + cotización + cache + checkout | **3 a 4 semanas** | Credenciales de QA |
| **Fase 2** | Generación de orden, idempotencia, etiquetas, panel admin | **2 a 3 semanas** | Fase 1 |
| **Fase 3** | Tracking, polling, mapeo de estados, notificaciones | **2 a 3 semanas** | Catálogo de estados de Andreani |
| **Fase 4** | Webhook, bandeja de excepciones, conciliación | **1 a 2 semanas** | Alta del webhook con Andreani |
| **Fase 5** | Opcionales (devoluciones, ZPL, bin packing) | Según respuestas | — |

**Total de trabajo efectivo: 8 a 12 semanas.** **Total de calendario: 10 a 18 semanas**, dominado por los tiempos de Andreani.

> **La estimación de Fase 1 incluye el refactor de Zipnova al contrato neutral.** Es trabajo que no se ve pero que hace que el tercer carrier cueste una semana en vez de cuatro. Saltearlo es deuda técnica con interés alto.

**Los tres factores que más pueden mover esta estimación:**

1. **Lead time del alta comercial y de las habilitaciones.** No lo controlamos. Es el mayor riesgo de cronograma.
2. **Si `tarifas` no funciona como indican los SDKs de terceros**, la Fase 1 se puede extender una o dos semanas resolviendo el contrato por prueba y error.
3. **Si el catálogo de estados no llega**, la Fase 3 queda a medias: se puede trackear el ciclo feliz, pero no clasificar excepciones.

---

## 1.5 Recomendación

**Integrar, con tres condiciones:**

1. **Arrancar el alta comercial y el cuestionario de GAPs antes que cualquier código.** Es la única tarea con lead time externo y bloquea todo lo demás.
2. **No escribir código pegado a Andreani.** Definir `IShippingCarrier` con DTOs neutrales y `CarrierCapabilities`, y alinear Zipnova al mismo contrato. Con dos carriers ya vale la pena; con tres es imprescindible.
3. **Diseñar asumiendo que Andreani no cancela y no es idempotente.** Es la restricción más dura de toda la integración y condiciona el worker de creación, el panel admin y el proceso operativo del comercio.

**Por qué vale la pena a pesar de los GAPs:** Andreani es el operador logístico con mayor cobertura y reconocimiento de marca en Argentina. Para muchos comercios es *el* requisito de envío. La ausencia de cancelación y de catálogo de estados son molestias operativas que se pueden encapsular; la ausencia de Andreani en el checkout es una objeción de venta.

---

## 1.6 Riesgos de la integración

Ordenados por impacto esperado.

### 🔴 R1 — El alta comercial bloquea el cronograma

**Qué puede pasar:** no hay sandbox público. Sin ejecutivo comercial asignado y sin credenciales de QA, el equipo no puede validar nada contra la API real. Los lead times no están publicados y el proceso pasa por un CRM comercial con activación administrativa.

**Mitigación:**
- Iniciar el contacto comercial el **día 1**, antes de escribir código.
- Trabajar contra un **mock HTTP** (WireMock.Net) construido con los JSON de ejemplo de la documentación oficial. Toda la lógica de dominio — bultos, cache, mapeo de estados, degradación, idempotencia — se desarrolla y testea sin red.
- Ordenar el backlog para que lo que depende de credenciales esté lo más tarde posible dentro de cada fase.

### 🔴 R2 — El contrato de cotización no está documentado

**Qué puede pasar:** el endpoint de cotización es el que desbloquea el checkout y **no tiene ni un parámetro de entrada publicado**. Peor: **ni siquiera el path es inequívoco** — la doc oficial escribe `tarifas` y los SDKs usan `/v1/tarifas`. Los parámetros conocidos vienen de dos SDKs de terceros que convergen, pero podrían estar desactualizados o incompletos. Si no funcionan, hay que descubrir el contrato por prueba y error.

**Mitigación:**
- Es la **primera pregunta** del cuestionario a Andreani.
- Antes de escribir el cliente HTTP, **abrir `developers.andreani.com/documentacion` en un navegador** y verificar a mano si la tabla existe y el fetch automatizado no la capturó.
- Aislar la construcción de la query en una sola clase, para que un cambio de contrato sea un archivo y no una refactorización.

### 🔴 R3 — Sin cancelación y sin idempotencia, un duplicado es irreversible

**Qué puede pasar:** un timeout en `POST /ordenes-de-envio` deja al sistema sin saber si la orden se creó. Reintentar puede duplicar un envío que **no se puede cancelar por API** y que probablemente se facture. No reintentar puede dejar un pedido pago sin despachar. Y no hay endpoint para consultar por referencia propia, así que la reconciliación automática tampoco es posible.

**Mitigación:**
- Idempotencia de tres capas: constraint único local, referencia externa en el request, y estado `CREACION_INCIERTA` con intervención humana (`06` §6.5).
- **Ante la duda, no crear.** Escalar a un operador. Un envío faltante se detecta y se crea; un duplicado se despacha y se factura.
- Preguntar por **pre-numeración**: si Andreani asigna rangos de números por adelantado, la idempotencia se resuelve de raíz.
- Preguntar **cómo consultar una orden por referencia externa**. Es la pregunta que más cambia el diseño.

### 🟠 R4 — No hay catálogo de estados de envío

**Qué puede pasar:** solo se conocen 4 `EstadoId` y 1 `MotivoId`, sacados de ejemplos. Sin el catálogo no se pueden clasificar excepciones, ni saber qué estados son terminales, ni notificar correctamente al comprador. Además hay **dos enumeraciones distintas** (`EstadoId` de traza vs `estadoId` de envío) que es fácil confundir.

**Mitigación:**
- **Persistir siempre el estado crudo** junto al neutral. Estados desconocidos → `UNKNOWN` + alerta, nunca excepción, nunca notificación al comprador.
- La vía real de obtención es **el proceso de alta del webhook**: los campos `event`/`reason` son "Client Codes", así que Andreani tiene que mostrar su catálogo para que definamos el mapeo. Iniciar esa conversación temprano aunque el webhook se implemente después.

### 🟠 R5 — Latencia de cotización en el checkout

**Qué puede pasar:** cada cotización es un round-trip a un gateway externo sin SLA publicado. Andreani necesita **dos llamadas** para ofrecer domicilio y sucursal. Si el gateway está lento, el checkout se degrada justo donde más duele.

**Mitigación:**
- Cache en Redis con clave normalizada, TTL 30 min. Con el redondeo del valor declarado a la centena, el hit rate es alto (`05` §5.7).
- Timeout agresivo (2 s) y **presupuesto global** de 3 s para todos los carriers, no por carrier.
- Circuit breaker: si Andreani está caído, el checkout muestra los demás carriers y sigue funcionando.
- **Nunca mostrar un precio inventado.** Mejor no ofrecer la opción que ofrecerla mal.

### 🟠 R6 — Formatos de dirección argentinos

**Qué puede pasar:** es la causa número uno de rechazos en integraciones logísticas argentinas. La localidad debe coincidir con el catálogo de Andreani, y el email del destinatario tiene un límite de **40 caracteres** que va a rechazar direcciones legítimas.

**Mitigación:**
- Precargar el catálogo completo de `GET /localidades` (público, sin auth) en PostgreSQL con un job semanal, y **normalizar antes de enviar**.
- Validar todo del lado de Tiendafy: CP, localidad, CUIT con dígito verificador, longitudes. Un error de validación propio es específico y accionable; un 400 de Andreani es un mensaje opaco.
- Validar el email de 40 caracteres **en el checkout**, donde el comprador puede corregirlo, no en el worker de despacho.
- No enviar `region` si no hay certeza del código ISO 3166-2:AR. El campo es opcional.

### 🟠 R7 — Etiquetas sin ZPL

**Qué puede pasar:** no hay evidencia de ZPL en ninguna fuente. Un comercio con volumen que use impresora térmica Zebra va a depender del rasterizado del PDF, que es la causa clásica de "el código de barras no escanea en el depósito". Y no hay etiquetas en lote ni manifiesto generable.

**Mitigación:**
- Preguntar explícitamente por ZPL. Puede existir sin estar documentado.
- **Prueba física obligatoria antes de go-live**: imprimir en la impresora real del comercio y **escanear el código con un lector**.
- Impresión masiva resuelta del lado de Tiendafy: descargar N PDFs y concatenarlos. Cachear en object storage para reimpresión.

### 🟡 R8 — Restricción por IP y horario de QA

**Qué puede pasar:** GlobAllPack documenta whitelisting por IP y QA disponible solo de 08:00 a 20:00 ART, sobre el mismo gateway. Si aplica a la API nacional, un backend en cloud con egress NAT dinámico simplemente no conecta, y el CI no puede correr tests de integración de noche.

**Mitigación:**
- Confirmarlo **en Fase 0**, antes de diseñar la infraestructura.
- NAT gateway con IP estática para backend y runners de CI, con las IPs informadas a Andreani.
- Suite de tests de integración con tag propio, excluida del pipeline por defecto.

### 🟡 R9 — Documentación desactualizada y versiones en conflicto

**Qué puede pasar:** la doc principal y el esquema beta del sandbox describen **bodies distintos** para el mismo endpoint, con tipos incompatibles (`sucursalClienteID` string vs int32, `eMail` vs `email`, `telefonos` objeto vs array). No hay changelog ni política de versionado. La página oficial tiene títulos duplicados y errados.

**Mitigación:**
- Preguntar cuál es la versión vigente **antes de escribir el DTO**.
- Aislar los DTOs de Andreani en el proyecto de infraestructura. Un cambio de versión no debe tocar el dominio.
- Tests de contrato contra mock que fallen ruidosamente si el shape cambia.

### 🟡 R10 — Sin rate limits, SLA ni status page

**Qué puede pasar:** no hay límites publicados, ni SLA, ni página de estado. Un incidente de Andreani se detecta por los síntomas, no por un aviso.

**Mitigación:**
- Parámetros defensivos: timeouts por operación, backoff exponencial con jitter, circuit breaker, bulkhead por tenant (`11` §11.4).
- **Observabilidad propia**: tasa de error, latencia p95 y estado del circuito por endpoint, con alertas. Es el reemplazo de la status page que no existe.
- Construir el catálogo de errores internamente a medida que aparecen en producción.

---

## 1.7 Pendiente de confirmar — cuestionario para Andreani

Enviar completo, por escrito, al iniciar el alta. Ordenado por impacto en el desarrollo.

### 🔴 Bloqueantes

1. **Cotización: ¿cuál es el path y el contrato exacto?** ¿Es `/tarifas` o `/v1/tarifas`? ¿Qué parámetros acepta, cuáles son obligatorios, van en query string o body, requiere token? ¿Soporta múltiples bultos (`bultos[1][...]`)? La documentación pública no publica ninguna tabla de parámetros para este endpoint.
2. **¿Cuál es la tabla completa de `EstadoId` y `MotivoId`?** Con el nombre de cada estado, cuáles son terminales, cuáles representan un problema (rezago, devolución, siniestro, dirección incorrecta) y cuál es el orden esperado.
3. **¿Cómo consulto una orden de envío usando mi referencia externa, sin conocer el `numeroAndreani`?** Es lo que necesito para reconciliar después de un timeout.
4. **¿Cómo obtengo credenciales de QA y cuál es el lead time?** ¿Existen datos o direcciones de prueba? ¿Hay forma de forzar estados de tracking en QA?
5. **¿La API nacional aplica whitelisting por IP?** Si sí: procedimiento de alta, ¿soporta rangos CIDR? ¿Y QA tiene la restricción horaria de 08:00–20:00 ART?

### 🟠 Alta prioridad

6. **¿Se confirma que no hay endpoint de cancelación ni de modificación?** ¿Cuál es el procedimiento y el plazo para anular un envío no despachado? ¿Se factura un envío generado y no despachado?
7. **¿Cómo se genera una devolución / logística inversa?** ¿Es una orden de envío con otro contrato y origen/destino invertidos? ¿`productoARetirar` tiene que ver?
8. **¿Existe formato ZPL para las etiquetas?** ¿Y PNG? ¿Hay parámetro de formato o de tamaño? ¿Cuál es el path canónico: `/v2/{n}/etiquetas` o `/v2/ordenes-de-envio/{n}/etiquetas`? ¿La etiqueta es estable entre descargas (se puede cachear)?
9. **¿Un mismo `user`/`password` opera todos mis contratos**, o hay credenciales por contrato? ¿Cuántos contratos me asignan y con qué criterio (canal, modalidad, servicio)? ¿Puedo sumar contratos después sin re-homologar?
10. **¿Cuáles son los rate limits?** ¿Hay 429 con `Retry-After`? ¿Hay status page o canal de avisos de incidentes y mantenimiento?
11. **¿Qué filtros y paginación acepta `GET /envios`** (tracking masivo)? De esto depende si el polling es viable a escala.
12. **¿Existe una tabla de códigos de error** con su significado y si son reintentables?
13. **¿Cuál es la versión vigente de `POST /ordenes-de-envio`?** La documentación principal y el esquema beta del sandbox describen bodies con tipos incompatibles.

### 🟡 Media prioridad

14. ¿Cuál es el **TTL del token** de `x-authorization-token`? ¿Hay rate limit en `/login`?
15. ¿Cuál es la **lista de valores válidos** de `tipoServicio`, `tipoProducto` y `categoriaFacturacion`? ¿`tipoServicio` es un selector real o solo descriptivo?
16. ¿Qué `id` de sucursal va en `destino.sucursal.id`: el `id` de `/sucursales` o el `id`/`numero` de `/puntos-de-tercero`? Son distintos para el mismo punto físico.
17. ¿Cómo verifico **cobertura a domicilio** para un CP antes de cotizar? ¿Qué error devuelve un destino no cubierto?
18. ¿Hay una **matriz de plazos de entrega** por zona? ¿`fechaEstimadaDeEntrega` se puebla en producción?
19. ¿Cuál es la **fórmula del peso aforado** de mi contrato?
20. ¿Cómo se solicita un rango de **pre-numeración** de envíos? ¿Qué pasa si repito un número?
21. ¿Cómo es el **alta del webhook** de movimientos? Lead time, quién lo ejecuta, ¿se puede probar en QA? ¿Cuál es la política de reintentos y qué IPs de origen usan? ¿Puedo pedir un campo `timestamp` en el payload?
22. ¿Existe **API o proceso de reclamos**? ¿Cuál es el tope de cobertura del seguro, el porcentaje sobre el valor declarado y qué documentación exige un siniestro?
23. ¿Existe una **API estructurada de prueba de entrega**? ¿Qué valores de `meta` puede devolver `multimedia`?
24. ¿Qué devuelve la API ante **CP inexistente, localidad mal escrita o CUIT inválido**? ¿Acepta CPA de 8 caracteres? ¿`documentoNumero` acepta guiones? ¿Qué formato de teléfono espera?
25. ¿Cuál es la **tabla de códigos ISO 3166-2:AR** que usan para `region`?
26. ¿Existe un **proceso formal de homologación**? ¿Qué habilitaciones necesito, con qué lead time, y hay acta o certificado?
27. ¿Qué endpoints requieren **habilitación explícita** por el equipo de Andreani? La documentación menciona el caso de trazas; ¿hay una lista completa?
28. ¿Hay **etiquetas en lote** o **manifiesto de despacho** generable por API? ¿Qué es `etiquetasPorAgrupador`?
29. ¿Existe un **programa de partner/integrador** con contrato marco, para operar como plataforma multi-comercio?
30. ¿Las **tarifas de QA** son representativas o ficticias? ¿Los números de contrato cambian al pasar a producción?
31. ¿Cuál es la **fuente canónica y vigente** de documentación? Conviven `developers.andreani.com/documentacion`, `developers-sandbox.andreani.com` y `andreani.docs.apiary.io`, con contenidos distintos. ¿Hay changelog o avisos de deprecación?

> **Confirmar también el canal de soporte técnico.** Circula `apis@andreani.com` en documentación de terceros, pero **no aparece en ninguna página oficial de Andreani**.

---

## 1.8 Índice de la especificación

| Documento | Contenido |
|---|---|
| `00-cobertura-fuentes.md` | URLs visitadas, árbol de la documentación, qué quedó inaccesible, índice de GAPs |
| `01-resumen-ejecutivo.md` | Este documento |
| `02-alta-credenciales-ambientes.md` | Alta comercial, autenticación, ambientes, modelo multi-tenant |
| `03-catalogo-servicios-cobertura.md` | Productos, sucursales, puntos de retiro, cobertura, localidades |
| `04-api-reference.md` | Endpoint por endpoint, con contratos y ejemplos |
| `05-flujo-cotizacion.md` | Cotización en checkout, peso volumétrico, cache en Redis |
| `06-flujo-generacion-envio.md` | Creación de orden, bultos, idempotencia, cancelación |
| `07-etiquetas-y-documentos.md` | Etiquetas, formatos, lotes, manifiestos |
| `08-tracking-y-estados.md` | Endpoints de tracking, máquina de estados, tabla de mapeo |
| `09-webhooks-o-polling.md` | Webhook invertido, receptor, polling adaptativo |
| `10-excepciones-y-devoluciones.md` | Excepciones, logística inversa, reclamos, seguro |
| `11-errores-y-codigos.md` | Esquemas de error, tabla operativa, validaciones argentinas |
| `12-testing-y-homologacion.md` | Sandbox, datos de prueba, estrategia de testing, checklist |
| `13-plan-de-implementacion.md` | `IShippingCarrier`, modelo de datos, backlog, notas .NET, go-live |
| `14-andreani-vs-zipnova.md` | Mapa de equivalencias conceptuales |
