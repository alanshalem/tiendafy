# Chat posventa (módulo Support)

Chat por pedido entre el comprador registrado y el equipo de la tienda, con
adjuntos PDF/JPG/PNG. Solo para pedidos pagados (`PaidAtUtc` presente). En el
panel se atiende desde su pantalla (`/posventa`) o desde la **Bandeja**
(`/bandeja`), que junta en una lista el contacto, la posventa y las preguntas y
mensajes de Mercado Libre.

## Modelo

`backend/src/Modules/Support/Support.Infrastructure` (solo Infrastructure,
como Content o Reviews):

- **Conversation**: una por pedido (`unique (tenant_id, order_id)`). Guarda
  `CustomerId`, una copia de `CustomerEmail` (para no cruzar módulos en la
  lista), `Status` (Open/Closed), los contadores `UnreadForCustomer` /
  `UnreadForStaff` y `LastMessageAtUtc`. Si el comprador escribe en una
  conversación cerrada, se reabre.
- **SupportMessage**: texto (hasta 4000 caracteres) y un adjunto opcional por
  mensaje (clave de storage, nombre original y content-type).
- **InboxThreadState**: lo que la Bandeja agrega a una conversación de
  cualquier canal (a quién del equipo le toca, archivada, leída). Cada canal
  guarda sus mensajes donde siempre; la fila nace recién cuando alguien hace
  algo con la conversación. Una archivada vuelve sola si el cliente escribe de
  nuevo.

## Adjuntos (seguridad)

- Tipos: `application/pdf`, `image/jpeg`, `image/png`. Hasta 10 MB
  (`S3MediaStorage.MaxAttachmentBytes`).
- **Magic bytes verificados** en el servidor (`MagicBytes`): no se confía en la
  extensión ni en el content-type que manda el cliente.
- Van al **bucket privado** (`Media:PrivateBucket`, por defecto
  `tiendafy-private`), separado del público de fotos. La única forma de leerlos
  es la **URL firmada de 15 minutos** que la API arma al listar mensajes, y solo
  la recibe quien pasó la autorización del hilo.
- Claves: `{tenantId}/support/{conversationId}/{guid}.{ext}`.

## Autorización

- **Comprador** (tienda): sesión de comprador (cookie HttpOnly por tienda,
  `ShopAuth`). Solo ve las conversaciones con su `CustomerId`; para abrir una
  nueva, el pedido tiene que ser de su email y estar pagado. Las escrituras
  exigen `Origin` propio (`RequireSameOriginForWrites`).
- **Equipo** (panel): `RequirePermission(Permission.SupportChat)` en todo el
  grupo (`support.chat`: sesión + membresía de la tienda del `X-Tenant-Id` +
  el permiso). En la Bandeja, cada persona ve solo los canales para los que
  tiene permiso (posventa pide `support.chat`).

## Tiempo real: polling corto (decisión)

Se evaluó SignalR contra polling. **Se eligió polling**, solo mientras el chat
está a la vista:

| Dónde | Cada |
| --- | --- |
| Tienda, chat abierto | 6 s |
| Panel, `/posventa` | 8 s |
| Panel, Bandeja: hilo abierto / lista | 15 s / 30 s |

- Coherente con el resto del sistema, que ya hace polling a Postgres (inbox de
  webhooks, workers; ver [ADR 0005](./adr/0005-segundo-plano-con-polling-a-postgres.md))
  y no tiene infraestructura de conexiones persistentes.
- SignalR suma estado por conexión, complica el multi-tenant por header y pide
  configuración extra en el proxy (Caddy). Para un chat de posventa (pocas
  consultas, no conversación en vivo) no paga.
- Si algún día hace falta presencia o "escribiendo…", el endpoint de mensajes
  ya es la fuente de verdad y SignalR se puede sumar como capa de aviso sin
  tocar el modelo.

## Endpoints

Comprador (`/api/v1/shop/support`, sesión de comprador + `X-Tenant-Id`):

| Método | Ruta | Qué hace |
| --- | --- | --- |
| POST | `/conversations` | Abre (o devuelve) la conversación de un pedido propio y pagado |
| GET | `/conversations` | Mis conversaciones: las que tienen al menos un mensaje, la más reciente primero, con `orderNumber`/`orderLabel`, `unreadForCustomer` y `lastMessage` (texto en un renglón de hasta 160 caracteres, o el nombre del adjunto, y si lo escribió la tienda) |
| GET | `/conversations/{id}/messages` | Los últimos 500 mensajes + marca leído (comprador); adjuntos con URL firmada |
| POST | `/conversations/{id}/messages` | Enviar texto |
| POST | `/conversations/{id}/attachments` | Enviar adjunto (multipart `file` + `body` opcional) |

Equipo (`/api/v1/support`, `support.chat`):

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET | `/conversations` | Lista paginada (`offset`, `limit`, 25 por defecto), sin leer primero; `filter=waiting` (esperan respuesta) u `open`. Devuelve `unreadTotal` y los conteos de cada filtro, con el número de pedido |
| GET | `/conversations/{id}/messages` | Los últimos mensajes; con `before` (id del más viejo) la tanda anterior y `hasMore`. Sin `before`, marca leído (equipo) |
| POST | `/conversations/{id}/messages` | Responder |
| POST | `/conversations/{id}/attachments` | Adjuntar |
| POST | `/conversations/{id}/close` | Cerrar |

El borrador con IA no está en este grupo: es
`POST /api/v1/ai/support/conversations/{id}/draft` (`support.chat`, cupo por
usuario). Sin cuerpo: el servidor lee los últimos mensajes y el pedido de la
conversación, y **no marca leído** (por eso no usa el `GET` de mensajes, que
sí). Devuelve el texto, los avisos para revisar o "Respondé a mano"; nada sale
hasta que el equipo toca Enviar. Cómo funciona: [ia.md](./integraciones/ia.md#bandeja-de-preguntas).

La Bandeja usa además `/api/v1/inbox` (lista, conteos, asignar, leído/no
leído, archivar) y, para leer y responder un hilo de posventa, los mismos
endpoints de `/api/v1/support`.

## UI

- **Tienda**: Mi cuenta → Mis pedidos → "Consultar sobre este pedido" (en
  pedidos que no estén pendientes de pago, fallidos ni cancelados) → modal de
  chat con texto y adjuntos. Todas sus consultas están en Mi cuenta → **Mis
  conversaciones** (`/cuenta/conversaciones`, también en el menú de la cuenta
  del header): cada una con el pedido, el último mensaje, la fecha y cuántas
  respuestas tiene sin leer; tocarla abre el mismo chat de esa compra, y al
  cerrarlo la lista se vuelve a pedir (abrirlo la marcó leída).
- **Panel**: "Chat posventa" (`/posventa`): lista con filtros y no leídos,
  hilo estilo mensajería con "Ver anteriores", adjuntar y cerrar. La misma
  conversación aparece en la Bandeja (`/bandeja`) con el canal "posventa".
