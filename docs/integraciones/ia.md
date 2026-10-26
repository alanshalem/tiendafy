# Inteligencia artificial (Anthropic, OpenAI, Google y Groq)

Estado: **la base está completa en código y probada con proveedores simulados;
ningún test llama a un proveedor real.** Falta una prueba de punta a punta con
una clave verdadera de cada proveedor (precios y capacidades del catálogo
verificados contra las páginas de cada uno el 25-oct-2026). El diseño y sus
decisiones están en
[historial/diseno-ia-multi-proveedor.md](../historial/diseno-ia-multi-proveedor.md);
este documento es lo que hay que saber para operarla.

## Qué hace en Tiendafy

Las funciones de IA de la tienda (hoy: sugerir la respuesta a una pregunta de
Mercado Libre o del chat posventa, redactar un post para redes y la descripción
de un producto; el escaneo de facturas de compra usa la misma puerta) corren
con **las claves de cada tienda**, no con una de la plataforma. Cada tienda
carga la suya en Configuración → Inteligencia artificial, elige qué modelo hace
cada tarea y se pone un tope de gasto por mes. Nada de esto lo paga la
plataforma: lo que se consume lo factura el proveedor a la cuenta de quien
cargó la clave.

Lo que sale del modelo siempre lo revisa una persona antes de usarse: ninguna
herramienta que le damos al modelo escribe nada.

## Dónde está el código

| Pieza | Archivo |
|---|---|
| Entidades (credencial, asignaciones, ajustes, consumo) y migraciones | `backend/src/Modules/Ai/Ai.Infrastructure/` |
| Puerta única a los modelos: orden de chequeos, respaldo, timeout | `backend/src/Api/Ai/AiGateway.cs` |
| Catálogo de modelos y precios (en código, no editable) | `backend/src/Api/Ai/AiModelCatalog.cs` |
| Tareas, requisitos y límites de cada una | `backend/src/Api/Ai/AiTaskSpecs.cs` |
| Qué permisos habilitan cada tarea (un solo mapa) | `backend/src/Api/Ai/AiTaskPermissions.cs` |
| Tope con reserva del peor caso | `backend/src/Api/Ai/AiBudget.cs`, `AiCost.cs` |
| Medición de cada respuesta | `backend/src/Api/Ai/MeteringChatClient.cs`, `AiUsageRecorder.cs` |
| Corte por fallas | `backend/src/Api/Ai/AiCircuitBreaker.cs` |
| Cupos por usuario y por tienda | `backend/src/Api/Ai/AiRateLimit.cs` |
| Cifrado de claves | `backend/src/Api/Ai/AiKeyProtector.cs` |
| Configuración (claves, probar, asignaciones, copiar a otras tiendas) | `backend/src/Api/Ai/AiConfigService.cs`, `Endpoints/AiConfigEndpoints.cs` |
| Consumo del mes | `backend/src/Api/Ai/AiUsageQueries.cs`, `Endpoints/AiUsageEndpoints.cs` |
| Estado por tarea y por persona, y los textos cortos | `backend/src/Api/Endpoints/AiEndpoints.cs` |
| Panel | `admin/src/pages/Settings/AiSettings.tsx` y las tarjetas `Ai*Card.tsx`; `admin/src/lib/useAi.ts` |
| Aviso de tope en Inicio | `HomeEndpoints.cs` (`AiBudgetNoticeAsync`) |

Para sumar una función nueva de IA: una `AiTask` con su línea en
`AiTaskSpecs` (requisitos, tope de salida, vueltas, timeout) y su mapa en
`AiTaskPermissions`; el código de la función entra por
`IAiGateway.RunAsync` y **nunca** crea un cliente por su cuenta (sin la puerta
no hay tope, ni medición, ni respaldo).

## Proveedores y claves

La tienda carga una clave por proveedor. Las URL de los proveedores son
constantes en el código y **no hay ningún campo para cargar una**: sería la
forma de mandar la clave de una tienda a un servidor ajeno.

| Proveedor | De dónde se saca la clave | Notas |
|---|---|---|
| Anthropic (Claude) | [console.anthropic.com](https://console.anthropic.com) → API keys | Pide cargar saldo antes: sin crédito contesta 400 "credit balance is too low" (el gateway lo trata como clave sin saldo) |
| OpenAI | [platform.openai.com](https://platform.openai.com) → API keys | Se usa Chat Completions, no Responses |
| Google (Gemini) | [aistudio.google.com](https://aistudio.google.com) → Get API key | Un 400 "API key not valid" también es la clave, no el pedido |
| Groq | [console.groq.com](https://console.groq.com) → API Keys | Endpoint compatible con OpenAI. Sin lectura de PDF ni herramientas junto con JSON |

Las consolas cambian de nombre y de menú: si algún paso no coincide, buscá
"API keys" en la del proveedor.

- La clave se guarda cifrada con DataProtection, purpose
  **`Tiendafy.Ai.Keys.v1`**. **No se cambia nunca**: con otro purpose todas las
  claves cargadas dejarían de poder leerse y cada tienda tendría que cargarlas
  de nuevo (misma regla que los demás purposes de `AGENTS.md`). El volumen
  `dpkeys` se backupea junto con la base.
- La API nunca devuelve la clave: solo si está cargada, sus últimos 4
  caracteres y el resultado de la última prueba. Un PUT con la clave vacía
  conserva la guardada.
- La clave no va a logs, ni a Sentry, ni a ningún prompt. Por eso al loguear
  una falla del proveedor se escribe solo el estado HTTP y no la excepción: el
  cuerpo de un 401 puede traer la clave enmascarada.
- "Probar conexión" manda un mensaje de pocos tokens al modelo más barato de
  ese proveedor y lo registra como consumo de la tarea `ShortText`. **No pasa
  por el tope** (se puede probar una clave aunque el mes esté agotado) y por eso
  tampoco lo frena el tope. La palanca global `Ai:Disabled` sí la frena: con la
  IA apagada en la plataforma no llama a nadie y devuelve el mismo error que el
  gateway.
- "Copiar a mis otras tiendas" descifra y vuelve a cifrar con el mismo purpose,
  solo hacia tiendas donde la persona es dueña, y pisa lo que haya en el destino
  (el panel pide confirmación).

## Tareas y modelos

Una tarea es lo que se le asigna a un modelo (principal y, opcional, respaldo).
Cada una declara qué necesita del modelo y el panel solo ofrece los que lo
cumplen y cuyo proveedor tiene clave:

| Tarea | Para qué | Pide | Vueltas | Tope de salida | Tiempo máx. |
|---|---|---|---|---|---|
| `QuestionClassify` | clasificar una pregunta | JSON | 1 | 200 | 10 s |
| `QuestionDraft` | sugerir respuesta (ML y chat posventa) | herramientas | 3 | 600 | 30 s |
| `DataAssistant` | asistente de datos | herramientas | 6 | 1500 | 60 s |
| `CatalogWrite` | redactar fichas | JSON | 1 | 1500 | 60 s |
| `CatalogJudge` | evaluar una ficha | JSON | 1 | 400 | 30 s |
| `InvoiceRead` | leer facturas de compra | JSON, PDF, imagen | 1 | 4000 | 120 s |
| `ShortText` | post para redes, descripción de producto | nada | 1 | 600 | 30 s |

(Los valores vigentes son los de `AiTaskSpecs.cs`.) Las tareas que todavía no
tienen pantalla propia (`QuestionClassify`, `DataAssistant`, las de catálogo) ya
existen para que el panel las asigne cuando se construyan.

El catálogo de modelos y sus precios (micro-dólares por millón de tokens) viven
en `AiModelCatalog.cs`, con la fecha de verificación arriba. Dos cosas que no
se ven en el código:

- **Los precios cambian y nadie los actualiza solos.** Cambiar un precio o
  sumar un modelo es un commit. Pendiente conocido: Gemini 3.8 Flash sube a
  1,50 / 7,50 USD el 1-ene-2027.
- **Entrada en caché de Sonnet 5.5: 0,10 USD por millón** según la página de
  Anthropic (el diseño decía 0,20). Donde el proveedor no publica un precio de
  caché, el catálogo usa el 10 % de la entrada.

Los modelos de Claude se llaman sin `temperature` (la API la rechaza desde el
21-oct-2026) y con el `effort` de cada tarea. A ningún modelo se le manda
`ChatMessage.AuthorName` (Groq devuelve 400 con `name`).

## Qué pasa en cada llamada

El orden de chequeos del gateway es el contrato; está en el resumen de la
clase `AiGateway`:

1. **Palanca global** `Ai:Disabled` (variable `Ai__Disabled=true`): apaga la IA
   de **todas** las tiendas sin tocar nada de ellas. Es para una emergencia
   (un proveedor con un problema de seguridad, un gasto que se dispara). Se
   lee en cada llamada, así que alcanza con reiniciar la API.
2. **Modelo asignado, que exista y cumpla la tarea.** Sin modelo es
   `Ai.TaskNotConfigured` aunque la tienda esté apagada: en una tienda que nunca
   armó la IA el panel no muestra los botones.
3. **Interruptor de la tienda** (`Ai.Disabled`: con modelo y la tienda apagada,
   el botón se ve deshabilitado con el motivo) y **clave del modelo**.
4. **Corte por fallas:** 3 fallas seguidas de un proveedor en una tienda lo dan
   por caído 5 minutos y se va directo al respaldo. En memoria: un reinicio lo
   borra (la API es una sola instancia).
5. **Reserva del peor caso** contra el tope (ver abajo).
6. **Cuerpo con el tiempo máximo de la tarea.**
7. **Respaldo una vez** si el principal cae. Por eso el cuerpo de una ejecución
   tiene que ser **de solo lectura**: se vuelve a correr entero.

Qué cuenta como falla y qué no (`AiGateway.Classify`). Del proveedor es solo
lo que salió de la llamada al modelo: `MeteringChatClient` marca esa excepción
(en `Exception.Data`, sin cambiarle el tipo). Lo que tira una herramienta, el
parseo de la respuesta o la base no está marcado, aunque sea un
`HttpRequestException` de un carrier caído:

| Caso | Qué hace |
|---|---|
| Del proveedor: 429, 408, 5xx, red, timeout | Pasa al respaldo y suma al corte por fallas |
| Del proveedor: 401, 402, 403, o un 400 que habla de clave o saldo | Error de configuración (`Ai.ProviderAuth`): **no** pasa al respaldo ni cuenta como caída |
| Del proveedor: cualquier otro 4xx (pedido demasiado largo, por ej.) | `Ai.Rejected`: ni respaldo ni corte |
| Venció el tiempo máximo de la tarea | `Ai.TimedOut`: pasa al respaldo y suma al corte |
| Cualquier otra excepción del cuerpo (herramienta, parseo, base, armar el cliente del SDK) | `Ai.Failed` (503): ni respaldo ni corte; se loguea entera porque no viene del proveedor |

La cancelación del pedido (el usuario cerró la pestaña) no es una falla: se
propaga como `OperationCanceledException`.

Ningún error del gateway es un 500: configuración y tope son 409, una caída del
proveedor o una falla del cuerpo es 503. Los códigos (`Ai.Disabled`,
`Ai.TaskNotConfigured`, `Ai.BudgetExceeded`, `Ai.ProviderAuth`, `Ai.Failed`…)
están en `AiErrors.cs`. Los SDK no reintentan por su cuenta (`MaxRetries = 0` y
equivalentes en `AiChatClientFactory`): el único reintento es el respaldo.

El tope (la reserva), el corte por fallas, la concurrencia y los cupos viven en
memoria y suponen **una sola instancia** de la API: con dos réplicas cada una
lleva su cuenta.

### Cupos

Son un filtro de endpoint (`RequireAiRateLimit`) y no una política de
`UseRateLimiter`: ese middleware corre antes de saber quién es el usuario y de
qué tienda es. Agregalo **después** de `RequirePermission`/`RequireTenant`.

| Clave | Default | Alcance |
|---|---|---|
| `RateLimiting:AiPermitLimit` | 30 cada 5 minutos | por usuario y por ruta (el patrón, no el path) |
| `RateLimiting:AiJobsPermitLimit` | 5 por hora | por tienda, para los trabajos masivos de catálogo |

Pasarse da 429 con `Retry-After`. Está registrado además `AiConcurrency`, una
sola ejecución pesada a la vez (asistente por usuario, trabajo de catálogo por
tienda; la segunda recibe `Ai.Busy`), pero todavía no lo usa ninguna función:
lo van a usar las partes B y C.

## Tope mensual y consumo

- Cada tienda tiene un tope mensual en dólares, un umbral de aviso (80 % por
  defecto) y un interruptor. **Sin tope no se prende la IA**: el panel lo exige
  y sugiere US$ 20.
- El mes es el **mes calendario en hora Argentina**, no el UTC.
- Toda la plata está en micro-dólares (`long`, sufijo `MicroUsd`); nunca
  `double` ni `decimal` para acumular.
- Antes de cada llamada se **reserva el peor caso** (entrada estimada por lo
  alto más el tope de salida de la tarea, al precio del modelo). Si gastado +
  reservado + peor caso pasa el tope, no se ejecuta. Al terminar se libera la
  reserva y queda lo real. Es lo que evita que cinco pedidos en paralelo
  crucen el tope todos juntos. Cada intento (principal o respaldo) reserva por
  separado, con el precio de su modelo.
- Lo gastado se lee de `AiUsage` y se cachea 30 segundos por tienda, sumándole
  lo informado desde la última lectura. En el peor caso se cuenta algo dos
  veces un rato: es conservador a propósito.
- **Es un cálculo estimado.** La factura real es la del proveedor, y por eso la
  pantalla pide poner también un **límite de gasto en la consola de cada
  proveedor**. Ese límite es la red de seguridad de verdad.
- El aviso en Inicio aparece al llegar al umbral ("warn") y al 100 % ("over"),
  y solo lo ve quien tiene `ai.config`. No hay mail ni centro de
  notificaciones.
- La vista "todas mis tiendas" del consumo es la única lectura que cruza
  tiendas, y solo sobre las que la persona es dueña.

### Qué se registra y qué no

`AiUsage` guarda por llamada: tienda, usuario, tarea, proveedor, modelo,
identificador de la ejecución, tokens (entrada, entrada en caché, salida),
costo, resultado (ok, error, respaldo) y fecha. **Nunca prompts ni
respuestas**: por privacidad y por tamaño.

Cosas que sorprenden:

- Los tokens se normalizan igual para todos los proveedores:
  `entrada = max(0, entrada informada − caché)`. El adaptador de Anthropic ya
  informa la escritura de caché dentro de la entrada, así que no se suma otra
  vez (queda cobrada al precio de entrada, un poco menos que el recargo real).
- Registrar el consumo **nunca rompe la llamada**: si el insert falla, se
  loguea y se sigue, y la reserva se informa antes de tocar la base. También se
  registra aunque el pedido se cancele después de que el proveedor respondió
  (ya cobró).
- Si una respuesta no trae uso de tokens se registra en 0 y se loguea un aviso.
- Ninguna tarea usa streaming: si alguna lo usa, hay que medirlo a mano (hoy
  `MeteringChatClient` lo deja pasar sin medir).

## Permisos

- Configurar (claves, modelos, tope, consumo, copiar): `ai.config`
  (`Permission.AiConfig`), **solo del dueño** y sensible. No se delega.
- Usar cada función pide el permiso de esa función, no `ai.config`: ver el mapa
  en `AiTaskPermissions.cs` y [permisos.md](../permisos.md).
- `GET /api/v1/ai/status` dice, por tarea y para **esta persona en esta
  tienda**, si se puede usar, con el motivo en castellano y un `code`. El panel
  decide por el `code` (`Ai.Disabled`, `Ai.TaskNotConfigured`, `Ai.Denied`…) y
  no por el texto.

## Endpoints (bajo `/api/v1`)

- `GET /ai/status`: estado por tarea. Pide sesión y tienda.
- `POST /ai/short-text` con `{ kind: "social-post" | "product-description", … }`
  (reemplaza a `/ai/social-post`). El permiso se mira adentro según el `kind`.
- `POST /ai/ml-answer` y `POST /ai/support-reply`: respuesta sugerida.
- `GET /ai/config`, `PUT|DELETE /ai/config/providers/{provider}`,
  `POST /ai/config/providers/{provider}/test`, `PUT /ai/config/assignments`,
  `PUT /ai/config/settings`, `POST /ai/config/copy`, `GET /ai/config/usage`:
  todos piden `ai.config`.

## Configuración de plataforma

La IA ya **no usa variables de plataforma para la clave**: `Ai__ApiKey`,
`Ai__Model` (`AI_API_KEY`, `AI_MODEL`) se borraron. Quedan dos de operación
(detalle en [configuracion.md](../configuracion.md)):

| Clave | Para qué |
|---|---|
| `Ai:Disabled` (`Ai__Disabled`) | Apaga la IA de todas las tiendas |
| `RateLimiting:AiPermitLimit` / `RateLimiting:AiJobsPermitLimit` | Cupos de arriba |

## Después del primer deploy

La IA queda **apagada en todas las tiendas hasta que su dueño cargue una
clave**, un modelo y un tope. Antes ya andaba con la clave de plataforma, así
que avisá a los dueños. Los pasos están en
[despliegue.md](../despliegue.md#después-de-desplegar-la-ia).

## Pendiente

- Prueba de punta a punta con una clave real de cada proveedor (hoy todo corre
  contra proveedores simulados).
- Las funciones A–D del diseño (bandeja de preguntas, asistente de datos,
  fichas en lote, facturas encadenadas) tienen su propio plan en
  `historial/plan-ia-*.md`; esta base ya trae las tareas, los permisos y el
  tope que usan.
- Actualizar los precios del catálogo cuando un proveedor los cambie (el
  próximo: Gemini 3.8 Flash, 1-ene-2027).
