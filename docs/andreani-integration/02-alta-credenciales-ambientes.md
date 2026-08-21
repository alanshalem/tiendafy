# 02 — Alta, credenciales y ambientes

Responde las preguntas 1 a 4 del checklist.

## 2.1 Cómo se da de alta un comercio y cómo se obtienen las credenciales

### Lo que dice Andreani, textual

🟢 **OFICIAL** — [developers.andreani.com/documentacion](https://developers.andreani.com/documentacion), sección *Authentication*:

> "Before invoking any API, the client must get an authetication token from this API to use in the others calls. **The credentials will be provided previously.**"

🟢 **OFICIAL** — misma página, sección *Get the traces of a shipment*:

> "For this version you need to configure your username by the Andreani team. **Contact your salesperson.**"

Esas dos frases son **toda** la documentación de onboarding que Andreani publica para la API nacional. Traducido: **no hay auto-registro, no hay portal de developers con botón "crear app", no hay sandbox abierto**. Las credenciales las entrega una persona.

### Cómo funciona realmente el alta

🟢 **OFICIAL** — [comercial.andreani.com](https://comercial.andreani.com/) es el dashboard interno de la fuerza de ventas de Andreani. Sus accesos rápidos son: registrar prospectos, minutas de reunión, **nuevo cliente**, gestión de contactos y casos, y **solicitudes administrativas de activación de cuenta**, sobre Microsoft Dynamics CRM.

Es decir, el flujo es: *prospecto → alta de cliente en CRM → activación administrativa de cuenta → entrega de credenciales*. Con un ejecutivo comercial como dueño del proceso de punta a punta.

### Segmentación por tier

🟢 **OFICIAL** — el [plugin de Andreani para WooCommerce](https://wordpress.org/plugins/andreani-shipping/), publicado por Andreani:

> "Works for **PyME, Corporate and Middle Market** clients."

| Tier | Dónde se emite el "Credential ID" |
|---|---|
| PyME | `https://pymes.andreani.com/integraciones/` |
| Corporativo | `https://corporativo.andreani.com/woocommerce` |
| Middle Market | No especificado. El plugin *"automatically detects your client type when you validate your Credential ID"* |

> ⚠️ **Ojo con esto:** el *Credential ID* del plugin **no es** el par `user`/`password` de la API REST. Es un token de vinculación que emite el portal y que el plugin resuelve internamente. Para integrar la API REST directamente (que es lo que necesita Tiendafy) hace falta el `user`/`password`, y no hay evidencia de que el tier PyME lo reciba.

### Requisitos comerciales previos

🟡 **TERCERO** — [Manual Wanderlust Andreani Premium](https://shop.wanderlust-webdesign.com/wp-content/uploads/2024/03/Wanderlust-ANDREANI-PREMIUM-1.pdf):

> Las credenciales *"forman parte de las credenciales rest api que provee Andreani al **abrir la cuenta corriente (cuenta PYME o cuenta corporativa)**"*

🟡 **TERCERO** — [Manual TiendaQuick](https://manual.tiendaquick.com/html/section/plataformas-de-envio/andreani) — datos que pide el alta: usuario y contraseña del panel, nombre completo tal como está registrado, email de la cuenta, **tipo y número de documento (CUIT/DNI)**, teléfono de contacto.

⛔ **GAP-03** — No están publicados: volumen mínimo de envíos, facturación mínima, garantías, documentación societaria, ni lead time de alta.

## 2.2 Autenticación

### Contrato exacto

🟢 **OFICIAL** — [developers.andreani.com/documentacion](https://developers.andreani.com/documentacion):

```
POST https://apis.andreani.com/login          (producción)
POST https://apisqa.andreani.com/login        (QA)

Headers:
  Authorization: Basic base64(user:password)

Respuesta:
  Header  x-authorization-token: <token>
```

> "In the response header, a token with the `x-authorization-token` tag will be returned. **The same must be sent in all subsequent calls.** The same token can be used until it expires and must be authenticated again."

**El token vuelve en un header de respuesta, no en el body.** Es el detalle que más rompe implementaciones nuevas: si leés el body buscando `access_token`, no hay nada.

En las llamadas siguientes el token viaja en el header `x-authorization-token` (mismo nombre).

### TTL del token

⛔ **GAP-09** para la API nacional: la doc solo dice *"until it expires"*, sin número.

🟢 **OFICIAL, pero de otro producto** — [developers.andreanigloballpack.com](https://developers.andreanigloballpack.com/) documenta, sobre **el mismo host `apis.andreani.com` y el mismo header `x-authorization-token`**:

> "Del paso anterior se obtendrá un token con una **vigencia de 24hs**"

🔵 **INFERENCIA:** siendo el mismo host, el mismo endpoint `/login` y el mismo header, es razonable que la vigencia de 24 h aplique también a la API nacional. **No está confirmado.** La implementación no debe depender de ese número: ver §2.2.1.

### 2.2.1 Estrategia de renovación (lo que hay que construir sí o sí)

Como el TTL no está garantizado, el diseño correcto **no** es "renovar cada 23 h". Es:

1. Cachear el token en Redis con un TTL conservador (sugerido: **20 h**), por tenant.
2. Ante **HTTP 401 en cualquier request**, invalidar la entrada de cache, re-loguear y **reintentar la request original una sola vez**.
3. Serializar el re-login por tenant con un lock distribuido en Redis, para que 50 requests concurrentes que reciben 401 no disparen 50 logins.
4. Nunca reintentar en loop: un 401 después del re-login es un error de credenciales, no de expiración.

> **Requests en vuelo cuando expira el token:** fallan con 401. No hay forma de evitarlo. El punto 2 lo resuelve de forma transparente. Este es exactamente el caso que justifica una `DelegatingHandler` en .NET (ver `13-plan-de-implementacion.md`).

### Excepción: `localidades` no requiere auth

🟢 **OFICIAL** — la sección *"Returns all the towns of the Argentine Republic, along with their postal codes"* aclara: **"Does not require authorization"**. Es el único endpoint público. Útil para precargar el catálogo de localidades/CP sin consumir cuota de login.

### Otro esquema de auth: el sandbox de Fulfillment

🟢 **OFICIAL** — [prueba-andreani-sandbox-document-apis](https://developers-sandbox.andreani.com/docs/andreani/prueba-andreani-sandbox-document-apis):

> "JWT Authorization header using the Bearer scheme. Example: `Bearer {token}`"

| Propiedad | Valor |
|---|---|
| Tipo | `apiKey` |
| Ubicación | header |
| Nombre | `Authorization` |
| Formato | `Bearer {token}` |

**Son dos esquemas distintos.** Transporte/distribución usa `x-authorization-token`; el sandbox de fulfillment usa `Authorization: Bearer`. No los mezcles.

## 2.3 Ambientes

| Ambiente | Base URL | 🟢 Fuente |
|---|---|---|
| Producción | `https://apis.andreani.com` | doc oficial, en cada endpoint |
| QA / homologación | `https://apisqa.andreani.com` | doc oficial, en cada endpoint |

**Las credenciales son distintas por ambiente.** 🟡 **TERCERO** ([TiendaQuick](https://manual.tiendaquick.com/html/section/plataformas-de-envio/andreani)) describe el flujo real: se entregan primero las credenciales de testing/QA y después se solicitan las de producción.

🟡 **TERCERO** ([Wanderlust](https://shop.wanderlust-webdesign.com/wp-content/uploads/2024/03/Wanderlust-ANDREANI-PREMIUM-1.pdf)) advierte algo operativamente importante: *"Si se cargan credenciales y datos de testeo, no arrojará precios reales"*. **Las tarifas de QA no son las de producción.** No sirve para validar márgenes ni para QA de negocio, solo de contrato técnico.

### Restricciones de ambiente documentadas para GlobAllPack

🟢 **OFICIAL** — [developers.andreanigloballpack.com](https://developers.andreanigloballpack.com/), sobre el mismo host:

| Restricción | Detalle |
|---|---|
| **Whitelisting por IP** | "Nuestras API's tienen doble control de acceso, uno es por usuario y el otro es por medio de **restricciones x IP**". Un HTTP **403** indica problema de IP |
| **Horario de QA** | "QA: disponible de **08:00 a 20:00**" (hora Argentina, UTC−03:00) |
| **Extensión de horario** | "solicitá al **equipo de IT** la habilitación de una **extensión por 15 días corridos**" |
| Producción | 24/7 |

🔵 **INFERENCIA / GAP-18:** siendo el mismo gateway, es plausible que el whitelisting de IP aplique también a la API nacional. **Esto es crítico para Tiendafy**: si el backend corre en cloud con egress NAT dinámico, hay que resolver IP fija (NAT gateway con IP estática) antes de integrar. **Es la pregunta #1 técnica a Andreani.**

## 2.4 Identificadores de negocio y modelo multi-tenant

Este es el punto donde una integración mal modelada se paga cara. **`contrato` no es un escalar por cliente.**

### Los identificadores

| Identificador | Qué es | Cardinalidad | Dónde va | Fuente |
|---|---|---|---|---|
| `user` / `password` | Credencial de login. El usuario termina en `_gla` | 1 (o pocas) por cuenta | `Authorization: Basic` en `/login` | 🟢 doc + 🟡 Wanderlust |
| **Número de cliente** | Identificador comercial / de facturación | 1 por cuenta | No va en la API | 🟡 Wanderlust |
| **Código de cliente** (`cliente`) | 10 dígitos. Se carga **sin el prefijo `CL`** | 1 por cuenta | Query `cliente` en `tarifas`, obligatorio en `/almacenes/stock` | 🟢 doc + 🟡 Wanderlust |
| `contrato` | Código de contrato. **Tipado por canal (B2C/B2B) y por modalidad (domicilio/sucursal)** | **N por cliente** | Body de `POST /ordenes-de-envio`, query de `tarifas` y `/puntos-de-tercero` | 🟢 doc |
| `sucursalClienteID` | "Identificador de la sucursal del remitente" (sucursal **del cliente**, no de Andreani) | N por cliente | Body de `POST /ordenes-de-envio`, opcional | 🟢 doc |
| Centro de imposición / `origen.sucursal.id` | Sucursal **Andreani** donde se impone el envío | N | Body de `POST /ordenes-de-envio` | 🟢 doc |

### Evidencia de que el contrato está tipado por canal

🟢 **OFICIAL** — el endpoint `GET /puntos-de-tercero` describe su parámetro `contrato` como **"Contrato de tipo B2C"**, y el endpoint entero está anotado **"Only for B2C channel"**. Además la respuesta de creación de orden trae `"tipo": "B2C"`.

### Evidencia de que hay uno por modalidad

Tres integradores independientes convergen:

- 🟡 [nchsala/andreani](https://github.com/nchsala/andreani) pide como config mínima: `CONTRATO_DOMICILIO`, `CONTRATO_SUCURSAL`, `CODIGO_CLIENTE`, `USER`, `PASS`.
- 🟡 [Wanderlust](https://shop.wanderlust-webdesign.com/wp-content/uploads/2024/03/Wanderlust-ANDREANI-PREMIUM-1.pdf): hay que cargar *"el 'Envío a domicilio' y luego el 'Envío a sucursal'"*.
- 🟡 [TiendaQuick](https://manual.tiendaquick.com/html/section/plataformas-de-envio/andreani): número de contrato **y centro de imposición de origen** distintos para cada modalidad.

### Trampas de identificadores (todas 🟡 TERCERO, todas verificables en QA)

| Trampa | Detalle |
|---|---|
| Contrato **WS** vs contrato **.com** | *"los contratos correspondientes son los de WebService (WS). **No cargar los contratos '.com'**"*. Andreani entrega ambos y solo uno sirve para la API |
| Código de cliente ≠ número de cliente | *"el código de cliente NO es el mismo que el número de cliente, son dos números distintos"* |
| Prefijo `CL` | El código de cliente se carga **sin** las letras `CL` iniciales (10 cifras) |
| Usuario | Termina en `_gla` |
| Prefijos numéricos de contrato | Se observaron `300006611` (🟢 doc, contexto B2C) y `400018110` (🟡 SDK). **Andreani no documenta ninguna semántica de prefijo.** No inferir el canal del número |

### Cómo se modela esto en Tiendafy

**Regla de diseño:** un tenant no tiene *un* contrato de Andreani. Tiene un **conjunto de credenciales** y una **colección de contratos**, cada uno con canal y modalidad. La selección del contrato correcto en cada request es una función de `(tenant, canal, modalidad de entrega elegida por el comprador)`.

```
Tenant (tienda)
 └── CarrierAccount (carrier = Andreani)
      ├── user, password            → secreto
      ├── codigoCliente             → 10 dígitos sin "CL"
      ├── ambiente                  → QA | PROD
      └── Contratos[]
           ├── { numero: "300006611", canal: B2C, modalidad: DOMICILIO,  sucursalOrigenId: "46" }
           └── { numero: "300006612", canal: B2C, modalidad: SUCURSAL,   sucursalOrigenId: "46" }
```

Modelar `contrato` como un `string` único en la tabla de configuración del tenant es el error más probable y el más caro de revertir. El modelo de datos completo está en `13-plan-de-implementacion.md`.

⛔ **GAP-13:** no está documentado si un mismo `user`/`password` puede operar todos los contratos del cliente o si hay credenciales por contrato. La evidencia de terceros (un solo `USER`/`PASS` + N contratos en la config) apunta a que **sí**, un usuario opera N contratos. Confirmar con Andreani.

### Modelos de multi-tenancy observados en el mercado

| Modelo | Titular del contrato | Qué carga cada tienda | Ejemplo |
|---|---|---|---|
| **A — Login federado** | El merchant | Solo usuario/password Andreani, vía login en la app | 🟡 Tiendanube (app oficial). Binding 1:1, rebind = desinstalar y reinstalar |
| **B — Contrato propio** ← *recomendado para Tiendafy* | El merchant | `user`, `pass`, código de cliente, N contratos, centros de imposición, ambiente | 🟡 VTEX, TiendaQuick, Wanderlust, Zippin |
| **C — Agregador** | La plataforma | Nada de Andreani. Solo KYC + dirección de origen | 🟡 Empretienda/Emprepack (aprobación hasta 5 días hábiles) |
| **D — Credential ID** | El merchant | Un token opaco emitido por el portal según tier | 🟢 Plugin oficial WooCommerce |

**Recomendación para Tiendafy: Modelo B.** Cada tienda usa su propio contrato con Andreani y Tiendafy solo orquesta. Razones: (a) evita que Tiendafy sea responsable de la facturación logística de sus clientes, (b) el modelo C exige un contrato marco de agregador con Andreani que es una negociación comercial aparte, (c) el modelo A no está disponible como API pública.

> El modelo C es interesante como producto a futuro ("Tiendafy Envíos"), pero es una decisión de negocio, no técnica. Si se explora, la pregunta a Andreani es si existe un **programa de partner/integrador** con contrato marco.

## 2.5 Resumen de GAPs de este documento

| ID | GAP | Pregunta a Andreani |
|---|---|---|
| GAP-03 | Proceso y lead time de alta; requisitos formales | ¿Cuál es el proceso y el lead time para acceso a la API REST? ¿Requisitos de volumen o facturación? |
| GAP-09 | TTL del token nacional | ¿La vigencia de 24 h de GlobAllPack aplica a la API nacional? ¿Hay rate limit en `/login`? |
| GAP-13 | Un usuario ↔ N contratos | ¿Un mismo `user`/`password` opera todos mis contratos, o hay credenciales por contrato? |
| GAP-18 | Whitelisting de IP | ¿La API nacional aplica restricción por IP pública? ¿Soporta CIDR? ¿Procedimiento de alta de IPs? |
| — | Semántica de contratos | ¿Cuántos contratos me asignan y con qué criterio? ¿Puedo sumar contratos después sin re-homologar? |
| — | Horario de QA | ¿QA nacional tiene la restricción 08:00–20:00 ART? |
| — | Contratos QA vs PROD | ¿Los números de contrato cambian al pasar a producción? |
