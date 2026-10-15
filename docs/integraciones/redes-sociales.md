# Redes sociales (Meta, X, Telegram) y Meta Ads

Estado: **completo en código, sin probar contra apps reales de Meta ni de X.**
Telegram no necesita app de plataforma. Meta Ads (gasto de pauta para el ROAS
real) es un flujo aparte y va al final de este documento.

## Qué hace en Tiendafy

Desde **Redes** (`/redes` en el panel) la tienda:

- Conecta sus cuentas: páginas de Facebook y perfiles de Instagram Business
  (un solo OAuth de Meta trae todas las páginas que administra el usuario y el
  IG vinculado a cada una), una cuenta de X (OAuth 2.0 con PKCE) y canales o
  grupos de Telegram (bot propio de la tienda, cargado por formulario).
- Arma un post con texto e imágenes que sale a varias cuentas a la vez, con
  texto distinto por cuenta si hace falta, y lo publica ya o lo programa.
- Ve el resultado por red (link al post o el error de cada una) en la bandeja
  y en el calendario.
- Opcionalmente asocia un cupón al post para medir ventas: órdenes pagadas con
  ese código **después** de publicar (mismo criterio que las campañas de email).
- Puede pedirle a la IA que redacte el texto (`POST /api/v1/ai/social-post`).

Todo requiere el permiso `social.publish`. El seeder de demo **no** siembra
redes a propósito (un post falso mostraría algo que no existe en ninguna red).

## Cómo está implementado

El módulo (`backend/src/Modules/Social`) define el puerto y guarda los datos;
los conectores viven en la Api porque cada uno habla con un tercero.

| Pieza | Archivo |
|---|---|
| Puerto: `ISocialChannel` (publicar), `ISocialConnector` (OAuth), `SocialChannelLimits`, `SocialPublishResult` | `backend/src/Modules/Social/Social.Contracts/SocialChannel.cs` |
| Cuenta conectada (token cifrado, flag `Authorized`) | `backend/src/Modules/Social/Social.Infrastructure/SocialAccount.cs` |
| Post y targets, máquina de estados | `backend/src/Modules/Social/Social.Infrastructure/SocialPost.cs` |
| Meta: conector OAuth + canales Facebook e Instagram + traducción de errores | `backend/src/Api/Social/MetaSocialChannels.cs` |
| X: conector y canal en la misma clase | `backend/src/Api/Social/XSocialChannel.cs` |
| Telegram: canal + validación del bot | `backend/src/Api/Social/TelegramChannel.cs` |
| Cifrado de tokens y del `state` OAuth | `backend/src/Api/Social/SocialTokenService.cs` |
| Verifier PKCE | `backend/src/Api/Social/SocialContracts.cs` |
| Opciones (sección `Social`) | `backend/src/Api/Social/SocialOptions.cs` |
| Publicador programado | `backend/src/Api/Social/SocialPublishWorker.cs` |
| Endpoints | `backend/src/Api/Endpoints/SocialEndpoints.cs` |
| Canje de code a token largo, compartido con Meta Ads | `backend/src/Api/MetaAds/MetaGraphTokens.cs` |
| Registro DI | `backend/src/Api/Startup/ServiceRegistration.cs` (bloque "Redes sociales") |
| Panel | `admin/src/pages/Redes.tsx`, `redes-cuentas.tsx`, `redes-composer.tsx`, `redes-publicaciones.tsx`, `redes-calendario.tsx`, `redes-shared.tsx` |

El diseño está tomado de Mixpost: cada red declara sus límites
(`MaxChars`, `MaxImages`, `RequiresMedia`) y el composer valida con eso; cada
canal traduce su HTTP a un `SocialPublishResult` normalizado y el worker no
conoce redes.

| Canal (`Provider`) | Máx. caracteres | Máx. imágenes | Exige imagen |
|---|---|---|---|
| `meta_facebook` | 5000 | 10 | no |
| `meta_instagram` | 2200 | 1 | sí |
| `x` | 280 | 0 (solo texto) | no |
| `telegram` | 4096 | 10 | no |

### Endpoints (todos bajo `/api/v1`)

- `GET /admin/social/channels`: conectores (con `configured`) y límites por red.
- `GET /admin/social/accounts`, `DELETE /admin/social/accounts/{id}`.
- `POST /admin/social/accounts/connect/{connector}` (`meta` o `x`): devuelve
  `authUrl`. Si la app de plataforma no está configurada responde
  `Social.NotConfigured`.
- `POST /admin/social/accounts/telegram` con `{ botToken, chatId }`.
- `GET /social/oauth/callback/{connector}`: callback **público**; el tenant
  viaja dentro del `state` cifrado. Siempre redirige a
  `Social:AdminReturnUrl?social=connected|error`.
- `GET|POST /admin/social/posts`, `PUT /admin/social/posts/{id}`,
  `POST /admin/social/posts/{id}/schedule`, `POST .../unschedule`,
  `DELETE /admin/social/posts/{id}` (no se puede borrar mientras se publica).

### Tokens y purposes de DataProtection

Los tokens se guardan como JSON cifrado en `SocialAccount.AccessTokenEncrypted`
y **nunca** salen hacia el browser:

- Meta: `{ page_token }` (Instagram publica con el page token de su página;
  el `page_id` va en `DataJson`, en claro, sin secretos).
- X: `{ access_token, refresh_token, expires_at_utc }`.
- Telegram: `{ bot_token, chat_id }`.

Purposes: `Tiendafy.Social.Tokens.v1` (tokens) y `Tiendafy.Social.OAuthState.v1`
(state con tenant, verifier PKCE y vencimiento de 15 minutos).
**No se cambian nunca**: con otro purpose, `TryUnprotect` devuelve null, el
worker marca cada cuenta como no autorizada y todas las tiendas tienen que
reconectar. Lo mismo pasa si se pierde el keyring (`DataProtection:KeyPath`).

## Configuración

Credenciales de **plataforma** (una app para todas las tiendas). Sin ellas el
conector queda apagado y el panel lo dice. Telegram no lleva nada.

| Clave de config | Variable en `.env.prod` | Notas |
|---|---|---|
| `Social:Meta:AppId` / `AppSecret` | `SOCIAL_META_APP_ID` / `SOCIAL_META_APP_SECRET` | Puede ser la misma app de Meta Ads con los scopes de páginas e IG. Se considera configurado con los dos. |
| `Social:Meta:RedirectUri` | fija en el compose | `https://api.<dominio>/api/v1/social/oauth/callback/meta` |
| `Social:X:ClientId` / `ClientSecret` | `SOCIAL_X_CLIENT_ID` / `SOCIAL_X_CLIENT_SECRET` | Alcanza con el ClientId; si la app es confidencial, con el secret se manda Basic auth al canjear. |
| `Social:X:RedirectUri` | fija en el compose | `https://api.<dominio>/api/v1/social/oauth/callback/x` |
| `Social:AdminReturnUrl` | fija en el compose | `https://admin.<dominio>/redes` |
| `Social:Meta:ApiBaseUrl`, `AuthBaseUrl`, `Social:X:ApiBaseUrl`, `AuthBaseUrl`, `Social:Telegram:ApiBaseUrl` | no | Defaults en `SocialOptions` (Graph `v21.0`, `api.x.com/2`, `api.telegram.org`); existen para los tests. |

El mapeo está en `infra/docker/docker-compose.stack.yml` y los placeholders en
`infra/docker/.env.prod.example`. En `appsettings.json` no hay sección
`Social`: en dev se carga con user-secrets o variables de entorno
(`Social__Meta__AppId`, etc.).

Qué pedir en cada consola (scopes, redirect) está en
[CONFIGURACION.md](../CONFIGURACION.md); el resto del despliegue, en
[DEPLOY.md](../DEPLOY.md). Scopes que pide el código:

- Meta: `pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish`.
- X: `tweet.read tweet.write users.read offline.access`.

El publicador corre solo si `Workers:Enabled` es `true` (default).

## Flujos

**Conectar Meta.** Panel pide `connect/meta` → el browser va al diálogo de
Facebook → callback canjea `code` por token corto y lo cambia por uno largo
(`MetaGraphTokens`, por GET con query params) → `GET /me/accounts` trae cada
página con su `access_token` y su `instagram_business_account` → se hace upsert
de una cuenta `meta_facebook` por página y una `meta_instagram` por IG.

**Conectar X.** `connect/x` genera el verifier PKCE, lo mete en el `state`
cifrado y arma la URL con `code_challenge` S256 → el callback canjea en
`{ApiBaseUrl}/oauth2/token` y lee `/users/me`.

**Conectar Telegram.** El merchant crea un bot con @BotFather, lo hace admin
del canal y carga token y chat. Se valida con `getChat` y se guarda el id
numérico que devuelve Telegram.

El upsert es por (tenant, `Provider`, `ProviderId`): reconectar repara el token
y vuelve a poner `Authorized = true` sin duplicar la cuenta.

**Publicar.** El post nace `Draft`. "Programar" o "Publicar ahora" (agendar a
now) lo pasa a `Scheduled` + `Pending`. `SocialPublishWorker`, cada 60 s, toma
hasta 10 vencidos y reclama cada uno con un `UPDATE ... WHERE ScheduleStatus =
Pending` por fila (si afecta 0 filas, lo agarró otra instancia). Publica target
por target: el fallo de una red no frena a las demás. Al terminar, el post
queda `Published` o `Failed` (si algún target tuvo error) y `Processed`.

- **Facebook**: cada imagen se sube a `/{page}/photos` con `published=false` y
  se adjunta al `POST /{page}/feed` con `attached_media[i]`.
- **Instagram**: contenedor `POST /{ig}/media` con `image_url` y `caption` →
  `POST /{ig}/media_publish` → `GET /{media}?fields=permalink` para el link.
- **X**: si al token le quedan menos de 5 minutos, se refresca ahí mismo y el
  token nuevo vuelve al worker en `RefreshedTokenJson` para persistirlo
  cifrado; después `POST /tweets` con el texto.
- **Telegram**: `sendMessage`, `sendPhoto` o `sendMediaGroup` según la cantidad
  de imágenes. Si el texto pasa los 1024 caracteres de un caption, sale como
  mensaje aparte.

Respuestas normalizadas: `Unauthorized` marca la cuenta como no autorizada (el
panel pide reconectar y el worker la saltea en los próximos posts);
`RateLimited` y `Error` dejan el mensaje en el target.

## Lo que aprendimos de la API real

Todavía no se publicó con apps reales de Meta ni de X: lo que sigue sale de la
documentación oficial y quedó codificado así.

- **Meta canjea por GET**, con `client_secret` en query, no por POST form como
  Mercado Pago o Mercado Libre.
- Los **page tokens** obtenidos con un token largo de usuario no vencen en la
  práctica: no hay refresh. Ante el error `190` se marca la cuenta y se
  reconecta. Los códigos `4`, `17` y `613` son rate limit.
- **Instagram exige imagen** y la descarga Meta desde `image_url`: la URL tiene
  que ser pública (en dev con `localhost` no anda; en prod sale de R2). El
  link del post no se deriva del id: hay que pedir `permalink`.
- **X**: el access token dura unas 2 horas y el **refresh token es de un solo
  uso** (como el de Mercado Libre). Las apps confidenciales exigen Basic auth
  en `/oauth2/token` además del `client_id` en el form. Subir media va por otro
  flujo y no está hecho: X publica solo texto (más el link que pongas).
- **Telegram**: el caption de una foto admite 1024 caracteres contra 4096 de un
  mensaje. `sendMediaGroup` devuelve un array. El link `t.me/{username}/{id}`
  existe solo si el canal es público. El 429 trae `parameters.retry_after`.

Documentación oficial:
[Pages API](https://developers.facebook.com/docs/pages-api) ·
[Instagram content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing) ·
[Tokens largos de Meta](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived) ·
[Errores de la Graph API](https://developers.facebook.com/docs/graph-api/guides/error-handling) ·
[X API](https://docs.x.com/) ·
[Telegram Bot API](https://core.telegram.org/bots/api).

## Meta Ads (gasto de pauta)

Flujo separado del de redes: la tienda conecta su usuario de Meta con scope
`ads_read`, elige la cuenta publicitaria (`act_...`) y el dashboard de
**Rentabilidad** (`/estadisticas/rentabilidad`) lee el gasto por campaña para
calcular el ROAS real (ganancia / gasto, no facturación / gasto). Solo lee:
no crea campañas ni manda eventos.

- Código: `backend/src/Api/MetaAds/` (`MetaAdsClient`, `MetaAdsOptions`,
  `MetaAdsTokenService`, `MetaGraphTokens`),
  `backend/src/Api/Endpoints/MetaAdsEndpoints.cs`,
  `backend/src/Modules/Analytics/Analytics.Infrastructure/MetaAdsConnection.cs`,
  `admin/src/pages/Stats/Profitability.tsx`.
- Endpoints bajo `/api/v1/meta-ads`: `GET /status` y `GET /spend?from&to`
  (permiso `stats.read`); `POST /connect`, `DELETE /connection`,
  `GET /ad-accounts`, `POST /ad-account` (permiso `ads.manage`); callback
  público `GET /oauth/callback`, que vuelve a `MetaAds:AdminReturnUrl?meta=connected|error`.
- Gasto: `GET /{adAccountId}/insights?level=campaign&fields=campaign_id,campaign_name,spend`
  con `time_range`; sin fechas toma los últimos 30 días. Se devuelve en
  centavos, en la moneda de la cuenta publicitaria.
- Token: largo de usuario (~60 días), sin refresh. Vencido, el endpoint lo
  trata como no conectado y el panel pide reconectar.
- Purposes: `Tiendafy.MetaAds.Tokens.v1` y `Tiendafy.MetaAds.OAuthState.v1`.
  Misma regla: no se cambian.
- Config: `MetaAds:AppId` / `AppSecret` (en `.env.prod`: `META_APP_ID` /
  `META_APP_SECRET`); `MetaAds:RedirectUri`
  (`https://api.<dominio>/api/v1/meta-ads/oauth/callback`) y
  `MetaAds:AdminReturnUrl` los fija el compose.
- Doc oficial: [Marketing API Insights](https://developers.facebook.com/docs/marketing-api/insights).

El **Meta Pixel** no es parte de esto: es un identificador por tienda en
`TrackingSettings` (`backend/src/Modules/Content/Content.Infrastructure/TrackingSettings.cs`)
que el storefront carga en el navegador (`storefront/src/components/store/TrackingTags.tsx`).
No hay Conversions API del lado del servidor.

## Cómo probar

- Tests: `dotnet test backend/backend.slnx --filter "FullyQualifiedName~Social"`
  corre `SocialFlowTests` (punta a punta con Meta, X y Telegram simulados en
  `FakeHttp`), `TelegramChannelTests` y `SocialPostTests`. Meta Ads:
  `WhatsAppAndAdsFlowTests` y, en el panel, `admin/src/__tests__/profitability-meta.test.tsx`.
  `ApiFactory` configura apps de mentira (`Social:Meta:*`, `Social:X:*`,
  `MetaAds:*`).
- Telegram de verdad, sin app de plataforma: creá un bot con @BotFather, sumalo
  como admin a un canal de prueba y cargá token y `@canal` (o el id
  `-100...`) en Redes → Cuentas. Publicá un post con y sin foto.
- Meta y X de verdad: hace falta la app de plataforma con el redirect apuntando
  a una URL pública de la API (en dev, un túnel). Conectá, publicá un post con
  imagen a Facebook e Instagram y uno de texto a X, y mirá el link de cada
  target en la bandeja.

## Pendiente

- **Crear las apps reales de Meta y de X** y probar con cuentas reales. Meta
  necesita App Review para `pages_manage_posts` e `instagram_content_publish`
  (y `ads_read` para Meta Ads) antes de que la usen cuentas que no sean
  testers de la app.
- Media en X (hoy solo texto).
- No hay reintento de un post fallido: queda `Failed` + `Processed`, no es
  editable y hay que armar uno nuevo, aunque el mensaje de rate limit diga
  "Probá de nuevo en N min".
- Conversions API de Meta: no existe; solo el pixel en el navegador.
