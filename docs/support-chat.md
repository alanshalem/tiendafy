# Chat posventa (módulo Support)

Chat por orden entre el comprador registrado y el staff de la tienda, con
adjuntos PDF/JPG/PNG. Disponible para órdenes efectivamente pagadas
(`PaidAtUtc` presente).

## Modelo

`Modules/Support/Support.Infrastructure` (patrón Infrastructure-only, como
Content/Analytics):

- **Conversation** — una por orden (`unique (tenant_id, order_id)`). Guarda
  `CustomerId`, snapshot de `CustomerEmail` (evita join cross-módulo en la
  bandeja), `Status` (Open/Closed), contadores `UnreadForCustomer` /
  `UnreadForStaff` y `LastMessageAtUtc`. El cliente reabre una cerrada al escribir.
- **SupportMessage** — texto (≤ 4000 chars) + adjunto opcional (uno por
  mensaje): clave de storage, nombre original y content-type.

## Adjuntos (seguridad)

- Tipos permitidos: `application/pdf`, `image/jpeg`, `image/png`. Límite 10 MB.
- **Magic bytes verificados** server-side (`%PDF`, JPEG `FF D8 FF`, PNG
  `89 50 4E 47…`): la extensión/content-type del cliente no se confía.
- Se guardan en el **bucket privado** `tiendafy-private` (sin policy de lectura
  anónima — separado del bucket público de media). La única vía de lectura es la
  **URL firmada de 15 minutos** que la API genera al listar mensajes, y solo la
  recibe quien pasó la autorización del hilo.
- Claves: `{tenantId}/support/{conversationId}/{guid}.{ext}`.

## Autorización

- **Comprador** (storefront): sesión de shopper (`ShopAuth`, cookie HttpOnly).
  Solo ve/abre conversaciones cuyo `CustomerId` es el suyo; al abrir una
  conversación nueva se valida que la orden pertenezca a su email y esté pagada.
- **Staff** (admin): `RequireTenantMembership` a nivel grupo — auth de
  plataforma + membership de la tienda del header `X-Tenant-Id`. Solo ve
  conversaciones de su tenant.

## Tiempo real: polling corto (decisión)

Se evaluó SignalR vs polling. **Elegimos polling** (6 s storefront, 8 s admin,
solo mientras el chat está visible):

- Coherente con la arquitectura actual: el sistema ya usa polling a Postgres
  (webhook inbox, workers) y no hay infraestructura de conexiones persistentes.
- SignalR suma estado por conexión, complicaciones con el multi-tenant por
  header y configuración extra de proxy/nginx — para un chat de posventa (baja
  frecuencia, no conversación en vivo) el beneficio no justifica el costo.
- El volumen es acotado: consultas por pedidos, no soporte en vivo. Si algún día
  se necesita presencia/typing en vivo, el endpoint de mensajes ya es la fuente
  de verdad y SignalR se puede sumar como capa de push sin tocar el modelo.

## Endpoints

Comprador (`/api/v1/shop/support`, requiere sesión shopper + `X-Tenant-Id`):

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/conversations` | Abre (o devuelve) la conversación de una orden propia pagada |
| GET | `/conversations` | Mis conversaciones |
| GET | `/conversations/{id}/messages` | Hilo + marca leído (cliente); adjuntos con URL firmada |
| POST | `/conversations/{id}/messages` | Enviar texto |
| POST | `/conversations/{id}/attachments` | Enviar adjunto (multipart `file` + `body` opcional) |

Staff (`/api/v1/support`, `RequireTenantMembership`):

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/conversations` | Bandeja (no leídas primero) + `unreadTotal` |
| GET | `/conversations/{id}/messages` | Hilo + marca leído (staff) |
| POST | `/conversations/{id}/messages` | Responder |
| POST | `/conversations/{id}/attachments` | Adjuntar |
| POST | `/conversations/{id}/close` | Cerrar conversación |

## UI

- **Storefront**: Cuenta → Mis pedidos → "Consultar sobre este pedido" (órdenes
  pagadas/enviadas/reembolsadas) → modal de chat con envío de texto y adjuntos.
- **Admin**: menú "Chat posventa" (`/posventa`) → bandeja con badge de no
  leídos por conversación, hilo estilo mensajería, adjuntar y cerrar.
