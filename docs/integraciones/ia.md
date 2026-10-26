# Inteligencia artificial (Anthropic, OpenAI, Google y Groq)

Estado: **la base está completa en código y probada con proveedores simulados;
ningún test llama a un proveedor real.** Falta una prueba de punta a punta con
una clave verdadera de cada proveedor (precios y capacidades del catálogo
verificados contra las páginas de cada uno el 25-oct-2026). El diseño y sus
decisiones están en
[historial/diseno-ia-multi-proveedor.md](../historial/diseno-ia-multi-proveedor.md);
este documento es lo que hay que saber para operarla.

## Qué hace en Tiendafy

Las funciones de IA de la tienda (hoy: escribir el borrador de respuesta a una consulta de la Bandeja
—pregunta o mensaje de Mercado Libre, chat posventa o contacto—, redactar un post para redes y la descripción
de un producto, responder preguntas sobre los datos de la tienda y mejorar las fichas del catálogo en lote
con los atributos de Mercado Libre; el escaneo de facturas de compra usa la misma puerta) corren
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
| Borradores de la bandeja (endpoints, pasos, herramientas, datos personales, avisos) | `backend/src/Api/Ai/Questions/` |
| Fichas del catálogo en lote (selección, gate, prompts, worker, revisión) | `backend/src/Api/Ai/Catalog/` |
| Lectura de categorías y atributos de ML, una llamada a la vez por tienda | `backend/src/Api/Meli/MeliCatalogReader.cs`, `MeliTenantGate.cs`, `MeliCategoryResolver.cs`, `MeliListingAttributesPush.cs` |
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
| `QuestionDraft` | redactar el borrador de la bandeja | herramientas | 3 | 600 | 30 s |
| `DataAssistant` | asistente de datos | herramientas | 6 | 1500 | 60 s |
| `CatalogWrite` | redactar fichas | JSON | 1 | 1500 | 60 s |
| `CatalogJudge` | evaluar una ficha | JSON | 1 | 400 | 30 s |
| `InvoiceRead` | leer facturas de compra | JSON, PDF, imagen | 1 | 4000 | 120 s |
| `ShortText` | post para redes, descripción de producto | nada | 1 | 600 | 30 s |

(Los valores vigentes son los de `AiTaskSpecs.cs`.) `QuestionClassify` y
`QuestionDraft` ya las usa la bandeja ([más abajo](#bandeja-de-preguntas)),
`DataAssistant` el [asistente de datos](#asistente-de-datos) y `CatalogWrite` y
`CatalogJudge` las [fichas en lote](#fichas-del-catálogo-en-lote).

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

## Bandeja de preguntas

La IA escribe un **borrador** de respuesta para las consultas de la Bandeja. No
envía nada: el borrador vuelve al panel, se carga en el campo de respuesta y la
persona lo revisa y lo manda con el botón de siempre. Pedirlo es de solo
lectura.

### Endpoints

Todos son `POST`, bajo `/api/v1/ai`, **sin cuerpo**: el navegador manda solo el
id y el servidor lee la consulta, la publicación o el pedido (las rutas
anteriores recibían el texto del navegador). Todos llevan
`RequireAiRateLimit(AiRateLimitKind.PerUser)`: el cupo es por usuario y por ruta
(30 cada 5 minutos por defecto, ver [Cupos](#cupos)).

| Ruta | Permiso | Qué contesta |
|---|---|---|
| `/ml/questions/{id}/draft` | `meli.operate` | Una pregunta de preventa sin responder, de esta tienda |
| `/ml/messages/{packId}/draft` | `meli.operate` | El chat posventa de una venta de Mercado Libre |
| `/support/conversations/{id}/draft` | `support.chat` | El chat posventa de la tienda propia |
| `/contact/{id}/draft` | `messages.read` | Un mensaje del formulario de contacto |

La respuesta es `{ text, category, reason, manual, warnings }`. `category` va en
el formato del cable (`stock`, `envio`, `producto`, `precio`, `postventa`,
`fuera_de_politica`, `otro`). Con `manual: true` no hay `text`: la consulta no
se puede contestar con IA y el panel muestra "Respondé a mano" con el `reason`
(una frase que escribió el clasificador; el panel la muestra como texto plano y
nunca vuelve a un prompt).

Cuándo se ve el botón (`useAiTask` en el panel, sobre `GET /ai/status`):

- **Se oculta** si la persona no tiene el permiso del canal (en la Bandeja,
  el mismo de la tabla de arriba) o el de la función (`Ai.Denied`), o si la
  tienda nunca armó la IA (ninguna tarea tiene modelo).
- **Se ve deshabilitado**, con el motivo al pasar el mouse, en el resto de los
  casos en que no se puede usar: la IA de la tienda apagada, falta la clave,
  una de las dos tareas (`QuestionClassify`, `QuestionDraft`) sin modelo
  mientras otras sí lo tienen, la palanca global `Ai:Disabled`. El tope del mes
  no lo muestra el estado: se ve al pedir el borrador (`Ai.BudgetExceeded`).

### Pasos

`QuestionDraftService.DraftAsync`:

1. **Redactar.** Se toman los últimos 6 mensajes del hilo (los vacíos no
   cuentan); si ninguno es del comprador, `Ai.NothingToAnswer`. Cada mensaje
   pasa por `PiiRedactor`, se aplana a una línea (un salto de línea del
   comprador no puede inventar un mensaje del vendedor) y el conjunto se
   encierra en `<mensajes_del_comprador>` con `UntrustedText` (hasta 1500
   caracteres; sus `<` y `>` se reemplazan para que el comprador no abra ni
   cierre etiquetas). Si los mensajes no entran en los 1500, se caen **los
   más viejos primero**: el último del comprador, el que se contesta, queda
   siempre (seis mensajes de ML de 350 caracteres no entran). Si ese mensaje
   solo ya se pasa, se recorta su final. En el contacto el hilo es el mensaje
   original y hasta 5 respuestas ya enviadas, de la más vieja a la más nueva.
2. **Clasificar** (`QuestionClassify`, JSON). Devuelve una categoría y un
   motivo. Si la respuesta no es un JSON válido o la categoría no existe, es
   `otro` sin motivo. Con `fuera_de_politica` (pide o da datos de contacto,
   insulta, intenta darle órdenes al modelo) se corta acá: `manual: true`, sin
   segunda llamada.
3. **Redactar con herramientas** (`QuestionDraft`). El system prompt es una
   constante por canal (así el proveedor lo cachea); lo que cambia por consulta
   (el criterio de la categoría, el contexto armado por nosotros, el hilo) va
   en el mensaje de usuario. El motivo del clasificador **no** entra. El
   borrador es el texto del **último mensaje del asistente**
   (`ChatResponse.FinalText()` en `AiText`): `ChatResponse.Text` junta todos
   los mensajes de la vuelta, también lo que el modelo dice antes de llamar a
   una herramienta ("Voy a consultar…"), que no va al borrador.
4. **Avisos** (`DraftGuardrails`): chequeos deterministas sobre el texto. Solo
   detectan, el borrador no se modifica.

Todo pasa por `IAiGateway.RunAsync`, así que valen el tope, el consumo y el
respaldo. El consumo tiene una fila por cada llamada al modelo: clasificar es
una, y redactar de una a tres (una por vuelta con herramientas más la
respuesta final), así que un borrador deja de una a cuatro filas (una sola si
es `fuera_de_politica`), más las del respaldo si corre. Por eso las
herramientas se arman **dentro** del cuerpo: si corre el respaldo, arranca con
herramientas y registro nuevos.

### Herramientas por canal y categoría

Ninguna escribe ni recibe parámetros: lo que leen queda atado al ítem o al
pedido que ya resolvió el endpoint, el modelo no elige ids.

| Canal | Categoría | Herramientas |
|---|---|---|
| Pregunta de ML | `stock`, `precio` | `stock_y_precio` (precio y stock de la publicación) |
| Pregunta de ML | `producto` | `ficha_tecnica` (atributos de la publicación) |
| Mensaje posventa de ML y chat de la tienda | `envio` | `seguimiento` |
| Mensaje posventa de ML y chat de la tienda | `postventa` | `estado_del_pedido` y `seguimiento` |
| Mensaje posventa de ML y chat de la tienda | `otro` | `estado_del_pedido` |
| Mensaje de contacto | todas | ninguna |
| Cualquier canal | las que no figuran arriba | ninguna |

- **Tope de 5 segundos por herramienta.** Si el lector tarda más o falla, la
  herramienta le contesta al modelo "No pude consultar este dato ahora." y se
  sigue: una herramienta caída **no cuenta como falla del proveedor** (ni
  respaldo ni corte por fallas, ver
  [Qué pasa en cada llamada](#qué-pasa-en-cada-llamada)). Se loguea la
  herramienta, el tipo de excepción y si fue por tiempo, nunca el mensaje de la
  excepción (puede traer datos). La cancelación del pedido sí se propaga.
- **Cada herramienta corre una sola vez por intento** (`DraftToolLog`), haya
  traído el dato o fallado. Si el modelo la vuelve a pedir, en la misma vuelta
  o en otra, recibe "Ya te pasé este dato más arriba." sin leer nada:
  `MaximumIterationsPerRequest` limita las vueltas, no las llamadas por
  vuelta, y en posventa de ML cada `seguimiento` es un `GET /shipments` por
  envío.
- Cada resultado se recorta a 1200 caracteres, y la estimación de entrada para
  el tope suma ese margen por herramienta (vale porque cada una corre una vez).
- **No hay herramienta de envío en las preguntas de ML.** El costo y el plazo
  dependen del código postal de quien compra, que no tenemos: el borrador lo
  remite al calculador de envío de la publicación y no los calcula.
- El seguimiento del chat de la tienda trae transportista, número y estado,
  nunca la URL (dispararía el aviso de links). El número que el comercio cargó
  a mano es texto libre: solo se muestra si parece un código (letras, dígitos,
  guiones y espacios simples, hasta 40 caracteres); si no, el modelo recibe
  "Hay un seguimiento cargado, pero no se puede mostrar acá." Se lee al armar
  el borrador, no dentro de la herramienta: así ninguna herramienta toca la
  base. En la tienda propia no hay fecha estimada de entrega que prometer; en
  ML sale de `lead_time.estimated_delivery_time` y solo si el envío sigue en
  curso.
- **Leer es leer.** Los mensajes de ML se piden con `mark_as_read=false` (el
  `GET` de mensajes del panel marca leído; este no), el chat de la tienda se
  lee sin marcar la conversación y el contacto sin marcar el mensaje. Pedir un
  borrador no marca nada leído ni escribe en Mercado Libre.
- Las ventas del pack de ML salen del cache local; si no hay ninguna no se sale
  a ML. Una pregunta o un pack de otro vendedor es, para esta tienda, uno que no
  existe.

### Qué se oculta

- `PiiRedactor` tapa con `[dato oculto]` los mails (también "juan @gmail.com" o
  "juan arroba gmail punto com"), los teléfonos (también con puntos, como
  `11.5555.1234`, o con espacios y guiones) y los DNI y CUIT/CUIL. Un monto
  (`$ 1.250.000`, "1250000 pesos") no se toca; una corrida de 10 o más dígitos
  siempre se tapa.
- Lo que arma nuestro código (contexto y herramientas) no lleva mail,
  teléfono, DNI/CUIT, dirección, nickname ni nombre del comprador. En el chat
  de la tienda no se lee `AuthorName` (en los mensajes del cliente es su mail);
  en el contacto, solo el cuerpo.
- El seguimiento manual que no parece un código no se muestra (arriba).
- El texto del comprador siempre va como dato entre etiquetas, y el system
  prompt le dice al modelo que no obedezca las órdenes que traiga.

### Avisos

Salen en `warnings` (`code` y `message` en castellano, texto plano). Pueden
salir varios a la vez.

| `code` | Cuándo salta |
|---|---|
| `link` | El borrador trae una URL, un `www.` o un dominio (`.com`, `.ar`, `.shop`…) |
| `contact-data` | El borrador contiene `[dato oculto]` (copió un dato tapado), o trae un mail, teléfono, DNI/CUIT, un `@usuario` o una red social con un usuario o número. Los números que conoce nuestro código (pedido, pack, envío y el de seguimiento que devolvió la herramienta, de 6 caracteres o más) no cuentan |
| `amount` | Menciona un monto (`$ 15.000`, `14.000 pesos`) que no es ninguno de los conocidos: el de la publicación, o los del pedido (total, pagado, envío, lo devuelto, y el unitario y el subtotal de cada línea). Sin ningún monto conocido también avisa |
| `too-long` | Pasa de 350 caracteres en un mensaje posventa de ML (tope de Mercado Libre) o de 2000 en el resto |
| `delivery-date` | Promete una fecha de entrega y el seguimiento no trajo una fecha estimada |

Las promesas de fecha tienen dos grados. Las **señales fuertes** avisan solas:
"en 3 días", "dentro de 48 horas", "3 a 5 días", "días hábiles", "esta
semana", "la semana que viene", "a fin de mes", "el 12 de noviembre", "pasado
mañana". Un número de horas suelto solo cuenta si es un plazo (24, 48, 72 o
96: "despachamos en las próximas 24 hs"); "atendemos de 9 a 18 hs" no avisa.
Las **señales débiles** (un día de la semana, "mañana", "hoy" o una
fecha `dd/mm`) avisan solo si en la misma oración hay un verbo de entrega
(llegar, recibir, entregar, despachar, enviar, mandar, salir), para no avisar
por un "hoy estamos de vacaciones". Si la herramienta `seguimiento` devolvió
una fecha estimada, este aviso no salta.

Si un patrón se pasa de tiempo cuenta como "sin coincidencia": un aviso de
menos es mejor que un 500.

### Errores

Los del gateway (`Ai.Disabled`, `Ai.TaskNotConfigured`, `Ai.BudgetExceeded`,
`Ai.ProviderAuth`, `Ai.Failed`…) vuelven tal cual. Los propios están en
`QuestionDraftErrors.cs`:

| Código | HTTP | Cuándo |
|---|---|---|
| `Ai.DraftNotFound` | 404 | La consulta, el pack, la conversación o el mensaje no existen en esta tienda (o ML contestó 403 o 404) |
| `Ai.AlreadyAnswered` | 409 | La pregunta de ML ya está respondida |
| `Ai.NothingToAnswer` | 400 | El hilo no tiene un mensaje del comprador para contestar |
| `Ai.EmptyDraft` | 503 | El modelo contestó sin texto; se puede reintentar |
| `Ai.MeliUnavailable` | 503 | ML no respondió, o respondió algo ilegible (red, timeout, 5xx) |
| `Meli.NotConnected` | 409 | La tienda no tiene cuenta de ML conectada, o ML rechazó el acceso (401) y hay que volver a conectarla. Es el mismo error de las pantallas de ML |

### Probarlo con una clave real (pendiente)

Ningún test llama a un proveedor ni a ML reales. Para probarlo de punta a
punta: con la API de dev, `POST /dev/demo-seed`, cargar una clave de prueba en
Configuración → Inteligencia artificial y asignar `QuestionClassify` y
`QuestionDraft`; en las preguntas de Mercado Libre tocar el destello de una
pregunta. Tiene que llegar el texto o "Respondé a mano", y en el consumo del
mes tiene que aparecer una fila por llamada al modelo: una de clasificar y de
una a tres de redactar (ver [Pasos](#pasos)).

## Asistente de datos

"Preguntale a tu tienda": una pregunta en lenguaje común sobre las ventas, el
stock, las compras o los clientes de la tienda. El botón está en Inicio y en las
pantallas de Estadísticas (`AskStoreButton`) y abre un panel lateral. Código en
`backend/src/Api/Ai/Assistant/`, panel en `admin/src/components/ai/AskStore*.tsx`.
La tarea es `DataAssistant` (modelo con herramientas, hasta 6 llamadas al modelo,
1.500 tokens de salida, 60 s) y exige `stats.read`.

### Cómo responde

`POST /api/v1/ai/assistant` con `{ question, history: [{ question, answer }] }`
devuelve `{ answer, sources, limited }`. Pasa por el gateway como cualquier
tarea (tope mensual, cupo por usuario, respaldo, una pregunta a la vez por
usuario con `Ai.Busy`). El modelo recibe un prompt de sistema constante, la
pregunta con la fecha de hoy y las herramientas que **esa persona** puede usar;
las pide, el servidor las ejecuta contra la base y el modelo redacta con lo que
volvió. La respuesta es el texto del **último** mensaje del asistente: lo que dice
antes de llamar a una herramienta no se muestra. Si se acaban las vueltas o el
modelo sigue pidiendo herramientas, vuelve `limited: true` con un texto fijo en
vez de un error. Los errores del gateway (`Ai.Disabled`, `Ai.BudgetExceeded`,
`Ai.Busy`, `Ai.TimedOut`, `Ai.Failed`…) pasan tal cual. No hay streaming.

### Las ocho herramientas

Todas de **solo lectura**, en este orden (es estable: entra en la clave del caché
de prompts). La tienda no es parámetro de ninguna: sale del request y se pasa
explícita a cada consulta.

| Herramienta | Permiso | Qué trae |
|---|---|---|
| `resumen_ventas` | `stats.read` | Órdenes, facturación, ticket, comparación con el período anterior, Mercado Libre, clientes nuevos, origen (≤ 6) y productos principales (≤ 5) |
| `productos_mas_vendidos` | `stats.read` | Por unidades y por facturación (límite ≤ 20), y cuántos publicados no vendieron (muestra ≤ 10) |
| `carritos_abandonados` | `orders.read` | Cantidad, recuperables y valor; sin mails |
| `rentabilidad` | `costs.read` | Ganancia real, margen, comparación, mejores 10 y 5 de menor margen, canal ML |
| `stock_bajo` | `inventory.read` | Variantes bajas (límite ≤ 50) con cobertura y cantidad sugerida; sin valorización a costo |
| `sugerencias_de_reposicion` | `purchasing.manage` | Lo que se agota antes de que llegue el próximo pedido (límite ≤ 50) |
| `ordenes_de_compra` | `purchasing.manage` | Por estado (límite ≤ 20), abiertas, en tránsito y FOB comprometido; sin CUIT |
| `resumen_clientes` | `customers.read` | Solo cantidades y gasto promedio |

Las fechas se leen como `StatsPeriod` (días de Argentina, hasta 366: si piden más
se acota y el resultado trae `clamped`). Un argumento malo (fecha o estado)
vuelve como `{ error }` al modelo, sin tocar los datos. Los montos van crudos
(centavos) **y** formateados (`text`, con `ArgentineNumbers`), y el prompt le
pide al modelo usar el texto. Las consultas son las mismas que usan las pantallas
del panel (`Api/Stats/*Query.cs`, `PurchaseOrderQueries`, `CustomerSummaryQuery`),
así que el asistente y la pantalla no discuten.

### Sin datos personales

Ningún resultado lleva mail, teléfono, DNI/CUIT, dirección ni nombre de
compradores. Sí nombres de productos y de proveedores. Un test de integración
(`Ninguna_herramienta_devuelve_datos_personales`) pide las ocho herramientas y
verifica que no aparezcan. Lo que devuelven las herramientas y la pregunta se
tratan como datos, no como instrucciones (el prompt lo dice); como el modelo no
puede escribir nada, lo peor que logra una inyección es una respuesta rara.

### Historial y límites

El historial vive solo en el navegador (`sessionStorage`, por tienda, se borra al
cerrar la pestaña). El panel manda las últimas 4 vueltas, hasta 4.000
caracteres, y el servidor las recorta de nuevo. La pregunta tiene hasta 1.000
caracteres. Las herramientas juntas pueden devolver hasta 24.000 caracteres por
corrida: pasado eso devuelven un error fijo y el modelo responde con lo que
tiene. Ese tope entra en la estimación de entrada que reserva el gateway. Ni la
pregunta ni la respuesta se guardan ni se loguean (solo el consumo).

Costo de referencia (spec): 5 a 15 centavos de dólar por pregunta con un modelo
medio.

## Fichas del catálogo en lote

"Mejorar con IA", en Productos: la persona elige hasta **500 productos** (a mano o con un
filtro) y un worker redacta, para cada uno, la descripción, el título y la descripción SEO y
**los atributos reales de su categoría de Mercado Libre**; los pasa por un gate determinista y
por un evaluador de otro proveedor (máximo 2 intentos) y deja todo para revisar. Aprobar guarda
en la tienda y en las tablas de ML; mandarlo a una publicación es otro clic. Código en
`backend/src/Api/Ai/Catalog/`, lectura y escritura de ML en `backend/src/Api/Meli/`
(`MeliCatalogReader`, `MeliCategoryResolver`, `MeliTenantGate`, `MeliListingAttributesPush`),
panel en `admin/src/pages/Products/AiCatalog*.tsx`. Las tareas son `CatalogWrite` (redacta) y
`CatalogJudge` (evalúa), ambas con JSON y **sin herramientas**, y piden `catalog.write`.

### Cómo se elige y qué cuesta

- `POST /ai/catalog/jobs/preview` cuenta los productos, estima el costo y dice cuánto queda del
  tope del mes; recién al confirmar (`POST /ai/catalog/jobs`) se crea el trabajo. Los ids de otra
  tienda se descartan en silencio; más de 500 es un 400. El filtro tiene tres casillas que se
  suman (sin descripción, descripción de menos de 300 caracteres, sin datos de ML guardados) y
  una categoría que incluye sus subcategorías; sin ninguna condición es un 400. "Sin datos de ML"
  significa sin categoría ni atributos guardados: saber qué atributos le faltan a cada producto
  exigiría llamar a ML por producto, que es justo lo que hace el trabajo.
- **Costo estimado**: 2.500 tokens de entrada y 700 de salida del redactor más 2.000 y 250 del
  evaluador por producto, más un 10 % de reintentos (`AiCatalogEstimate`). Con Sonnet 5.5 y
  Haiku 5.5 son 13.558 micro-dólares por producto, unos US$ 13,6 cada mil. Siempre se muestra como
  estimado; el costo real sale del consumo, corrida por corrida.
- No se puede crear sin IA lista (redactor **y** evaluador) ni sin una cuenta de Mercado Libre
  **real** conectada (la de demostración no cuenta); hay un solo trabajo activo por tienda (409) y
  el arranque cuenta en el cupo de 5 por hora por tienda.

### Qué se manda al modelo y qué no

Solo datos del producto: nombre, descripción, marca, SKU, códigos de barras, opciones de
variantes, ficha técnica, categorías de la tienda y los atributos de ML ya guardados, en un
mensaje delimitado (`<datos_del_producto>`) donde el producto no puede abrir ni cerrar
etiquetas. **Nunca precios, costos, stock ni datos de personas**: el record que arma el prompt
(`AiCatalogProductData`) no tiene dónde ponerlos. El system prompt de cada tarea es constante
(el proveedor lo cachea). Solo se le piden los atributos **que faltan**: los que ya tienen valor
(spec mapeada que aplica al producto, atributo guardado, `BRAND` si hay marca) van como dato y no
se pisan; `SELLER_SKU` nunca se pide. De la categoría se piden los obligatorios y los que mejoran
la publicación, hasta 40, con su tipo, sus valores permitidos (60 en el prompt) y sus unidades.

### Los pasos de cada producto

1. **Categoría de ML**, sin IA: la guardada (`MeliProductCategory`); si no, la de una publicación
   vinculada (`GET /items/bulk`, campo `category_id`); si no, la predicción
   (`domain_discovery`). Si la predicción trae categorías con nombres distintos el ítem queda en
   **"Elegí la categoría"** y no se gasta IA hasta que una persona la elija en la revisión.
2. **Atributos de la categoría**: `GET /categories/{id}/attributes`, una llamada a la vez por
   tienda y cacheada 24 h por categoría (datos públicos, iguales para todas).
3. **Redactar** (`CatalogWrite`): un valor por atributo o `falta_dato`.
4. **Gate** (`AiCatalogGate`, funciones puras): largos (descripción 200 a 3.000, título SEO hasta
   60, descripción SEO 70 a 160), sin precios, links ni mails, solo atributos de la lista, valores
   de lista permitidos, números con unidad válida. **Un identificador (GTIN/EAN, modelo, número de
   parte) solo vale si aparece textual en los datos del producto y, para GTIN, con dígito
   verificador válido; si no, queda `falta_dato` y se avisa, no se inventa.** Un gate que falla no
   gasta evaluador.
5. **Evaluar** (`CatalogJudge`, conviene que sea de otro proveedor; la pantalla de configuración
   avisa si no): `inventa_datos`, tono y voseo, claridad, atributos, puntaje de 1 a 5 y motivos.
   Pasa con puntaje 4 o más y sin datos inventados; si no pasa y hubo menos de 2 redacciones,
   vuelve a redactar con los motivos como crítica. Después de 2 queda para revisar con las notas.

### El worker

`AiCatalogWorker` (cada 5 s, ver [arquitectura.md](../arquitectura.md#workers)): un trabajo por
tienda, hasta 3 productos en paralelo, cada uno en su propio scope con la tienda del ítem fijada.
Reclama cada ítem con un UPDATE condicional sobre su fila (vence a los 10 minutos) y **guarda el
estado al terminar cada paso**: si la API se reinicia a mitad de un producto, retoma en el
evaluador sin volver a pagar la redacción.

- **Tope**: antes de reclamar se exige libre el peor caso de un ítem (dos redacciones y dos
  evaluaciones). Si no entra, el trabajo queda **pausado por presupuesto** y ningún ítem falla por
  eso; se reanuda a mano (`POST /jobs/{id}/resume`, que se rechaza si sigue sin entrar).
- **Pausa por falta de IA o de ML**: sin redactor o evaluador, apagada, clave inválida o cuenta de ML
  desconectada, el trabajo se pausa (`PausedUnavailable`) con el motivo.
- **Mercado Libre**: las llamadas de una tienda van de a una (`MeliTenantGate`). Ante un 429 se espera
  1, 2, 4, 8 y 16 segundos dentro del mismo turno; si sigue limitando el ítem se suelta **sin sumar
  intento ni falla** y se retoma en otra pasada.
- **Fallas**: una falla pasajera de la IA o de ML suma una en el ítem y a la tercera el ítem falla;
  un rechazo del proveedor falla el ítem de una; un producto borrado también.
- **Costo real**: cada corrida suma al trabajo lo que dice el libro de consumo.

### La revisión

`/productos/fichas-ia` lista los trabajos y `/productos/fichas-ia/:jobId` es la revisión:
lo actual al lado de lo propuesto (leído al pedir), a dónde va cada dato (la ficha de la tienda o
solo ML) y **lo que le falta a la ficha para ML**, editable ahí mismo con los valores permitidos.

- **Aprobar** (`POST /ai/catalog/items/{id}/approve`, con lo editado si hay): valida contra los
  atributos que se pidieron al armar la ficha (un GTIN con dígito verificador inválido o un valor
  fuera de la lista es un 400 y la ficha sigue en revisión), guarda descripción y SEO con
  `UpdateProductHandler` pasándole **el nombre y la marca actuales** (el handler pisa la marca si
  llega vacía), suma las specs nuevas a las que ya tenía el producto (`SetSpecs` reemplaza la
  ficha entera) y deja la categoría y lo que es solo de ML (`GTIN`, "Es kit"…) en
  `meli_product_categories` y `meli_product_attributes`, no en la ficha que ve el comprador. Una
  spec de lista solo recibe un valor que sea una de sus opciones; si no, va a ML. **Aprobar no hace
  ningún pedido a Mercado Libre** y es idempotente si algo falla a mitad.
- **Aprobar todos los que pasaron**: de a uno, sin cambios; el que falla se informa y el resto sigue.
- **Elegí la categoría**: las sugerencias de la predicción o una búsqueda (`GET
  /ai/catalog/categories/search`); elegir una valida que exista en ML, devuelve el ítem a la
  cola y el worker no la vuelve a adivinar.
- **Descartar** no guarda nada.

### Actualizar la publicación en ML

Es la **única escritura hacia Mercado Libre** y tiene su propio clic y su propio permiso
(`meli.publish`, además de `catalog.write`): `POST /ai/catalog/items/{id}/push-to-meli` y
`POST /ai/catalog/jobs/{id}/push-to-meli` (por tramos con `after`/`next`, 20 por defecto y 50 como
máximo, para que ningún pedido dure minutos). Manda un `PUT /items/{id}` por publicación con solo
los atributos: ni la categoría, que ML no deja cambiar con ventas, ni el `SELLER_SKU`. Con la cuenta
de demostración o sin conexión da 409 sin salir. Al **publicar** un producto nuevo, el payload suma
los atributos guardados (lo que la tienda ya tiene manda) y el modal de publicar trae preelegida la
categoría guardada.

### Probar las fichas con una clave real (pendiente)

Ningún test llama a un proveedor ni a ML reales. Para probarlo de punta a punta: una cuenta de ML
real conectada, claves de dos proveedores, `CatalogWrite` y `CatalogJudge` asignadas (de proveedores
distintos), y un tope de unos US$ 1 para mirar el consumo de 3 o 4 productos. Mirar en la revisión
que el GTIN quede en "Le falta" cuando no está en el producto, que un modelo o código inventado no
llegue a ninguna propuesta, y que aprobar no cambie nada en ML. Después, **con una publicación de
prueba**, "Actualizar la ficha en ML": falta confirmar si el `PUT` de `attributes` de ML cambia solo
los ids enviados (lo que sugieren los ejemplos de su documentación) o reemplaza la lista entera.

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
- Borradores de la bandeja, uno por canal (ver [Bandeja de preguntas](#bandeja-de-preguntas)):
  `POST /ai/ml/questions/{id}/draft` y `POST /ai/ml/messages/{packId}/draft`
  (ambos `meli.operate`), `POST /ai/support/conversations/{id}/draft`
  (`support.chat`) y `POST /ai/contact/{id}/draft` (`messages.read`). Sin
  cuerpo: mandan solo el id. Reemplazan a las rutas viejas de respuesta
  sugerida, que se borraron porque recibían el texto del navegador.
- `POST /ai/assistant` (`stats.read`): el asistente de datos, ver
  [Asistente de datos](#asistente-de-datos).
- Fichas en lote, todo bajo `/ai/catalog` y con `catalog.write` (ver
  [Fichas del catálogo en lote](#fichas-del-catálogo-en-lote)):
  `POST /jobs/preview`, `POST /jobs` (con el cupo de 5 por hora por tienda), `GET /jobs`,
  `GET /jobs/{id}`, `POST /jobs/{id}/resume`, `POST /jobs/{id}/cancel`,
  `GET /jobs/{id}/items?status=&offset=&limit=`, `POST /items/{id}/approve`,
  `POST /items/{id}/discard`, `POST /jobs/{id}/approve-passed`, `PUT /items/{id}/category`,
  `GET /categories/search?q=`. Los dos de actualizar la publicación en ML,
  `POST /items/{id}/push-to-meli` y `POST /jobs/{id}/push-to-meli`, piden además `meli.publish`.
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
- Las funciones A (bandeja de preguntas), B (asistente de datos) y C (fichas en
  lote) del diseño están hechas. La D (facturas encadenadas) tiene su propio plan
  en `historial/plan-ia-d-*.md`; esta base ya trae la tarea, los permisos y el tope
  que usa.
- Probar las fichas en lote con una clave real y una cuenta de ML real (ver
  [Probar las fichas con una clave real](#probar-las-fichas-con-una-clave-real-pendiente)) y
  confirmar el comportamiento del `PUT` de atributos de ML con una publicación de prueba.
- Sin una cuenta de ML conectada no hay fichas en lote (la spec pide los atributos reales de
  la categoría). Un modo "solo descripción y SEO" para tiendas sin ML queda para después, si se pide.
- Probar el asistente de datos con una clave real: con un usuario `vendedor`,
  "¿cuánto gané este mes?" tiene que contestar que no puede ver la rentabilidad;
  con el dueño, la cifra tiene que coincidir con Estadísticas → Rentabilidad del
  mismo período. Hoy solo corrió con proveedores simulados.
- Probar un borrador de la bandeja con una clave real (ver el final de
  [Bandeja de preguntas](#bandeja-de-preguntas)): hoy solo corrió con
  proveedores simulados.
- Actualizar los precios del catálogo cuando un proveedor los cambie (el
  próximo: Gemini 3.8 Flash, 1-ene-2027).
