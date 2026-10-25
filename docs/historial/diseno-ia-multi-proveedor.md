# Diseño: IA con varios proveedores, presupuesto y cuatro funciones nuevas

Estado: **aprobado** el 25-oct-2026. Todavía no está construido.

## Por qué

Hoy la IA del panel es una sola llamada a Claude por botón ("Sugerir" en
preguntas de ML, chat posventa, posts y descripciones; más la lectura de
facturas). Funciona, pero:

- no se sabe cuánto se gasta ni hay forma de cortarlo;
- `/ai/*` no tiene rate limit;
- la clave es de plataforma, va por variable de entorno y solo sirve Claude;
- nada aprovecha patrones agénticos donde sí rinden (clasificar, usar
  herramientas, evaluar con otro modelo, encadenar pasos con validaciones).

Este diseño arma una **base única** por la que pasa todo uso de IA (claves por
tienda, varios proveedores, modelo por tarea, consumo y tope) y sobre ella
**cuatro funciones**: bandeja de preguntas (A), asistente de datos (B), fichas
en lote (C) y lectura de facturas encadenada (D).

## Objetivos

1. Cada tienda carga sus claves de Anthropic, OpenAI, Google y/o Groq desde el
   panel, elige un modelo por tarea (con uno de respaldo) y puede copiar esa
   configuración a sus otras tiendas.
2. Todo uso de IA queda registrado y tiene un tope mensual por tienda que lo
   corta solo. El panel muestra el gasto estimado del mes, por tienda y
   consolidado de todas las tiendas del dueño.
3. Ninguna ejecución puede quedar en un bucle ni gastar más que su propio tope.
4. Un prompt injection exitoso no puede hacer daño: la IA no escribe nada por
   su cuenta y solo ve datos de la tienda y del permiso de quien la usa.
5. Las cuatro funciones nuevas, con los patrones del curso donde mejoran el
   resultado medible.

## No objetivos (v1)

- Chat de la IA para compradores en la tienda pública.
- Que la IA ejecute acciones (responder en ML, cambiar precios, publicar,
  guardar fichas) sin que una persona confirme.
- Batch API, CodeAct, Orchestrator-Workers, Group Chat.
- Ollama u otros modelos locales en producción (el VPS no tiene GPU y comparte
  máquina con cking/ckinsight). Puede quedar para desarrollo más adelante.
- Un nivel "empresa" por encima de las tiendas.
- Modelos fuera del catálogo (ids cargados a mano).
- Respuestas en streaming.

## Anti-objetivos (si pasa esto, falló aunque "ande")

- Una clave vuelve a verse completa en el panel, en un log o en un prompt.
- Una tienda ve datos de otra a través de la IA.
- El gasto de un mes supera el tope por más que el costo de una ejecución.
- Algo sale hacia Mercado Libre, un cliente o la tienda sin un clic humano.
- Una función deja de andar en silencio: si la IA no está disponible, el
  botón explica por qué y el camino manual sigue ahí.

---

## Parte 0 — La base

### Dónde vive cada cosa

Respeta la regla de `AGENTS.md`: orquestación en `Api/`, persistencia en un
módulo.

| Pieza | Dónde |
|---|---|
| Tablas (credenciales, asignaciones, presupuesto, consumo, trabajos de C) | **Módulo nuevo `Modules/Ai`** (`Ai.Core`, `Ai.Infrastructure`, `Ai.Contracts`), siguiendo [guias/agregar-un-modulo.md](../guias/agregar-un-modulo.md); plantilla: `Modules/Reviews` |
| Gateway, proveedores, catálogo de modelos, herramientas y las funciones A–D | `backend/src/Api/Ai/` (cruza módulos: es orquestación) |
| Pantalla de configuración y consumo | `admin/src/pages/Settings/Ai*.tsx` |

`Modules/Ai` lleva su `DbContext` con filtro por tienda escrito a mano como el
resto (`CheckoutDbContext.cs:114`), entra en `DatabaseMigrator.cs` y lo
verifican los tests de arquitectura existentes (`TenantQueryFilterTests`,
`ModuleBoundariesTests`).

**Todas las migraciones de este diseño salen en la Parte 0**, incluidas las
tablas de C (las de `Modules/Ai` y las dos nuevas de `Modules/MercadoLibre`,
ver C): así A–D pueden construirse en paralelo sin pisarse el snapshot de EF.

### Cómo se habla con los proveedores

Una sola abstracción: **Microsoft.Extensions.AI** (`IChatClient`, paquete
`Microsoft.Extensions.AI` 10.11.x). Adaptador por proveedor (versiones
verificadas el 25-oct-2026):

| Proveedor | Paquete | Cómo se crea el cliente | URL |
|---|---|---|---|
| Anthropic | `Anthropic` 13.3.x (SDK oficial) | `AsIChatClient(model, maxTokens, …)` del SDK | la del SDK |
| OpenAI | `OpenAI` 2.14.x + `Microsoft.Extensions.AI.OpenAI` 10.11.x | `ChatClient.AsIChatClient()` (Chat Completions, no Responses) | la del SDK |
| Groq | los mismos de OpenAI | `OpenAIClientOptions.Endpoint` fijo | `https://api.groq.com/openai/v1` |
| Google | `Google.GenAI` 1.27.x | `new Client(apiKey).AsIChatClient(model)` | la del SDK |

Reglas:

- **Las URL son constantes en el código.** No hay campo para cargar una URL:
  sería la forma de mandar la clave a un servidor ajeno.
- `ChatMessage.AuthorName` nunca se setea (Groq devuelve 400 con `name`).
- `AiClient.cs` (HTTP directo a Anthropic) se reemplaza por esto y se borra.
- La variable `Ai__ApiKey`/`AI_API_KEY` deja de existir: después del deploy la
  IA queda apagada en cada tienda hasta que el dueño cargue una clave en
  Configuración → Inteligencia artificial. Se avisa en
  [despliegue.md](../despliegue.md) y en `docker-compose.stack.yml` se borran
  `Ai__ApiKey` y `Ai__Model`.

### Catálogo de modelos

Lista **en código** (`Api/Ai/AiModelCatalog.cs`), no editable desde el panel:
no existe un panel de plataforma y una tabla editable por tienda daría precios
distintos para el mismo modelo. Cambiar un precio o sumar un modelo es un
commit, con la fecha de la última verificación arriba del archivo.

Cada entrada: proveedor, id, nombre para mostrar, capacidades, precios.

| Capacidad | Qué significa |
|---|---|
| `Tools` | llama herramientas de forma confiable |
| `Json` | respeta un esquema JSON en la respuesta |
| `JsonWithTools` | lo anterior **en la misma llamada** que usa herramientas (Groq no) |
| `Pdf` | lee PDF |
| `Image` | lee imágenes |

Precios en **micro-dólares por millón de tokens** (`long`): entrada, entrada en
caché, salida. Semilla inicial (USD por millón, entrada/salida, verificados el
25-oct-2026; el builder vuelve a confirmar contra las páginas de precios y
completa los de caché que falten):

| Modelo | Entrada / salida | Capacidades |
|---|---|---|
| `claude-haiku-5-5` | 0,10 / 0,50 | Tools, Json, JsonWithTools, Pdf, Image |
| `claude-sonnet-5-5` | 2,00 / 10,00 (caché 0,20) | ídem |
| `claude-opus-5-5` | 4,00 / 20,00 (caché 0,20) | ídem |
| `gpt-6-luna` | 0,10 / 0,50 (caché 0,01) | ídem (confirmar Pdf) |
| `gpt-6.1-sol` | 2,00 / 10,00 (caché 0,10) | ídem (confirmar Pdf) |
| `gemini-3.1-flash-lite` | 0,25 / 1,50 | ídem |
| `gemini-3.8-flash` | 0,75 / 3,75 (**sube a 1,50 / 7,50 el 1-ene-2027**) | ídem |
| `openai/gpt-oss-20b` (Groq) | 0,075 / 0,30 | Tools, Json |
| `openai/gpt-oss-120b` (Groq) | 0,15 / 0,60 | Tools, Json |
| `qwen/qwen3.8-27b` (Groq) | 0,80 / 4,00 | Tools, Json, Image |

Los modelos de Claude se usan sin `temperature` (desde el 21-oct-2026 la API
la rechaza) y con el `effort` que diga cada tarea.

### Tareas y requisitos

Una tarea es lo que se le asigna a un modelo. El panel solo ofrece, para cada
tarea, los modelos cuyo proveedor tiene clave cargada y que cumplen los
requisitos.

| Tarea (`AiTask`) | Función | Requisitos | Sugerido |
|---|---|---|---|
| `QuestionClassify` | A: clasificar | Json | barato y rápido (Groq gpt-oss-20b, Haiku) |
| `QuestionDraft` | A: redactar respuesta | Tools | medio (Sonnet, gpt-6.1-sol) |
| `DataAssistant` | B | Tools | medio |
| `CatalogWrite` | C: redactar ficha | Json | medio |
| `CatalogJudge` | C: evaluar ficha | Json | barato **de otro proveedor** que `CatalogWrite` (el panel avisa si es el mismo) |
| `InvoiceRead` | D | Json, Pdf, Image | medio |
| `ShortText` | posts y descripción suelta (los botones de hoy) | — | barato |

Cada asignación tiene **principal** y **respaldo** (opcional, idealmente de
otro proveedor). Una tarea sin principal = la función no aparece, igual que
hoy sin clave. "Usar recomendados" completa todo con lo sugerido entre los
proveedores cargados.

### El gateway (`Api/Ai/AiGateway.cs`)

Única puerta. Toda función pide `IAiGateway.RunAsync(task, …)` y nunca crea un
cliente por su cuenta. En orden:

1. **Interruptor global**: `Ai__Disabled=true` en el entorno apaga toda la IA
   de la plataforma (palanca de emergencia, sin deploy de código).
2. **Interruptor de la tienda** (en el panel).
3. **Tope del mes, con reserva**: consumo del mes calendario (hora Argentina,
   `ArgentinaTime`) **más lo reservado por las ejecuciones en curso**, contra el
   tope. Cada ejecución reserva antes de empezar su peor caso (vueltas máx. ×
   (entrada estimada + salida máx.) × precio del modelo) y al terminar libera
   la reserva y queda el costo real. Si la reserva no entra,
   `Ai.BudgetExceeded`. La reserva vive en memoria (una sola instancia de API),
   por tienda y con lock: así ejecuciones simultáneas no pasan juntas el
   chequeo.
4. **Rate limit y concurrencia** (ver abajo).
5. Resuelve la asignación de la tarea, descifra la clave y arma el
   `IChatClient` envuelto así:
   - **medidor** (`DelegatingChatClient`): cada respuesta del proveedor,
     incluida cada vuelta del bucle de herramientas, escribe una fila de
     consumo con `UsageDetails` (entrada, entrada en caché, salida) y el costo
     calculado con el catálogo **en ese momento** (el histórico no cambia si
     después cambia un precio);
   - **bucle de herramientas** (`FunctionInvokingChatClient`) solo si la tarea
     usa herramientas, con `MaximumIterationsPerRequest` y
     `MaximumConsecutiveErrorsPerRequest` de la tarea.
6. **Límites de la ejecución** (Termination): tope de vueltas, tope de tokens
   de salida y tiempo máximo, todos por tarea (tabla abajo). Al vencerse
   cualquiera, la ejecución termina con lo que haya y un aviso, nunca con un 500.
7. **Respaldo** (Fallback): si el principal falla por 429, 5xx, timeout o red,
   se reintenta **una vez** con el respaldo. Un 400/401 no pasa al respaldo
   (es configuración, no caída) y se muestra tal cual en el panel ("la clave
   de OpenAI no es válida").
8. **Corte por fallas** (Circuit Breaker, en memoria): 3 fallas seguidas de un
   proveedor en una tienda lo dan por caído 5 minutos; mientras tanto se va
   directo al respaldo.

Con la reserva, el tope solo se pasa si la estimación de entrada de una
ejecución se queda corta; por eso cada tarea tiene tope de vueltas y de tokens
de salida, y la entrada se estima por lo alto (largo del prompt / 3).

| Tarea | Vueltas máx. | Salida máx. | Tiempo máx. |
|---|---|---|---|
| `QuestionClassify` | 1 | 200 | 10 s |
| `QuestionDraft` | 3 | 600 | 30 s |
| `DataAssistant` | 6 | 1.500 | 60 s |
| `CatalogWrite` | 1 | 1.500 | 60 s |
| `CatalogJudge` | 1 | 400 | 30 s |
| `InvoiceRead` | 1 | 4.000 | 120 s |
| `ShortText` | 1 | 600 | 30 s |

**Rate limit** — política nueva `ai`, **por usuario** (las de hoy son por IP:
hace falta un helper nuevo al lado de `PerIpPerPath` en
`ServiceRegistration.cs:250`): 30 pedidos cada 5 minutos. El arranque de un
trabajo de C: 5 por hora por tienda. **Concurrencia**: una ejecución de B a la
vez por usuario y un trabajo de C a la vez por tienda (en memoria: la API corre
en una sola instancia).

**Caché de prompts**: el system prompt y las herramientas de cada tarea son
constantes (nada de fechas ni ids adentro) y van primero. En Anthropic se
marca con `WithCacheControl`; OpenAI y Google cachean solos.

### Claves

- Tabla `AiProviderCredential` (tienda, proveedor, clave cifrada, últimos 4
  caracteres, fecha de la última prueba y su resultado).
- Cifrado con DataProtection, purpose **`Tiendafy.Ai.Keys.v1`**, en
  `Ai.Infrastructure/Security/AiKeyProtector.cs`. **Nunca se cambia** (regla de
  `AGENTS.md`; se suma a la lista de ejemplos de ahí).
- La API nunca devuelve la clave: solo `{ provider, configured, last4,
  lastTestOk, lastTestAt }`. Igual que Correo (`CorreoArgentinoEndpoints.cs:497`):
  un PUT con la clave vacía conserva la guardada.
- "Probar conexión" hace la llamada más barata posible (un mensaje de pocos
  tokens al modelo más barato del catálogo de ese proveedor) y la registra
  como consumo de la tarea `ShortText`.
- La clave no va a logs, ni a Sentry, ni a ningún prompt.

### Presupuesto y consumo

- `AiSettings` por tienda: interruptor, tope mensual (micro-dólares), umbral de
  aviso (80 % por defecto).
- **Sin tope no se habilita la IA**: el primer guardado lo pide, sugiriendo
  US$ 20.
- `AiUsage`: tienda, usuario, tarea, proveedor, modelo, ejecución, tokens
  (entrada, entrada en caché, salida), costo (micro-USD), resultado
  (ok / error / respaldo / cortado por límite), fecha. **Sin prompts ni
  respuestas** (privacidad y tamaño).
- Moneda: **dólares**, que es como facturan los proveedores. Todo dice
  "estimado"; la factura real es la del proveedor.
- Aviso en Inicio (`AvisosCard`, `/home/todo`) al 80 % y al 100 %. No hay
  centro de notificaciones y no se manda mail en v1.
- La pantalla recomienda poner también un límite en la consola de cada
  proveedor.

### Pantalla: Configuración → Inteligencia artificial

Se registra en los tres lugares de siempre (`App.tsx:146` `SETTINGS_ROUTES`,
`lib/access.ts:65`, `config/navigation.tsx:312`). Secciones:

1. **Proveedores**: una tarjeta por proveedor (estado, `…a1b2`,
   cargar/reemplazar/borrar, probar).
2. **Modelos por tarea**: principal y respaldo, filtrados por capacidad;
   "Usar recomendados"; aviso si `CatalogJudge` y `CatalogWrite` son del mismo
   proveedor.
3. **Presupuesto**: interruptor, tope, umbral.
4. **Consumo del mes**: gastado contra tope, por día (`BarChart`), por tarea,
   por modelo y por persona (`RankBars`). Selector "esta tienda / todas mis
   tiendas": la vista consolidada suma las tiendas que devuelve
   `MembershipService.OwnedTenantIdsAsync`. Es la única lectura que cruza
   tiendas, y solo sobre tiendas propias del que mira.
5. **Copiar a mis otras tiendas**: el dueño elige destinos (solo tiendas donde
   es dueño) y qué copiar (claves, modelos, presupuesto). Confirmación
   explícita, porque pisa la configuración de destino. Las claves se descifran
   y se vuelven a cifrar con el mismo purpose.

### Permisos

- Nuevo `AiConfig` al **final** del enum (`Permissions.cs`, ver el comentario):
  `OwnerOnly`, `Sensitive`. Cubre la pantalla entera, incluido el consumo.
- Usar cada función pide los permisos que ya existen: `MeliOperate` y
  `SupportChat` (A), `StatsRead` y los de cada herramienta (B), `CatalogWrite`
  (C), `PurchasingManage` (D), `SocialPublish` y `CatalogWrite` (`ShortText`).
- `GET /ai/status` pasa a devolver qué tareas están disponibles para esta
  tienda y este usuario. `useAiEnabled` se convierte en `useAiTask(task)`.

### Seguridad contra prompt injection

La defensa no es "que el modelo no se deje engañar", sino que **un engaño
exitoso no tenga nada dañino para hacer**:

| Amenaza | Mitigación |
|---|---|
| El texto de un comprador, una ficha o una factura trae instrucciones | Va delimitado como dato (`<pregunta_del_comprador>…</…>`) y el system prompt dice que es contenido, no órdenes. Pero lo que protege de verdad son las filas siguientes. |
| El modelo "decide" hacer algo | **No existe ninguna herramienta que escriba.** Todas son de lectura; toda escritura pasa por los endpoints de siempre, con un clic humano. |
| Leer datos de otra tienda | Ninguna herramienta recibe la tienda como parámetro: sale de `ITenantContext` y de los filtros de EF. |
| Leer más de lo que el usuario puede ver | Las herramientas de B se filtran por los permisos de quien pregunta **antes** de dárselas al modelo. |
| Sacar datos hacia afuera | Ninguna herramienta abre URLs ni manda mensajes. La respuesta vuelve solo a quien preguntó. |
| Datos personales en manos de terceros | Lo que **arma nuestro código** (herramientas, contexto) no lleva mail, teléfono, DNI/CUIT de personas ni dirección: alcanza con nombre de pila o un id. El texto libre de compradores pasa por el redactor de A. **Excepción explícita: D** manda la factura entera, porque los datos de un proveedor son de una empresa, no de una persona. |
| Respuesta inaceptable hacia afuera (A) | Guardrails deterministas fuera del modelo (ver A). |
| Cuelgue o bucle | Límites por tarea, tope mensual, rate limit, corte por fallas. |

---

## Parte A — Bandeja de preguntas de ML y del chat posventa

**Patrones**: Router & Specialist, Tool Use, Guardrails, Human-in-the-loop.

Reemplaza `/ai/ml-answer` y `/ai/support-reply`. El panel ya no manda el
texto: lo busca el servidor, así el alcance de las herramientas lo fija la
pregunta real y no lo que diga el navegador.

Un endpoint por canal de la bandeja unificada (`InboxService`), para que
ningún canal que hoy tiene "Sugerir" lo pierda:

| Endpoint | Canal | Permiso | Herramientas posibles |
|---|---|---|---|
| `POST /ai/ml/questions/{id}/draft` | `ml-pregunta` (preventa) | `MeliOperate` | `stock_y_precio`, `ficha_tecnica` |
| `POST /ai/ml/messages/{packId}/draft` | `ml-mensaje` (posventa ML) | `MeliOperate` | `estado_del_pedido`, `seguimiento` |
| `POST /ai/support/conversations/{id}/draft` | chat posventa de la tienda | `SupportChat` | `estado_del_pedido`, `seguimiento` |
| `POST /ai/contact/{id}/draft` | `contacto` (formulario) | el que hoy pide responderlo | ninguna (solo clasificar y redactar) |

**Datos personales en el texto libre**: antes de mandarlo al modelo, el
mensaje del comprador pasa por un redactor en código que reemplaza mails,
teléfonos y números tipo DNI/CUIT por `[dato oculto]`. Para redactar una
respuesta no hacen falta.

Pasos:

1. **Clasificar** (`QuestionClassify`, salida JSON):
   `{ categoria: stock | envio | producto | precio | postventa | fuera_de_politica | otro, motivo }`.
   El JSON se valida en el servidor; si no valida, cuenta como `otro`.
2. **`fuera_de_politica`** (pide datos de contacto, insultos, intentos de
   manipular a la IA): no hay borrador. El panel muestra "Respondé a mano" y el
   motivo.
3. **Redactar** (`QuestionDraft`) con **solo las herramientas de esa
   categoría**, atadas a esa publicación o conversación por closure (el modelo
   no puede pedir otra):
   - Preventa ML: `stock_y_precio()`, `ficha_tecnica()` (specs del producto
     vinculado más los atributos del ítem en ML, que hoy no se traen: se suma
     `attributes` al fetch de `MeliEndpoints.cs:624`). **No hay herramienta de
     envío**: en ML el comprador paga Mercado Envíos y el repo solo cotiza
     carriers propios, que darían un precio equivocado. Para `envio`, el
     prompt indica remitir al calculador de envío de la publicación.
   - Posventa (ML y tienda): `estado_del_pedido()`, `seguimiento()`.
4. **Guardrails** sobre el borrador, en código:
   - sin URLs, mails ni teléfonos (ML los prohíbe en respuestas);
   - todo monto que aparezca coincide con el precio real (si no, aviso);
   - máximo 2.000 caracteres (límite de ML);
   - sin promesas de fecha de entrega que no salgan de una herramienta.

   Lo que falla no se borra en silencio: se marca en el borrador y la persona
   decide.
5. El borrador vuelve al panel. **Responder sigue siendo el botón de siempre.**

Costo de referencia: 1 a 2 centavos de dólar por borrador con un modelo medio.

## Parte B — Asistente de datos del panel

**Patrones**: ReAct (Tool Use en bucle), Termination, mínimo privilegio,
Context Pruning.

Un panel lateral "Preguntale a tu tienda", accesible desde Inicio y
Estadísticas. `POST /ai/assistant` (`StatsRead` como mínimo).

- **Herramientas** (todas de lectura; cada una exige su permiso y se filtra
  antes de la llamada):

  | Herramienta | Permiso |
  |---|---|
  | `resumen_ventas(desde, hasta)` | `StatsRead` |
  | `productos_mas_vendidos(desde, hasta, limite≤20)` | `StatsRead` |
  | `carritos_abandonados(desde, hasta)` | `OrdersRead` (como la pantalla) |
  | `rentabilidad(desde, hasta)` | `CostsRead` |
  | `stock_bajo(limite≤50)` | `InventoryRead` |
  | `sugerencias_de_reposicion(limite≤50)` | `PurchasingManage` (como la pantalla) |
  | `ordenes_de_compra(estado, limite≤20)` | `PurchasingManage` |
  | `resumen_clientes(desde, hasta)` | `CustomersRead` (solo agregados, sin datos personales) |

  Rangos de fecha acotados a 366 días; resultados recortados a N filas; cada
  monto viene en crudo y ya formateado (`ArgentineNumbers`), para que el modelo
  no formatee números.
- **Refactor necesario**: hoy esa lógica vive dentro de los endpoints
  (`StatsEndpoints.cs` `/overview` `:33`, `/products/top` `:201`,
  `/profitability` `:245`, `/abandoned-carts` `:575`; `InventoryEndpoints`,
  `PurchasingEndpoints`, `CustomersEndpoints`). Se extrae a clases de consulta
  en `Api/Stats/` (y vecinas) que usan **el endpoint y la herramienta**. Las
  respuestas de los endpoints no cambian (lo cuidan las fixtures).
- **Historial**: el servidor no guarda la conversación. El panel manda las
  últimas 4 preguntas y respuestas finales (sin llamadas a herramientas),
  recortadas a 4.000 caracteres. Manipularlas no le da a nadie nada que no
  pueda ver, porque los permisos se aplican en las herramientas.
- **System prompt**: rioplatense, todo número sale de una herramienta, si no
  hay herramienta para lo que se pregunta lo dice, siempre nombra el período.
- La respuesta se muestra como texto (markdown sin HTML).
- Sin CodeAct en v1.

Costo de referencia: 5 a 15 centavos de dólar por pregunta con un modelo medio.

## Parte C — Fichas del catálogo en lote

**Patrones**: Parallelization (por producto), Prompt Chaining con gates,
Evaluator-Optimizer con rúbrica y evaluador de otro proveedor, Checkpoints,
Human-in-the-loop.

1. En Catálogo, la persona filtra (sin descripción, descripción corta, sin los
   atributos que pide ML) y elige hasta **500 productos**. "Mejorar con IA"
   muestra cuántos son, el costo estimado (tokens promedio por producto × los
   precios de los modelos asignados) y cuánto queda del tope. Recién al
   confirmar se crea el trabajo.
2. Tablas (en la migración de la Parte 0):
   - en `Modules/Ai`: `AiCatalogJob` (estado, totales, costo estimado y real,
     quién lo pidió) y `AiCatalogJobItem` (producto, estado, propuesta JSON,
     puntaje, notas del evaluador, intentos);
   - en `Modules/MercadoLibre`: `MeliProductCategory` (producto → categoría
     de ML, y si la eligió una persona o salió de la publicación o de la
     predicción) y `MeliProductAttribute` (producto, id de atributo de ML,
     `value_id` o `value_name`, unidad). Ahí van **los datos que solo usa ML**
     y que la tienda no tiene como spec propia; así no se llena la ficha que
     ve el comprador en la tienda con campos como "Es kit" o "GTIN".
3. **Worker** con el patrón de polling a Postgres
   ([ADR 0005](../adr/0005-segundo-plano-con-polling-a-postgres.md),
   `PollingWorker` + reclamo por fila como `InboxDrain`), 3 productos en
   paralelo. Cada ítem guarda su estado al terminar cada paso: un reinicio
   retoma sin repetir trabajo.
4. Por producto:
   0. **Categoría de ML** (código, sin IA), en este orden:
      1. si ya está en `MeliProductCategory`, esa;
      2. si el producto tiene una publicación vinculada (`MeliItemLink`), la
         categoría de esa publicación (`GET /items/{id}`, campo `category_id`);
      3. si no, la predicción que ya usa el flujo de publicar
         (`domain_discovery`, `MeliEndpoints.cs:817`). Si la primera sugerencia
         no es clara (más de una con nombres distintos), el ítem queda
         **"elegí la categoría"** y no se gasta IA hasta que una persona la
         elija en la revisión.
   0. **Atributos que pide esa categoría**: `GET /categories/{id}/attributes`
      de ML, con caché en memoria por categoría (24 h; muchos productos
      comparten categoría). Se le pasan al modelo solo los obligatorios y los
      que mejoran la publicación, no los ~100 de la categoría, con su tipo y
      sus valores permitidos. El builder confirma la ruta y los campos que
      marcan "obligatorio" en la documentación oficial de ML antes de usarla
      (regla de `AGENTS.md`).
   1. **Redactar** (`CatalogWrite`, JSON): descripción, título y descripción
      SEO, y un valor por atributo **o `falta_dato`**. Recibe en el prompt los
      datos del producto y la lista de atributos, sin herramientas. Los
      atributos que coinciden con una spec mapeada de la tienda
      (`SpecDefinition.MeliAttributeId`, `SpecDefinition.cs:57`) se proponen
      como spec; el resto va a `MeliProductAttribute`.
   2. **Gate determinista**:
      - largos, sin precios ni links ni mails;
      - solo atributos de la lista de la categoría;
      - en los atributos de lista, el valor tiene que ser uno de los
        permitidos; los numéricos, con una unidad válida;
      - **identificadores (GTIN/EAN, código de modelo, número de parte): solo
        si aparecen textuales en los datos del producto y, para GTIN, con
        dígito verificador válido. Si no, `falta_dato`.** Es lo que más
        fácil inventa un modelo y lo que más daño hace en ML.
   3. **Evaluar** (`CatalogJudge`, otro proveedor, JSON con rúbrica):
      `{ inventa_datos, tono_y_voseo, claridad, atributos_ok, puntaje 1-5, motivos }`.
   4. Si no pasa (puntaje < 4 o `inventa_datos`) y hubo menos de 2 intentos,
      vuelve a **Redactar** con las críticas. Después de 2 intentos queda "para
      revisar" con las notas.
5. Antes de cada ítem se chequea el tope; si se alcanzó, el trabajo queda
   **"pausado por presupuesto"** y se reanuda a mano.
6. **Revisión**: lista con lo actual al lado de lo propuesto; aprobar, editar o
   descartar cada uno, y "aprobar todos los que pasaron". Cada producto
   muestra **qué datos le faltan para ML** (`falta_dato`), para completarlos a
   mano ahí mismo. Los que quedaron en "elegí la categoría" se resuelven acá
   (las tres sugerencias de la predicción o una búsqueda) y vuelven a la cola.
   Aprobar:
   - guarda descripción y SEO con `UpdateProductHandler.UpdateDetailsAsync` y
     las specs con el guardado de siempre;
   - guarda categoría y atributos de ML en las tablas nuevas;
   - **no toca la publicación de ML.** Si el producto ya está publicado, la
     revisión ofrece un botón aparte "Actualizar la ficha en ML" (por producto
     o para los aprobados), que manda los atributos a la publicación. Es una
     escritura hacia afuera y va con su propio clic.
7. **Al publicar**, `MeliListingPayload` suma los atributos de
   `MeliProductAttribute` a los que ya arma desde las specs mapeadas
   (`MeliListingPayload.cs:83`), y el flujo de publicar trae preelegida la
   categoría guardada.

Llamadas a ML: las hace el worker con la conexión de la tienda, una a la vez
por tienda, respetando los 429 de ML (espera y reintenta; no cuenta como falla
del ítem).

Costo de referencia: unos US$ 12 a 15 cada 1.000 productos con modelos medios
(la lista de atributos agranda el prompt).

## Parte D — Lectura de facturas encadenada

**Patrones**: Prompt Chaining con gates, Reflection con rúbrica determinista,
Human-in-the-loop.

Mismo endpoint (`POST /purchase-orders/{id}/invoice/scan`) y la misma
confirmación de hoy (`PUT …/invoice`). Cambia lo de adentro de
`InvoiceScanner`:

1. **Extraer** (`InvoiceRead`, PDF o imagen, salida con el esquema de
   `ScannedInvoice`).
2. **Validar en código**:
   - suma de líneas ≈ neto;
   - neto + IVA ≈ total (con tolerancia de redondeo);
   - CUIT con dígito verificador (`Cuit`);
   - fecha no futura;
   - moneda conocida.
3. **Una corrección**: si algo no valida, se vuelve a pedir **una vez**
   diciendo exactamente qué no cierra. Lo que siga sin cerrar va como aviso.
4. **Emparejar líneas** con los ítems de la orden de compra: primero en código
   (código exacto, después descripción normalizada); solo las ambiguas (hasta
   20) se le preguntan al modelo, que elige entre candidatos dados.
5. Vuelve la propuesta con avisos. El costo final (landed cost) lo calcula la
   lógica que ya existe en Compras, sin IA. El archivo sigue sin guardarse.

---

## Cómo se prueba

- **Ningún test llama a un proveedor real.** Un `IChatClient` falso con
  respuestas guionadas (incluidas llamadas a herramientas) cubre gateway,
  bucles y funciones.
- Unit:
  - el gateway respeta el interruptor global, el de la tienda y el tope;
  - el respaldo entra con 429/5xx y no con 400/401;
  - el corte por fallas;
  - el medidor registra cada vuelta del bucle;
  - el costo usa el precio del momento;
  - los guardrails de A;
  - el gate y la vuelta del evaluador en C (máximo 2);
  - las validaciones de D.
- Integración (Postgres de dev):
  - las claves nunca aparecen en ninguna respuesta JSON;
  - "copiar" solo llega a tiendas propias;
  - la vista consolidada no incluye tiendas ajenas;
  - las herramientas de B no ven otra tienda ni lo que el permiso no deja;
  - un trabajo de C se retoma tras reiniciar el worker;
  - los endpoints refactorizados de B devuelven lo mismo que antes.
- Test que fija el purpose `Tiendafy.Ai.Keys.v1` (como los existentes).
- `pnpm fixtures:api` para los endpoints nuevos y los que cambian (`/ai/status`).
- Panel: pantalla de configuración, consumo, borrador de A, panel de B,
  revisión de C.

## Orden de construcción

1. **Parte 0 entera**:
   - módulo y migración (incluidas las tablas de C);
   - gateway, proveedores y catálogo;
   - configuración, consumo y "copiar";
   - permiso;
   - rate limit;
   - y los botones actuales migrados al gateway (`ShortText`, más D y A en
     modo "una sola llamada" hasta que lleguen sus partes).

   Al terminarla queda **congelado el contrato**: `IAiGateway`, `AiTask`, cómo
   se declara una herramienta, el `IChatClient` falso.
2. **A, B, C y D en paralelo**, cada una en su worktree, con archivos
   disjuntos:
   - A: `Api/Ai/Questions/` y las páginas de preguntas, inbox y chat;
   - B: `Api/Ai/Assistant/`, las consultas extraídas y el panel lateral;
   - C: `Api/Ai/Catalog/`, el worker, las pantallas de catálogo y, en
     `Api/Meli/`, la lectura de categoría y atributos, el merge en
     `MeliListingPayload` y "Actualizar la ficha en ML";
   - D: `InvoiceScanner` y `compras-factura.tsx`.

   Ninguna toca migraciones.
3. Documentación en el mismo commit de cada parte:
   - `docs/integraciones/ia.md` (nuevo);
   - [despliegue.md](../despliegue.md) (paso de cargar claves);
   - [permisos.md](../permisos.md) (`AiConfig`);
   - `AGENTS.md` (purpose nuevo);
   - el centro de ayuda del panel.

## Decisiones tomadas en este diseño

Las tomé yo; cualquiera se puede revisar antes de aprobar:

- Catálogo de modelos y precios en código, no editable desde el panel.
- Costos en dólares y marcados como estimados.
- Sin tope cargado no se habilita la IA (sugerido: US$ 20 por mes).
- El consumo lo ve solo el dueño (mismo permiso `AiConfig`).
- Se elimina la clave por variable de entorno: tras el deploy, cada tienda
  carga la suya.
- Aviso de presupuesto solo en Inicio, sin mail.
- B sin historial en el servidor; C con tope de 500 productos por trabajo;
  D sin guardar el archivo.
- El tope mensual se respeta también con ejecuciones simultáneas (reserva en
  memoria por tienda).
- A no cotiza envíos en ML (Mercado Envíos no está integrado); cubre los
  cuatro canales de la bandeja; oculta mails, teléfonos y DNI del texto del
  comprador.
- C completa **los atributos reales de la categoría de ML** (decisión del
  dueño, 25-oct): la categoría sale de lo guardado, de la publicación o de la
  predicción; lo que es solo de ML se guarda aparte de la ficha de la tienda;
  nunca inventa identificadores; actualizar una publicación ya existente es un
  clic aparte.
- D es la excepción a "sin datos personales": manda la factura entera.
- Sin streaming, sin Batch API y sin CodeAct en v1.
