# Mercado Libre

Canal de venta en Mercado Libre: cada tienda conecta su cuenta de vendedor por
OAuth y desde el panel atiende ventas, preguntas, mensajes y reclamos, mantiene
stock y precio sincronizados con sus publicaciones y publica productos del
catálogo.

Estado: completo en código y cubierto por tests contra una API simulada.
Falta crear la app real en Mercado Libre y probar con una cuenta de verdad.

Docs oficiales: [developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar/es_ar/api-docs-es)
(autenticación, notificaciones, órdenes, preguntas, mensajería, reclamos, ítems).

## Qué hace en Tiendafy

- **Conexión por tienda.** Hay UNA app de plataforma (Tiendafy) en Mercado
  Libre; cada tienda autoriza su cuenta contra esa app. Una conexión por tenant.
- **Ventas.** Cache local de las órdenes (`meli_orders`), alimentado por el
  webhook `orders_v2` y por un backfill de las últimas 50 al conectar o al
  tocar "Actualizar". Se listan con búsqueda y filtros (sin facturar,
  facturadas, pagadas, pendientes, canceladas).
- **Stock unificado.** Una venta cobrada descuenta stock local de la variante
  vinculada (una sola vez por orden); una cancelación lo devuelve. En la otra
  dirección, un worker empuja stock y precio locales a ML.
- **Precio con recargo del canal.** `PriceMarkupPct` (acotado a -50 % / +200 %)
  cubre la comisión de ML. Se aplica **solo con la sincronización de precios
  prendida**, tanto en el worker como al publicar.
- **Preguntas, mensajes posventa y reclamos.** Proxy en vivo a la API (no se
  guardan). Preguntas y mensajes sin leer también aparecen en la bandeja
  unificada del panel, con cache de 45 s por tienda.
- **Publicar.** Desde el catálogo, con categoría sugerida por
  `domain_discovery`. La publicación nace vinculada a la variante.
- **Facturación ARCA.** Botón "Facturar" por venta (consumidor final) y
  auto-factura opcional al importar cada venta cobrada; nota de crédito
  automática si una venta facturada se cancela o reembolsa.
- **Métricas.** Las ventas ML entran en Estadísticas, Rentabilidad, Reposición
  y en los avisos del Inicio (sin facturar, preguntas sin responder). Ingresos
  y ganancia del canal cuentan lo cobrado (`BillableAmount`: `paid_amount`, o
  el total si no viene), no el total de la venta.

### "Venta cobrada"

Una sola definición en todo el panel: `MeliOrder.EarningStatuses` =
`paid` + `partially_refunded` (con devolución parcial lo que quedó sigue siendo
ingreso). La usan el descuento de stock, facturar, el filtro "pagadas", los
ingresos, Rentabilidad y Reposición. Si agregás un consumidor nuevo, usá
`MeliOrder.EarningStatuses.Contains(o.Status)` (EF lo traduce), nunca `"paid"`
a mano.

## Cómo está implementado

Módulo `MercadoLibre.Infrastructure` (entidades + DbContext + cliente) y la
orquestación en la Api.

| Archivo | Qué tiene |
|---|---|
| `backend/src/Modules/MercadoLibre/MercadoLibre.Infrastructure/MeliOptions.cs` | Config de la app de plataforma (sección `MercadoLibre`). `Configured` = ClientId y ClientSecret cargados. |
| `.../MercadoLibre.Infrastructure/MeliClient.cs` | Cliente HTTP (timeout 20 s): URL de autorización, intercambio y refresh de tokens, GET/POST/PUT que devuelven `JsonDocument` crudo (sin DTOs espejo). Errores como `MeliException`. |
| `.../MercadoLibre.Infrastructure/MeliConnection.cs` | Conexión OAuth por tenant: tokens cifrados, switches de stock/precio/auto-factura, buffer, recargo, `IsDemo`. |
| `.../MercadoLibre.Infrastructure/MeliOrder.cs` | Cache de una venta: `EarningStatuses`, `StockApplied` / `StockReverted` (idempotencia), `FiscalDocumentId`, `CreditNoteIssued`. |
| `.../MercadoLibre.Infrastructure/MeliItemLink.cs` | Publicación (+ variación opcional) ↔ variante local, con `LastPushedQty` y `LastPushedPriceMinor`. |
| `.../MercadoLibre.Infrastructure/MeliNotification.cs` | Inbox durable de webhooks (hereda `InboxEntry`: reintentos con backoff, estado `dead`). |
| `.../MercadoLibre.Infrastructure/MeliPricing.cs` | Función pura del precio del canal (redondeo `AwayFromZero`, piso de 1 centavo). |
| `.../MercadoLibre.Infrastructure/MeliLinkResolver.cs` | Ítem vendido → variante, con fallback al vínculo a nivel ítem. Lo usan Rentabilidad y Reposición. |
| `.../MercadoLibre.Infrastructure/MeliDemoFeed.cs` | Respuestas fijas para la cuenta de demo. |
| `backend/src/Api/Meli/MeliTokenService.cs` | Cifrado de tokens, state OAuth firmado y renovación serializada por tenant. |
| `backend/src/Api/Meli/MeliSyncService.cs` | Upsert de órdenes, movimiento de stock y ciclo fiscal (factura / NC). |
| `backend/src/Api/Meli/MeliNotificationWorker.cs` | Drena el inbox cada 5 s. Solo procesa `orders_v2`. |
| `backend/src/Api/Meli/MeliStockSyncWorker.cs` | Cada 5 min empuja stock y precio por diferencia. |
| `backend/src/Api/Meli/MeliListingPayload.cs` | Cuerpo del `POST /items` al publicar. |
| `backend/src/Api/Meli/MeliOrderFilters.cs` | Búsqueda y filtros del listado y de los contadores del Inicio (misma regla). |
| `backend/src/Api/Inbox/MeliInboxSource.cs` | Preguntas y packs sin leer para la bandeja unificada. |
| `backend/src/Api/Endpoints/MeliEndpoints.cs` | Todos los endpoints del canal. |
| `admin/src/pages/MercadoLibre.tsx` y `admin/src/pages/mercadolibre-*.tsx` | Página `/mercadolibre`: ventas, preguntas, publicaciones, reclamos. |
| `admin/src/pages/Settings/MercadoLibre.tsx` | `/configuracion/mercadolibre`: conectar, switches, buffer, recargo, importar ventas. |

Tokens cifrados con DataProtection, purpose `Tiendafy.Meli.Tokens.v1`; el
state del OAuth usa `Tiendafy.Meli.OAuthState.v1` (vence a los 15 min). **No
cambies esos purposes**: los tokens guardados dejarían de poder leerse y todas
las tiendas tendrían que reconectar.

### Endpoints

Todos bajo `/api/v1`.

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET /admin/meli/connection` | `meli.config` | Estado, switches y salud (vínculos, última venta, último aviso, avisos muertos). |
| `POST /admin/meli/connect` | `meli.config` | Devuelve `authUrl` para el OAuth. Error si la plataforma no está configurada. |
| `DELETE /admin/meli/connection` | `meli.config` | Desconecta (borra la conexión; ventas y vínculos quedan). |
| `PUT /admin/meli/settings` | `meli.config` | Stock sync, buffer (0–1000), precio sync, recargo, auto-factura. |
| `POST /admin/meli/orders/refresh` | `meli.config` | Backfill de las últimas 50 ventas. |
| `GET /meli/oauth/callback` | público | Callback OAuth; el tenant viaja firmado en el `state`. |
| `GET /admin/meli/status` | `meli.operate` o `meli.publish` | Conectado sí/no y nickname. |
| `GET /admin/meli/orders`, `GET /admin/meli/stats` | `meli.operate` | Ventas del cache y métricas del período. |
| `GET /admin/meli/questions`, `POST /admin/meli/questions/{id}/answer` | `meli.operate` | Preguntas (con ficha de la publicación) y respuesta. |
| `GET/POST /admin/meli/packs/{packId}/messages` | `meli.operate` | Mensajería posventa (máx. 350 caracteres; el comprador sale del cache, nunca del request). |
| `GET /admin/meli/claims` | `meli.operate` | Reclamos paginados. |
| `POST /admin/meli/orders/{id}/invoice` | `fiscal.emit` | Factura ARCA de una venta cobrada. |
| `GET /admin/meli/items`, `POST/DELETE /admin/meli/items/{itemId}/link` | `meli.publish` | Publicaciones del vendedor y vínculos con variantes. |
| `PUT /admin/meli/items/{itemId}/sync` | `meli.publish` | Switches de stock y precio de UNA publicación vinculada (`{ meliVariationId, syncStock?, syncPrice? }`). No escribe en ML: vale también en la cuenta de ejemplo. |
| `GET /admin/meli/categories/predict`, `POST /admin/meli/products/{id}/publish` | `meli.publish` | Sugerir categoría y publicar. |
| `POST /webhooks/meli` | público (allowlist en `AdminWriteAuthMiddleware`) | Webhook: solo persiste y responde 200 (también a un cuerpo que no es JSON, ver "Venta nueva"). |

## Configuración

Sección `MercadoLibre` (`MeliOptions`). Vacía = integración apagada; el panel
muestra "no configurada".

| Clave | Para qué | Default |
|---|---|---|
| `MercadoLibre:ClientId` / `MercadoLibre:ClientSecret` | App de plataforma en ML | vacío |
| `MercadoLibre:RedirectUri` | Callback registrado en la app: `https://api.TUDOMINIO/api/v1/meli/oauth/callback` | vacío |
| `MercadoLibre:AdminReturnUrl` | A dónde vuelve el navegador (`?meli=connected` o `?meli=error`) | `http://localhost:5173/configuracion/mercadolibre` |
| `MercadoLibre:AuthBaseUrl` | Auth del país del vendedor | `https://auth.mercadolibre.com.ar` |
| `MercadoLibre:ApiBaseUrl` | API | `https://api.mercadolibre.com` |

- **Dev:** user-secrets, con la URL de un túnel en `RedirectUri` (ML exige
  HTTPS público para el callback y los avisos).
- **Prod:** `MELI_CLIENT_ID` y `MELI_CLIENT_SECRET` en `.env.prod`; el compose
  las pasa como `MercadoLibre__ClientId` / `__ClientSecret` y arma solo
  `RedirectUri` y `AdminReturnUrl` con el dominio del ambiente.
- **En la app de ML:** Redirect URI como arriba y URL de notificaciones
  `https://api.TUDOMINIO/api/v1/webhooks/meli` con el topic `orders_v2`
  (los demás topics se aceptan pero se ignoran). Ver también
  [CONFIGURACION.md](../CONFIGURACION.md).
- Los workers corren si `Workers:Enabled` es `true` (default).

Por tienda (desde `/configuracion/mercadolibre`): sincronizar stock, buffer
anti-sobreventa, sincronizar precios, recargo del canal y auto-factura. Todos
apagados al conectar.

Por publicación (en `/mercadolibre`, pestaña Publicaciones): los switches
"Stock" y "Precio" de cada publicación vinculada. Nacen prendidos; el de la
conexión manda sobre ellos (apagado allá, no viaja nada). Sirven para dejar
afuera una publicación puntual, por ejemplo una con precio promocional
cargado a mano en ML. Al volver a prender uno se olvida lo último empujado y
la próxima pasada manda el valor de la tienda aunque coincida con el de antes.

## Flujos

**Conectar.** `POST /admin/meli/connect` arma la URL de
`{AuthBaseUrl}/authorization` con un `state` firmado (tenant + timestamp). ML
vuelve al callback, se cambia el `code` por tokens en `{ApiBaseUrl}/oauth/token`,
se consulta `/users/me` (nickname y `site_id`, MLA por defecto), se guarda la
conexión cifrada y se hace un backfill best-effort. Reconectar reemplaza el par
de tokens de la conexión existente.

**Token vigente.** `MeliTokenService.GetValidTokenAsync` renueva si faltan
menos de 10 min. Usa un `SemaphoreSlim` por tenant y **re-lee la conexión
dentro del lock**: si otro request ya renovó, usa ese token. Si ML no devuelve
un refresh token nuevo, se conserva el anterior.

**Venta nueva.** ML hace `POST /api/v1/webhooks/meli` → se guarda en
`meli_notifications` y se responde 200 (si el payload viene incompleto o el
cuerpo no es JSON, 200 igual y se descarta: ML reintenta todo lo que no sea
200 y un cuerpo roto no se arregla reintentando; si de verdad era una venta,
la trae "Actualizar"). `MeliNotificationWorker` resuelve el tenant por
`user_id`, saca el id de `resource` (`/orders/123`) y re-consulta
`GET /orders/{id}` con el token del vendedor. `MeliSyncService.ApplyOrderAsync`:

1. Upsert del cache (ítems con `sale_fee` por unidad, pack, envío).
2. Si está cobrada y `!StockApplied`: descuenta stock de cada ítem vinculado
   con `SyncStock` (vínculo exacto ítem + variación, o fallback a nivel ítem).
3. Si pasó a `cancelled` con stock aplicado: lo devuelve (`StockReverted`).
   Un `refunded` **no** devuelve stock: la mercadería puede estar en viaje o
   dañada, decide una persona.
4. Fiscal (best-effort, ARCA caído no frena la importación): si estaba
   facturada y quedó `cancelled` o `refunded`, encola la nota de crédito; si
   está cobrada, sin comprobante y con auto-factura prendida, emite a
   consumidor final.

**Tiendafy → ML.** `MeliStockSyncWorker`, cada 5 min, toma las conexiones con
stock **o** precio prendidos (nunca las de demo) y, de cada una, los vínculos
con su switch de stock o de precio prendido. Por vínculo calcula
`disponible − buffer` y `MeliPricing.ForChannel(precio, recargo)`, y hace un
solo `PUT /items/{id}` con lo que cambió respecto de lo último empujado. En
publicaciones con variaciones, stock y precio van dentro de `variations[]`
(ML rechaza precio a nivel ítem en ese caso). Si el PUT falla, no se marca y se
reintenta en la próxima pasada.

**Publicar.** Exige categoría (sugerida por
`/sites/{site}/domain_discovery/search`) y stock disponible > 0, y que el
colchón anti-sobreventa no se coma todo el stock: si disponible − buffer < 1
responde 400 (`Meli.BufferExceedsStock`) en vez de publicar 1 unidad igual.
Arma el payload: título hasta 60 caracteres, precio con recargo solo si la
sincronización de precios está prendida, `available_quantity` = disponible −
buffer, `condition: new`, `listing_type_id` `gold_special` por
defecto, hasta 6 fotos, atributos `BRAND`, `SELLER_SKU` y los de la ficha
técnica que tengan `MeliAttributeId`. La descripción va en un segundo
`POST /items/{id}/description`. Después auto-vincula, con lo que viajó
(disponible − buffer y el precio del canal) como último empujado: el worker
no repite el PUT. v1 no publica variaciones de ML.

## Lo que aprendimos de la API real

Lo que sigue está en el código como regla; todavía no se validó con una cuenta
real (ver Pendiente).

- **Refresh token de un solo uso.** ML lo rota en cada refresh; dos refreshes
  concurrentes invalidan la conexión entera. Por eso la renovación serializada.
- Access token de ~6 h (`expires_in`, 21600 por defecto si no viene).
- El endpoint de autorización cuelga de la base de auth (`/authorization`), a
  diferencia de los otros OAuth de la plataforma.
- **Los webhooks no traen datos ni vienen firmados**: siempre se re-consulta el
  resource con el token del vendedor. Exigen 200 en menos de 500 ms, por eso el
  inbox. Llegan repetidos: el descuento de stock es idempotente por orden.
- Rate limit de ~1500 req/min por vendedor; un 429 se traduce a un mensaje
  amable.
- Multiget `/items?ids=` de a 20; las búsquedas devuelven hasta 50 por página
  y el total en `paging.total`.
- Las miniaturas vienen por `http://`; se reescriben a `https://` para el panel.
- Mensajes posventa limitados a 350 caracteres.
- El recurso de reclamos (`/post-purchase/v1/claims/search`) varía por cuenta:
  si falla, el panel muestra "sin reclamos" en vez de error.
- ML no expone el documento del comprador por la vía usada: se factura a
  consumidor final.

## Cómo probar

- **Tests.** `backend/tests/IntegrationTests/MercadoLibreFlowTests.cs` recorre
  OAuth, backfill, venta → descuento, cancelación → devolución, sync de stock y
  precio, preguntas, mensajes, reclamos, publicar, facturar, demo de solo
  lectura y devolución parcial, contra la API simulada (`FakeHttp`). Unitarios
  en `backend/tests/UnitTests/Meli/`. Desde `backend/`:
  `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~MercadoLibre"`
  (levanta Postgres en Docker).
- **Demo sin cuenta.** En Development, `POST /api/v1/dev/demo-seed` crea una
  conexión marcada `IsDemo` con token falso, vínculos y ventas de ejemplo. Las
  pantallas en vivo (preguntas, publicaciones, reclamos, mensajes) contestan
  con `MeliDemoFeed`; las escrituras devuelven 409 (`Meli.Demo`) y los workers
  la saltean.
- **Con cuenta real.** Creá la app, cargá las claves con un túnel en
  `RedirectUri`, conectá desde `/configuracion/mercadolibre`, mirá que lleguen
  las ventas, prendé stock sync con una publicación vinculada y verificá el PUT
  en los logs (`ML actualizado: ...`). Para no tocar publicaciones reales, ML
  ofrece usuarios de test (`POST /users/test_user`, ver docs oficiales).

## Pendiente

- Crear la app de plataforma en developers.mercadolibre.com.ar y probar OAuth,
  webhooks y sync con una cuenta real.
- Backlog: publicar con variaciones de ML, responder reclamos, mensajes con
  adjuntos y `missed_feeds` como respaldo de los webhooks.
