# 14 — Andreani vs Zipnova: mapa de equivalencias

> **Advertencia de uso:** este documento existe como **mapa mental** para el equipo que ya integró Zipnova. **No es fuente de verdad para Andreani.** Ninguna decisión de implementación de Andreani debe justificarse con "en Zipnova funciona así". Todo lo de Andreani está en los documentos 02 a 13, con su fuente.
>
> Fuente de Zipnova: 🟢 [docs.zipnova.com](https://docs.zipnova.com/) (documentación oficial, relevada el 2026-08-21).

---

## 14.1 La diferencia que explica todas las demás

**Zipnova es un agregador multi-carrier. Andreani es un carrier.**

Eso no es un detalle de producto: define la forma entera de cada API.

| | Zipnova | Andreani |
|---|---|---|
| Qué es | Capa sobre N transportes | Un transporte |
| Su cotización devuelve | **Varias opciones** con `carrier`, `rating`, `tags: cheapest/fastest`, `selectable`, `impediments` | **Una tarifa** |
| El "producto" se elige con | `service_type` en el request | **El número de contrato** |
| Modelo mental | "Dame las opciones para este envío" | "¿Cuánto sale este envío bajo este contrato?" |

**Consecuencia práctica:** el trabajo de comparar opciones que Zipnova hace del lado suyo, con Andreani lo tiene que hacer Tiendafy — llamando N veces con N contratos y armando la lista. Eso ya está contemplado en el diseño de `13` §13.2 (`QuoteShippingOptionsHandler`).

---

## 14.2 Tabla de equivalencias conceptuales

| Concepto | Zipnova | Andreani | Nota |
|---|---|---|---|
| **Base URL** | `https://api.zipnova.com.ar/v2` | `https://apis.andreani.com` | Andreani **no versiona de forma consistente**: la doc escribe los métodos sin versión y solo el link de etiqueta lleva `/v2/`. Zipnova versiona por host |
| **Sandbox** | **Mismo host**, flag de cuenta habilitado por soporte | **Host separado** `apisqa.andreani.com` | Andreani es más limpio acá |
| **Auth** | Basic estático (token+secret) **o** OAuth2 (365 días) | `POST /login` Basic → token en header `x-authorization-token` | Zipnova no requiere renovación; Andreani sí |
| **TTL del token** | Basic: sin expiración. OAuth2: `expires_in: 31536000` | ⛔ **No documentado** (24 h en GlobAllPack) | Ver `02` §2.2 |
| **Multi-cuenta** | `account_id` **de primera clase**, en casi todo endpoint. OAuth2 pensado para partners | ⛔ Sin concepto de cuenta. Se resuelve con **N contratos + credenciales por tenant** | Zipnova está diseñado para multi-tenant; Andreani no |
| **Rate limits** | 🟢 **Publicados**: 100/min creación, 500/min cotización, 1000/min consulta. Headers `X-RateLimit-*`, 429 | ⛔ **No publicados**. Sin headers, sin 429 declarado | Diferencia grande de madurez |
| **Status page** | 🟢 `status.zipnova.app` | ⛔ No existe | |
| **Cotización** | `POST /shipments/quote` → `results` + `all_results` con precio, carrier, rating, plazo, tags | `GET /tarifas` → una tarifa con/sin IVA + `pesoAforado` | Path ambiguo en Andreani |
| **Plazo de entrega** | 🟢 `delivery_time.estimated_delivery` + desglose | ⛔ **No lo devuelve** | Ver `05` §5.6 — es un problema real de checkout |
| **Peso volumétrico** | Packing automático (`items[]` o `packages[]`, `type_packaging`) | Cliente manda peso y volumen; Andreani devuelve `pesoAforado`. ⛔ Fórmula no publicada | |
| **Puntos de retiro** | `GET /locations`, `POST /locations/search` (por lat/lng + radio), `dropoff_locations` | `GET /puntos-de-tercero` (filtro por CP), `GET /sucursales` | Zipnova soporta búsqueda geográfica; Andreani por CP |
| **Crear envío** | `POST /shipments` → `id`, `external_id`, `delivery_id`, `carrier_tracking_id` | `POST /ordenes-de-envio` → **N `numeroDeEnvio`, uno por bulto** | Andreani no devuelve un id de envío único |
| **Referencia externa** | 🟢 `external_id` de primera clase, **único en el sistema**, filtrable en `GET /shipments` | `bultos[].referencias[meta=idCliente]`. `idPedido` solo en el esquema beta. ⛔ **No consultable** | Ver `06` §6.5 — es el GAP que más duele |
| **Idempotencia** | `external_id` único a nivel API | ⛔ **Ninguna** | Andreani exige idempotencia propia |
| **Etiquetas** | `GET /shipments/{id}/{label\|document}.{pdf\|zpl}` → **base64**. `no_status_change=1` | `GET /v2/{numeroDeEnvio}/etiquetas` → **PDF binario**. ⛔ Sin ZPL documentado | **Zipnova sí tiene ZPL** |
| **Etiquetas por bulto** | Una por bulto, más `label_elements[]` para componer la propia | Una por bulto, vía `linking` | Igual |
| **Guía de despacho** | 🟢 `document` como formato descargable | ⛔ No existe. Solo `multimedia` post-hoc | |
| **Tracking** | `GET /shipments/{id}/tracking` + listado filtrable `GET /shipments` | `GET /envios/{n}/trazas`. ⛔ Masivo **sin filtros documentados** | El polling en Andreani es mucho más caro |
| **Consulta por referencia propia** | 🟢 `GET /shipments?external_id=X` | ⛔ **No existe** | |
| **Estados** | 🟢 **29 estados publicados** con código, descripción y si es seteable | ⛔ **4 `EstadoId` + 1 `MotivoId`**, sacados de ejemplos | **La diferencia más grande de todas** |
| **Subestados** | `substatus_code` / `substatus_name`. ⛔ Catálogo no publicado | `MotivoId` / `Motivo`. ⛔ Catálogo no publicado | Ambos fallan acá |
| **Webhooks** | 🟢 **Self-service**: `POST /accounts/{id}/webhooks` con topics. Reintentos cada hora por 12 h | 🟢 Existe, pero **invertido**: el cliente define el contrato. Alta manual con Andreani | Modelos opuestos |
| **Firma de webhook** | ⛔ Sin HMAC documentado (Zipnova puede autenticarse contra tu endpoint) | ⛔ Sin firma. Seguridad definida por el cliente | Ambos fallan acá |
| **Cancelación** | 🟢 `POST /shipments/{id}/cancel`. Si ya se despachó → "rescue_requested" | ⛔ **No existe** | |
| **Modificación** | 🟢 `PUT /shipments/{id}` (solo `external_id`), regenera etiquetas | ⛔ **No existe** | |
| **Devoluciones** | 🟢 `POST /shipments/{id}/return/quote` y `/return`, vinculadas con `relationship: "return"` | ⛔ Sin API. 🔵 Probablemente un contrato de retorno | |
| **Errores** | Códigos HTTP estándar (400/401/403/404/406/409/422/429) | **Dos esquemas incompatibles**. ⛔ Sin catálogo de `code` | |
| **Push de estados propios** | 🟢 `POST /shipments/{id}/tracking` para flota propia | ⛔ No aplica | |

---

## 14.3 Mapeo de estados: Zipnova → neutral → Andreani

Zipnova publica 29 estados; Andreani, 4. Esta tabla muestra el estado neutral de Tiendafy y qué aporta cada carrier.

| Estado neutral Tiendafy | Zipnova (código) | Andreani (`EstadoId`) |
|---|---|---|
| `CREATED` | `new`, `documentation_ready` | **1** `Pendiente de ingreso` |
| `READY_TO_SHIP` | `ready_to_ship` | — (evento local: etiqueta impresa) |
| `DISPATCHED` | `shipped`, `admitted`, `in_transit_to_crossdock` | **5** `Ingreso al circuito operativo` |
| `IN_TRANSIT` | `crossdock`, `xd_pending`, `in_transit_to_carrier`, `received_by_carrier`, `in_transit` | ⛔ |
| `OUT_FOR_DELIVERY` | `out_for_delivery` | **6** `En distribución` |
| `DELIVERY_ATTEMPT_FAILED` | `delivery_attempt` | **11** `Visita` + `MotivoId` |
| `AVAILABLE_FOR_PICKUP` | `available_for_pickup` | ⛔ |
| `DELIVERED` | `delivered`, `delivered_with_damage` | ⛔ |
| `EXCEPTION` | `not_delivered` (+ substatus), `rejected`, `on_hold_crossdock` | ⛔ (vía `Motivo`) |
| `RETURNED_TO_SENDER` | `generated_return`, `return_xd_pending`, `in_transit_to_seller`, `returned_to_seller` | ⛔ |
| `LOST_OR_DAMAGED` | `lost_in_carrier`, `lost` | ⛔ |
| `CANCELLED` | `cancelled`, `expired` | Marca **local** (sin API) |
| `RESHIPPED` | `reshipped` | ⛔ |
| `UNKNOWN` | *(estado nuevo)* | *(cualquier id no mapeado)* |

**Lo que esta tabla demuestra:** el estado neutral de Tiendafy **ya existe y funciona** — lo definió la integración con Zipnova. Andreani no requiere inventar un dominio nuevo: requiere **completar el mapeo** cuando Andreani entregue su catálogo. Mientras tanto, las 4 filas conocidas alcanzan para el 80% del ciclo feliz.

---

## 14.4 Qué se puede reutilizar del código de Zipnova

| Componente | ¿Reutilizable? | Comentario |
|---|---|---|
| Estados neutrales del dominio | ✅ **Tal cual** | Ya están bien definidos |
| `Shipment` / `Parcel` como agregados | ✅ | Zipnova y Andreani coinciden: un envío, N bultos con tracking propio |
| Máquina de estados y transiciones | ✅ | Andreani es un subconjunto |
| Notificaciones al comprador | ✅ | Mismos hitos, mismo copy |
| Página de tracking | ✅ | — |
| Cálculo de bultos | ✅ | Andreani necesita `volumenCm` explícito; es un cálculo, no un rediseño |
| Validadores de dirección argentina | ⚠️ **Parcial** | Andreani exige normalizar la localidad contra **su** catálogo. La validación de CP y CUIT se reutiliza |
| Cache de cotizaciones | ⚠️ Adaptar | Misma estrategia, clave distinta (Andreani cachea por contrato) |
| Auth handler | ❌ **Nuevo** | Zipnova usa Basic estático; Andreani, token con expiración y re-login |
| Receptor de webhook | ❌ **Nuevo** | Contratos completamente distintos |
| Job de polling | ⚠️ Adaptar | Zipnova permite listado filtrado; Andreani (hasta confirmar) es envío por envío |
| Flujo de cancelación | ❌ **No aplica** | Andreani no tiene. Hay que exponerlo distinto en el panel |
| Flujo de devoluciones | ❌ **No aplica** | Andreani no tiene API |

---

## 14.5 Lo que Andreani obliga a construir y Zipnova no

Esta es la lista del trabajo extra. Es la respuesta honesta a "si ya tengo Zipnova, ¿cuánto cuesta Andreani?".

| # | Trabajo extra | Por qué | Documento |
|---|---|---|---|
| 1 | **Gestión de token con expiración** | Zipnova no expira; Andreani sí, y no documenta el TTL | `02` §2.2.1 |
| 2 | **Idempotencia propia de tres capas** | Sin idempotency key y sin cancelación, un duplicado es irreversible | `06` §6.5 |
| 3 | **Modelo de N contratos por tenant** | Zipnova: un `account_id`. Andreani: N contratos por canal y modalidad | `02` §2.4 |
| 4 | **Cotizaciones múltiples en paralelo** | Una llamada por contrato para ofrecer domicilio y sucursal | `05` §5.2 |
| 5 | **Plazo de entrega de fuente propia** | Andreani no lo devuelve | `05` §5.6 |
| 6 | **Normalización de localidades contra el catálogo** | Andreani valida el string exacto | `03` §3.5 |
| 7 | **Catálogo de estados construido a mano** | No está publicado. Se obtiene en el alta del webhook | `08` §8.3 |
| 8 | **Catálogo de errores construido en producción** | Andreani no publica códigos de error | `11` §11.2 |
| 9 | **Polling caro** (envío por envío) | Sin filtros documentados en el masivo | `09` §9.5 |
| 10 | **Flujo de cancelación manual con instrucciones** | No hay API | `06` §6.7 |
| 11 | **Alta manual del webhook** | No es self-service | `09` §9.1 |
| 12 | **Parser de errores tolerante a dos esquemas** | Dos formatos incompatibles | `11` §11.1 |
| 13 | **Manejo de PDF sin ZPL** | Zipnova tiene ZPL; Andreani (hasta confirmar) no | `07` §7.2 |
| 14 | **Alta comercial como dependencia bloqueante** | No hay sandbox público | `12` §12.1 |
| 15 | **IP fija de salida** (probable) | Whitelisting documentado en GlobAllPack | `02` §2.3 |

---

## 14.6 Lecciones de diseño

Comparar las dos APIs deja tres conclusiones que van más allá de Andreani.

**1. `CarrierCapabilities` no es sobre-ingeniería.** La diferencia entre Zipnova (cancela, devuelve, ZPL, webhook self-service) y Andreani (nada de eso) es tan grande que sin capacidades declaradas el código se llena de condicionales por carrier. Con capacidades, el panel admin decide qué botón mostrar preguntándole al carrier, no a un `if`.

**2. Guardar el estado crudo no es opcional.** Zipnova publica 29 estados y aun así no publica los subestados. Andreani publica 4. Un dominio que solo guarda el estado neutral pierde información que después no se puede recuperar. `raw_status_code` + `raw_reason_code` + el payload en `jsonb` es la diferencia entre poder reprocesar un histórico y no poder.

**3. Cuanto peor la documentación del carrier, más valor tiene la capa de anticorrupción.** Con Zipnova, un cliente HTTP fino alcanzaría. Con Andreani, la capa de traducción es lo único que evita que la ambigüedad de la API (dos enums de estado, dos esquemas de error, dos ids de sucursal, dos numeraciones de teléfono) se filtre al dominio. **El costo de la capa se paga solo con Andreani.**
