# 00 — Cobertura de fuentes

> **Fecha de relevamiento:** 2026-08-21
> **Relevado por:** agente de investigación (Claude), usando exclusivamente fetch/búsqueda web pública.
> **Alcance:** documentación pública de Andreani para desarrolladores, más fuentes de terceros usadas **solo** como pista para GAPs (nunca como fuente de verdad).

## 0.1 Convención de etiquetado de fuentes

Todo dato de esta especificación está etiquetado con una de estas marcas. Si un dato no tiene marca, es un GAP.

| Marca | Significado | Se puede implementar sobre esto |
|---|---|---|
| 🟢 **OFICIAL** | Publicado por Andreani en un dominio `*.andreani.com` / `*.andreanigloballpack.com`, o en un plugin publicado por Andreani | Sí |
| 🟡 **TERCERO** | SDK comunitario, integrador, plugin no oficial, manual de otra plataforma | **No sin validar contra QA**. Sirve para saber qué probar |
| 🔵 **INFERENCIA** | Deducción propia a partir de datos oficiales. Explicitada como tal | No. Es hipótesis a confirmar |
| ⛔ **GAP** | No documentado en ninguna fuente accesible | No. Requiere consulta a Andreani |

## 0.2 Hallazgo estructural del relevamiento

La documentación de Andreani **no está en un solo lugar y no es completa en ninguno**. Está partida en cuatro superficies que no se referencian entre sí, con productos distintos y hasta esquemas de error distintos.

```
developers.andreani.com/                → SPA. No sirve contenido a un fetch (JS-only). Sin sitemap.
developers.andreani.com/document        → SPA vacía. Es la URL del brief; NO rinde contenido.
developers.andreani.com/documentacion   → ★ ÚNICA página con la referencia REST de transporte.
                                           Monolítica, en inglés, sin versionado ni changelog.
developers.andreani.com/{apis,soporte,faq,changelog,swagger,postman,glosario,...} → 404

developers-sandbox.andreani.com/        → Docusaurus + plugin OpenAPI. Sitemap de 83 URLs.
  ├── "Producción" → Fulfillment / WMS   (Datos Maestros, Ingreso Mercadería, Stock, Salida de Pedidos)
  └── "Beta"       → Transporte y distribución → Alta orden → Creación de una nueva orden de envío

developers.andreanigloballpack.com/     → Producto SEPARADO: courier internacional (GlobAllPack).
                                           8 APIs. Subpáginas /Apis/*/summary/ devuelven 403.

apis.andreani.com  /  apisqa.andreani.com → Gateways productivo y QA. 403 sin credenciales.
andreani.docs.apiary.io                   → Apiary legacy. Requiere JS. Sin contenido extraíble.
```

**Consecuencia práctica:** la fuente canónica para integrar envíos de e-commerce nacional es **`https://developers.andreani.com/documentacion`**. Todo el resto es complemento o producto distinto.

## 0.3 Registro de URLs visitadas

### Dominio `developers.andreani.com`

| URL | Estado | Qué se extrajo |
|---|---|---|
| `https://developers.andreani.com/` | Vacía (SPA) | Solo metadata + GTM. Sin nav ni contenido |
| `https://developers.andreani.com/document` | Vacía (SPA) | Nada. Indexada en Google pero no renderiza sin JS |
| `https://developers.andreani.com/documentacion` | **OK** | Referencia REST completa: auth, órdenes de envío, etiquetas, trazas, tracking, tarifas, sucursales, puntos de tercero, localidades, multimedia, almacenes, notificaciones PUSH, QR/barras. **25 secciones** |
| `https://developers.andreani.com/robots.txt` | OK | `User-agent: * / Allow: /`. Sin `Sitemap:` |
| `https://developers.andreani.com/sitemap.xml` | 404 | No existe |
| `/documentation`, `/apis`, `/api`, `/soporte`, `/support`, `/productos`, `/sandbox`, `/faq`, `/changelog`, `/swagger`, `/swagger.json`, `/openapi.json`, `/postman`, `/glosario`, `/inicio`, `/index.html`, `/api/documents`, `/document/EnviosDeEcommerce` | 404 | — |

### Dominio `developers-sandbox.andreani.com`

| URL | Estado | Qué se extrajo |
|---|---|---|
| `/` | OK | Home. "Probá nuestras APIs". Catálogo OpenAPI + emulador online + ambiente de pre-producción |
| `/sitemap.xml` | OK | **83 URLs**. Base del árbol de la sección 0.4 |
| `/beta` | OK | Home del entorno Beta |
| `/docs/andreani/beta/creacion-de-una-nueva-orden-de-envio` | OK (parcial) | Esquema OpenAPI completo del body y de las respuestas 202/400/500. **Sin método HTTP, sin path, sin base URL, sin ejemplos, sin enums, sin descripciones de campo** (se renderizan por JS y no sobreviven al fetch) |
| `/docs/andreani/prueba-andreani-sandbox-document-apis` | OK | Esquema de seguridad del sandbox: `apiKey` en header `Authorization`, formato `Bearer {token}` (JWT). Versión `v1`. Footer "Copyright 2023" |
| `/docs/andreani/obtener-acondicionamiento` | OK | Segundo esquema de error (ProblemDetails RFC 7807). Códigos 200/400/401/404/500 |
| `/docs/category/andreani/*` (16 categorías) | OK | Estructura del árbol. Descripciones son placeholders literales ("Datos Maestros descripción") |
| `/openapi.json`, `/openapi/andreani.json`, `/openapi/andreani.yaml`, `/api/andreani.json`, `/swagger.json`, `/andreani.json` | 404 | **El spec OpenAPI crudo no está expuesto públicamente** |
| `/markdown-page` | OK | Página de ejemplo por defecto de Docusaurus. Sin valor |

### Dominio `developers.andreanigloballpack.com`

| URL | Estado | Qué se extrajo |
|---|---|---|
| `/` | OK | Índice de 8 APIs internacionales. Proceso de acceso, doble control (usuario + **whitelisting de IP**), horario de QA 08:00–20:00 ART, extensión de 15 días corridos, **token con vigencia de 24 h**, login en `apis.andreani.com/login` y `apisqa.andreani.com/login` |
| `/Apis/{Preenvio,Traza,Cotizador,Cupo,Impuesto,InfoVuelo,InfoGuia,NovedadesStandard}/summary/` | **403 / robots** | ⛔ No leídas. Confirmadas por sitemap e índice. `NovedadesStandard` figura como **deprecada** |
| `/sitemap.xml` | OK (roto) | 20 URLs con prefijo literal `None` en vez del dominio. Sitemap malformado del lado de Andreani |

### Otros dominios Andreani

| URL | Estado | Qué se extrajo |
|---|---|---|
| `https://apis.andreani.com/` | 403 | Existe. Gateway productivo. Sin credenciales no devuelve nada |
| `https://apisqa.andreani.com/` | 403 | Existe. Gateway QA |
| `https://apis.andreani.com/swagger/index.html` | 404 | No hay Swagger UI expuesto |
| `https://comercial.andreani.com/` | OK | Dashboard interno de la fuerza de ventas. Confirma el modelo de alta: prospecto → nuevo cliente → **activación de cuenta**, sobre Microsoft Dynamics CRM |
| `https://www.andreani.com/`, `pymes.andreani.com`, `corporativo.andreani.com`, `mi.andreani.com` | Vacías (SPA) | ⛔ No legibles por fetch. Son SPAs |
| `https://wordpress.org/plugins/andreani-shipping/` (**plugin oficial de Andreani**) | OK | Tiers PyME / Corporate / Middle Market. "Credential ID" emitido por `pymes.andreani.com/integraciones/` o `corporativo.andreani.com/woocommerce` |
| `https://andreani.docs.apiary.io/` | Vacía | Requiere JS. Sin contenido |

### Fuentes de terceros consultadas (solo para GAPs)

| URL | Para qué se usó |
|---|---|
| `github.com/alejoasotelo/andreani-sdk-rest` (+ `src/Andreani.php`, `DOCS.md`, `examples/procesoDeEnvio.php`) | Parámetros de `/v1/tarifas`, path y `?tipo=` de etiquetas, afirmación "en la nueva API no se pueden cancelar envíos" |
| `github.com/Lucasponzoni/Test-Envios` | Query string real de `/v1/tarifas` con dimensiones |
| `github.com/muzzatech/Andreani-Api` | Segundo ejemplo de query de tarifas, contrato `400018110` |
| `github.com/nchsala/andreani` | Confirma `CONTRATO_DOMICILIO` + `CONTRATO_SUCURSAL` + `CODIGO_CLIENTE` como config mínima |
| `github.com/romeroyonatan/py-andreani` | **API SOAP legacy** (`e-andreani.com/.../CotizacionEnvio.svc?wsdl`). No mezclar con REST |
| `alejoasotelo.github.io/andreani-api-docs` | Doc no oficial. Response de tarifas **no coincide** con el oficial → poca confianza |
| `manual.tiendaquick.com/.../andreani`, `shop.wanderlust-webdesign.com/.../Wanderlust-ANDREANI-PREMIUM-1.pdf` | Trampas de identificadores: contrato "WS" vs ".com", código de cliente vs número de cliente, usuario terminado en `_gla`, flujo QA → PROD |
| `ayuda.tiendanube.com/es_ES/andreani/*`, `empretienda.helpjuice.com/andreani`, `ayuda.zippin.app`, `apps.shopify.com/shipy-app` | Modelos de multi-tenancy usados en el mercado |
| `docs.zipnova.com/*` | Documento 14 (comparativa Andreani vs Zipnova) |
| `rastrearpaquetes.com/donde-esta-mi-envio-andreani/` | **DESCARTADA**. Tabla de estados SEO que no coincide con los strings reales de la API |

## 0.4 Árbol de la documentación

### `developers.andreani.com/documentacion` — 25 secciones, en este orden

```
 1. Introduction
 2. Authentication                                    → POST login
 3. Create a new order                                → POST ordenes-de-envio
 4. Get a new order                                   → GET  ordenes-de-envio/{numeroAndreani}
 5. Get a label                                       → (mismo path que 4; ver GAP-06). Link real: v2/{numeroDeEnvio}/etiquetas
 6. Get the traces of a shipment                      → GET  envios/{numeroAndreani}/trazas
 7. Get a shipment                                    → GET  envios/{numeroAndreani}
 8. Shipping tracking                                 → GET  envios
 9. Get the rate of a shipment                        → GET  tarifas   (🟡 SDKs usan /v1/tarifas)
10. List all branches                                 → GET  sucursales
11. Branch by contract                                → GET  puntos-de-tercero   (solo canal B2C)
12. List all multimedia                               → GET  envios/{numeroAndreani}/multimedia
13. Localidades de la República Argentina             → GET  localidades          (SIN auth)
14. Post Orders                                       → POST almacenes/{idAlmacen}/pedidos
15. Post Ordens                                       → POST almacenes/{idAlmacen}/orden-de-compra
16. Get a label  (título erróneo)                     → GET  almacenes/stock
17. Post Orders  (título erróneo)                     → POST almacenes/{idAlmacen}/lotes
18. Post Order confirmation (PUSH de Andreani)        → URL a definir por el cliente
19. Mantenimiento de artículos                        → POST almacenes/productos/{codigoArticulo}/mantenimiento
20. Consulta de stock                                 → GET  almacenes/productos/{codigoArticulo}/mantenimiento/{idTransaccion}
21. Confirmación de recepción de mercadería (PUSH)    → URL a definir por el cliente
22. Register a recipient                              → POST almacenes/destinatarios
23. Movimientos de envíos a un WS del cliente (PUSH)  → URL a definir por el cliente  ★ webhook de tracking
24. QR Code                                           → GET  codigos-qr/{informacion}
25. Bar code                                          → GET  codigos-de-barras/{informacion}
```

> Las secciones 14–22 son del producto **Fulfillment / almacenes**, fuera del alcance de Tiendafy en esta etapa.
> Los títulos duplicados y erróneos ("Get a label" para stock, "Post Orders" repetido) están así en la página. Es un indicio del nivel de mantenimiento de esta documentación.

### `developers-sandbox.andreani.com` — árbol completo

```
Producción  →  Fulfillment / WMS
├── Datos Maestros                        /docs/category/andreani/datos-maestros
│   ├── Artículo
│   │   ├── Envío de solicitud de alta de productos
│   │   └── Método para consulta de solicitud
│   └── Lote
│       ├── Alta de lote  (envía / consulta)
│       └── Cambio de estado de lote  (envía / busca)
├── Ingreso de Mercadería                 /docs/category/andreani/ingreso-de-mercaderia
│   └── Recepción Mercadería  (Abastecimiento Solicitada / Transacción de Abastecimiento)
├── Stock                                 /docs/category/andreani/stock
│   ├── Traslado            (Traslado de Mercadería / Obtener)
│   ├── Cambio de propietario (Propietario SKU / Obtener)
│   ├── Acondicionamiento   (Acondicionamiento / Obtener)
│   └── Kitting             (Kitting / Obtener)
└── Salida de Pedidos                     /docs/category/andreani/salida-de-pedidos
    ├── Pedidos             (Generar solicitud de alta / Consultar)
    └── Facturación/Remito  (Datos de facturación / Transacción)

Beta  →  Transporte y distribución        /docs/category/andreani/beta/Transporte-y-distribución
└── Alta orden
    └── Creación de una nueva orden de envío   ★ único endpoint de envíos con esquema OpenAPI
        desc: "Generacion de ordenes de envio B2C y B2C" (sic, errata del sitio)

Suelta: Prueba Andreani-Sandbox Document API's   (esquema de seguridad del sandbox)
Espejo completo en inglés bajo /docs/andreani/en/... y /docs/category/andreani/en/...
```

### `developers.andreanigloballpack.com` — producto internacional (fuera de alcance)

```
Preenvío · Traza · Cotizador · Cupo (importación/CUIT) · Impuesto (aranceles)
InfoVuelo · InfoGuía · Novedades Standard (DEPRECADA)
```
Las primitivas *Cupo*, *Impuesto* e *InfoVuelo* confirman que es **comercio exterior**: no aplica a envíos domésticos.

## 0.5 Contenido que quedó inaccesible

| Recurso | Motivo | Impacto |
|---|---|---|
| `developers.andreani.com/document` y todo `developers.andreani.com/` | SPA con render por JavaScript | Alto — es la URL del brief. Si el portal tiene contenido adicional al de `/documentacion`, no lo vimos |
| Método HTTP, path, base URL y ejemplos de las páginas OpenAPI del sandbox | Se renderizan por JS | Medio — el esquema de campos sí se extrajo |
| Spec OpenAPI/Swagger crudo (`.json`/`.yaml`) | No expuesto. 6 rutas candidatas → 404 | Alto — sin él no hay generación automática de cliente |
| `developers.andreanigloballpack.com/Apis/*/summary/` | 403 consistente en 5+ intentos | Bajo — es producto internacional |
| `www.andreani.com`, `pymes.andreani.com`, `corporativo.andreani.com`, `mi.andreani.com` | SPAs | Medio — el proceso de alta comercial no se pudo verificar de primera mano |
| Búsqueda de código en `github.com/search?type=code` | Bloqueado por robots.txt | Bajo |
| `andreani.docs.apiary.io` | Requiere JS | Bajo — es legacy |

## 0.6 Advertencia metodológica honesta

El fetch de páginas web pasa el HTML por un modelo resumidor. Eso significa dos cosas que hay que tener presentes al leer esta spec:

1. **No se puede distinguir con certeza absoluta entre "el dato no está en la página" y "el resumidor lo descartó".** Donde hubo señal de esto último (resultados inconsistentes entre pasadas sobre la misma URL) está marcado como **NO EXTRAÍDO** en vez de **GAP**.
2. Los datos marcados 🟢 OFICIAL fueron corroborados en **al menos dos pasadas independientes** sobre la misma URL con prompts distintos. Los JSON de ejemplo se reprodujeron idénticos entre pasadas, lo que da confianza alta sobre ellos.

Antes de escribir la primera línea de código de producción, el paso correcto es **abrir `https://developers.andreani.com/documentacion` en un navegador y validar a mano** la tabla de parámetros de `tarifas`, el path exacto del endpoint y la sección de etiquetas (los GAPs más caros).

> **Nota de la pasada de verificación (§0.8):** una revisión final contra la fuente detectó que **el path `/v1/tarifas` no aparece en la documentación oficial** — la página escribe `Method: tarifas`, sin versión. El `/v1/` proviene de SDKs de terceros. Ver `04-api-reference.md` §4.10.

## 0.7 Índice de GAPs abiertos

Ver `11-errores-y-codigos.md` §11.6 y `01-resumen-ejecutivo.md` §1.7 para el detalle y las preguntas a soporte.

| ID | GAP | Criticidad |
|---|---|---|
| GAP-01 | Parámetros de entrada de `GET /tarifas` no publicados, y path ambiguo (`/tarifas` vs `/v1/tarifas`) | 🔴 Bloqueante |
| GAP-02 | Catálogo completo de `EstadoId` / `MotivoId` no publicado | 🔴 Bloqueante |
| GAP-03 | Alta de credenciales y acceso a QA solo por ejecutivo comercial. Sin sandbox público | 🔴 Bloqueante |
| GAP-04 | Sin endpoint de cancelación / anulación | 🟠 Alta |
| GAP-05 | Sin API de devoluciones / logística inversa | 🟠 Alta |
| GAP-06 | Etiquetas: path ambiguo, formatos y tamaños no documentados | 🟠 Alta |
| GAP-07 | Sin catálogo de valores de `code` / `message` de error | 🟠 Alta |
| GAP-08 | Sin rate limits, timeouts, SLA ni status page | 🟠 Alta |
| GAP-09 | TTL del token `x-authorization-token` no documentado para la API nacional | 🟡 Media |
| GAP-10 | Sin idempotency key documentada | 🟡 Media |
| GAP-11 | Webhook de movimientos: sin payload de ejemplo, sin firma, sin política de reintentos | 🟡 Media |
| GAP-12 | Valores válidos de `tipoServicio` no enumerados | 🟡 Media |
| GAP-13 | Multi-tenancy: si un `user/password` puede operar N contratos | 🟠 Alta |
| GAP-14 | Endpoint de cobertura por CP: no existe como tal | 🟡 Media |
| GAP-15 | Sin etiquetas en lote ni manifiesto de despacho generable | 🟡 Media |
| GAP-16 | Sin prueba de entrega estructurada (solo `multimedia` con links) | 🟡 Media |
| GAP-17 | Relación entre `EstadoId` (traza) y `estadoId` (envío) no documentada — son enumeraciones distintas | 🟠 Alta |
| GAP-18 | Whitelisting de IP: documentado para GlobAllPack, sin confirmar para la API nacional | 🟠 Alta |

---

## 0.8 Verificación del checklist de 31 preguntas

Pasada final: cada pregunta del brief, con dónde está respondida y con qué nivel de certeza.

**Leyenda:** ✅ respondida con fuente suficiente para implementar · ⚠️ respondida en parte, con GAP declarado que no impide diseñar · ⛔ GAP duro, sin respuesta verificada

### Alta, credenciales y ambientes

| # | Pregunta | Estado | Dónde | Fuente / GAP |
|---|---|---|---|---|
| 1 | Alta de cliente/comercio, obtención de credenciales, requisitos comerciales | ⚠️ | `02` §2.1 | 🟢 Proceso vía ejecutivo comercial confirmado. ⛔ Requisitos formales y lead time (GAP-03) |
| 2 | Autenticación: mecanismo, header, TTL, renovación, expiración en vuelo | ⚠️ | `02` §2.2 | 🟢 `POST /login` Basic → header `x-authorization-token`. ⛔ TTL (GAP-09). Estrategia de renovación propuesta |
| 3 | Ambientes, base URLs, credenciales por ambiente, cómo pedir sandbox | ⚠️ | `02` §2.3 | 🟢 `apis.andreani.com` / `apisqa.andreani.com`. ⛔ Cómo solicitar acceso (GAP-03) |
| 4 | Identificadores de negocio y relación con multi-tenant | ✅ | `02` §2.4 | 🟢 `contrato` tipado por canal, `cliente`, `sucursalClienteID`, centro de imposición. ⛔ GAP-13 secundario |

### Catálogo de servicios

| # | Pregunta | Estado | Dónde | Fuente / GAP |
|---|---|---|---|---|
| 5 | Productos y modalidades con su código/ID interno | ⛔ | `03` §3.1 | **GAP-12.** No hay tabla ni enum. Solo dos ejemplos entre comillas. La modalidad se expresa por la forma de `destino` y por el contrato |
| 6 | Endpoint de sucursales / puntos de retiro | ✅ | `03` §3.2–3.3 | 🟢 `GET /sucursales` y `GET /puntos-de-tercero` con 12 filtros. ⚠️ Ambigüedad del `id` a resolver en QA |
| 7 | Endpoint de cobertura por CP; qué pasa con destinos no cubiertos | ⚠️ | `03` §3.4 | **GAP-14.** No existe endpoint de cobertura. Se deriva de `puntos-de-tercero` y de la cotización. ⛔ Error de "fuera de cobertura" no documentado |

### Cotización

| # | Pregunta | Estado | Dónde | Fuente / GAP |
|---|---|---|---|---|
| 8 | Campos del request de cotización, tipos, obligatoriedad, formato | ⛔ | `04` §4.2, `05` §5.3 | **GAP-01. El más crítico.** La doc oficial no publica ningún parámetro. Los documentados son 🟡, de dos SDKs que convergen |
| 9 | Peso y dimensiones: unidades, peso volumétrico, quién lo calcula | ⚠️ | `05` §5.4 | 🟢 kg, cm, cm³, con precisiones declaradas. 🟢 Andreani calcula el aforo (`pesoAforado`). ⛔ Fórmula no publicada |
| 10 | Respuesta: desglose, impuestos, plazo, vigencia | ✅ | `05` §5.5–5.6 | 🟢 Desglose con/sin IVA + seguro. **Confirmado que NO devuelve plazo ni TTL** |
| 11 | Viabilidad de cache, rate limits, estrategia Redis | ✅ | `05` §5.7–5.8 | Estrategia completa con clave, TTL e invalidación. ⛔ Rate limits (GAP-08) |

### Generación del envío

| # | Pregunta | Estado | Dónde | Fuente / GAP |
|---|---|---|---|---|
| 12 | Contrato completo de creación de orden | ✅ | `04` §4.3 | 🟢 Tabla completa de campos, incluidos anidados. ⚠️ Conflicto de versión con el esquema beta, documentado |
| 13 | Múltiples bultos y número de seguimiento por bulto | ✅ | `06` §6.4 | 🟢 `bultos[]`, un `numeroDeEnvio` por bulto, agrupación con `referencias[meta=idCliente]` |
| 14 | Qué devuelve la creación; identificador estable a persistir | ✅ | `06` §6.4 | 🟢 `bultos[].numeroDeEnvio` es la clave. No hay id único de envío |
| 15 | Idempotencia | ⛔ | `06` §6.5 | **GAP-10.** No existe. Estrategia propia de tres capas propuesta |
| 16 | Modificar o cancelar un envío generado | ⛔ | `06` §6.7 | **GAP-04.** No existe endpoint. Corroborado por ausencia en las 25 secciones y por 🟡 SDK |

### Etiquetas y documentación

| # | Pregunta | Estado | Dónde | Fuente / GAP |
|---|---|---|---|---|
| 17 | Cómo se obtiene la etiqueta, formatos, tamaños, embebida o aparte | ⚠️ | `07` §7.1–7.2 | 🟢 Link por bulto en `linking`. **GAP-06:** path ambiguo, solo PDF, sin ZPL ni tamaños |
| 18 | Etiquetas en lote; remito o manifiesto de despacho | ⛔ | `07` §7.3–7.4 | **GAP-15.** No existen. Solución propia propuesta |
| 19 | Qué imprimir y requisitos físicos | ⛔ | `07` §7.5 | No documentado. Verificado que las cadenas de impresión no aparecen en la doc |

### Tracking

| # | Pregunta | Estado | Dónde | Fuente / GAP |
|---|---|---|---|---|
| 20 | Endpoint de seguimiento por número y/o por referencia propia | ⚠️ | `08` §8.1 | 🟢 Por número. ⛔ **Por referencia propia no existe**, y el masivo no tiene filtros documentados |
| 21 | Máquina de estados completa | ⛔ | `08` §8.3–8.5 | **GAP-02.** Solo 4 `EstadoId` y 1 `MotivoId`, de ejemplos. **GAP-17:** dos enumeraciones distintas. Tabla de mapeo con placeholders |
| 22 | Webhooks o polling | ✅ | `09` | 🟢 Webhook invertido documentado con sus 5 campos. ⛔ GAP-11 en firma y reintentos. Estrategia de polling adaptativo propuesta |
| 23 | Prueba de entrega | ⚠️ | `08` §8.7 | **GAP-16.** `multimedia` devuelve links a constancias, no datos estructurados |

### Logística inversa y excepciones

| # | Pregunta | Estado | Dónde | Fuente / GAP |
|---|---|---|---|---|
| 24 | Devoluciones / logística inversa | ⛔ | `10` §10.1 | **GAP-05.** Sin API. 🔵 Hipótesis: contrato de retorno con origen/destino invertidos |
| 25 | Gestión de excepciones: reprogramar, corregir | ⛔ | `10` §10.2 | Sin API para actuar. La API solo **informa** vía `Motivo`. Taxonomía por acción propuesta |
| 26 | Reclamos, siniestros y seguro | ⚠️ | `10` §10.3 | 🟢 `valorDeclaradoSinImpuestos` y `seguroDistribucion`. ⛔ Sin API de reclamos, sin topes ni procedimiento |

### Errores y operación

| # | Pregunta | Estado | Dónde | Fuente / GAP |
|---|---|---|---|---|
| 27 | Tabla completa de códigos de error con mensajes | ⚠️ | `11` §11.1–11.2 | 🟢 **Dos esquemas** de error documentados. **GAP-07:** ni un valor de `code` publicado. Tabla operativa por HTTP propuesta |
| 28 | Rate limits, timeouts, SLA, 429/5xx, mantenimiento | ⛔ | `11` §11.4 | **GAP-08.** Nada publicado. Sin status page. Parámetros defensivos propuestos |
| 29 | Validación de datos argentinos: CP, localidad, CUIT | ⚠️ | `11` §11.5 | 🟢 Formatos y longitudes de la doc + catálogo de `/localidades`. ⛔ Comportamiento de la API ante datos inválidos |

### Testing y homologación

| # | Pregunta | Estado | Dónde | Fuente / GAP |
|---|---|---|---|---|
| 30 | Datos de prueba en sandbox, forzar estados, probar excepciones | ⛔ | `12` §12.3 | **No existen.** Estrategia con `/localidades` + mock HTTP propuesta |
| 31 | Proceso de certificación/homologación obligatorio | ⚠️ | `12` §12.4 | 🟢 No hay proceso formal publicado, pero **sí gating administrativo real** (habilitación por endpoint, whitelisting, activación de cuenta) |

### Resultado

| Métrica | Valor |
|---|---|
| Preguntas tratadas | **31 / 31** |
| ✅ Respondidas con fuente suficiente | **8** (4, 6, 10, 11, 12, 13, 14, 22) |
| ⚠️ Parciales, con GAP declarado y diseño posible | **12** (1, 2, 3, 7, 9, 17, 20, 23, 26, 27, 29, 31) |
| ⛔ GAPs duros | **11** (5, 8, 15, 16, 18, 19, 21, 24, 25, 28, 30) |
| **Implementable sin esperar respuesta de Andreani** | **20 / 31** |

## 0.9 GAPs ordenados por criticidad para el desarrollo

### 🔴 Bloqueantes — sin esto no se avanza

| # | GAP | Impacto | Fase afectada |
|---|---|---|---|
| 1 | **GAP-01 — Parámetros y path de `tarifas`** | Sin el contrato de cotización no hay checkout. Es el endpoint peor documentado y el más importante | Fase 1 |
| 2 | **GAP-03 — Alta comercial y credenciales de QA** | No hay sandbox público. Bloquea toda validación contra la API real. **Lead time externo desconocido** | Fase 0 |
| 3 | **GAP-02 — Catálogo de `EstadoId` / `MotivoId`** | Sin él no se clasifican excepciones ni se notifica bien. Se obtiene en el alta del webhook | Fase 3 |
| 4 | **Consulta por referencia propia** | Sin ella, la reconciliación tras un timeout no se puede automatizar. Agrava GAP-10 | Fase 2 |

### 🟠 Alta — condicionan el diseño

| # | GAP | Impacto | Fase |
|---|---|---|---|
| 5 | **GAP-04 — Sin cancelación ni modificación** | Un envío duplicado o mal generado es irreversible. Condiciona worker, panel y proceso operativo | Fase 2 |
| 6 | **GAP-10 — Sin idempotencia** | Junto con GAP-04, el riesgo más caro de la integración | Fase 2 |
| 7 | **GAP-13 — Un usuario ↔ N contratos** | Define el modelo de datos de credenciales por tenant | Fase 1 |
| 8 | **GAP-18 — Whitelisting de IP** | Si aplica, es infraestructura con lead time propio. Puede bloquear el primer request | Fase 0 |
| 9 | **GAP-17 — Dos enumeraciones de estado** | Confundirlas produce un mapeo silenciosamente incorrecto | Fase 3 |
| 10 | **GAP-06 — Etiquetas: path, formato, ZPL** | Sin ZPL hay riesgo operativo real en depósitos con impresora térmica | Fase 2 |
| 11 | **GAP-08 — Rate limits, SLA, status page** | Obliga a dimensionar a ciegas y a construir observabilidad propia | Fase 1 |
| 12 | **GAP-07 — Sin catálogo de errores** | Los mensajes al operador arrancan genéricos y mejoran solo con el uso | Fase 2 |
| 13 | **GAP-05 — Sin API de devoluciones** | Deja la logística inversa como proceso manual | Fase 5 |
| 14 | **Versión vigente del body de creación** | La doc principal y el esquema beta tienen tipos incompatibles | Fase 2 |

### 🟡 Media — se puede avanzar con supuestos documentados

| # | GAP | Impacto | Fase |
|---|---|---|---|
| 15 | GAP-09 — TTL del token | Mitigado con TTL conservador + re-login ante 401 | Fase 1 |
| 16 | GAP-12 — Valores de `tipoServicio` | Se usan los dos ejemplos de la doc | Fase 1 |
| 17 | GAP-14 — Cobertura por CP | Se deriva de la cotización | Fase 1 |
| 18 | Plazo de entrega | Se resuelve con configuración por tenant | Fase 1 |
| 19 | Fórmula del peso aforado | No impide integrar; impide predecir costos offline | Fase 1 |
| 20 | Ambigüedad del `id` de sucursal | Se resuelve con una prueba en QA | Fase 1 |
| 21 | GAP-11 — Detalles del webhook | El contrato lo definimos nosotros | Fase 4 |
| 22 | GAP-15 — Etiquetas en lote y manifiesto | Se resuelve del lado de Tiendafy | Fase 2 |
| 23 | GAP-16 — Prueba de entrega | Se exponen los links y listo | Fase 3 |
| 24 | Requisitos físicos de impresión | Se valida con una prueba física | Go-live |
| 25 | Datos de prueba y forzado de estados | Se resuelve con mock HTTP | Fase 1 |
| 26 | Proceso de homologación | Se pide la lista de habilitaciones por escrito | Fase 0 |

---

## 0.10 Registro de la pasada de verificación

Al cerrar la especificación se corrió una **verificación independiente** de 26 afirmaciones estructurales contra la fuente oficial, con prompts de fraseo neutral para evitar confirmaciones de complacencia del resumidor. Las afirmaciones más propensas a alucinación (la asimetría de `telefonos.tipo` entre remitente y destinatario, la obligatoriedad de `volumenCm`, la existencia de `codigosPostalesAtendidos`) se reverificaron con una segunda llamada no dirigida.

**Resultado: 25 de 26 confirmadas. 1 corregida.**

| Afirmación | Veredicto | Acción tomada |
|---|---|---|
| El path de cotización es `/v1/tarifas` | **CONTRADICHA** | Corregido en toda la spec. La documentación oficial escribe `Method: tarifas`, **sin prefijo de versión**; la cadena `v1` no aparece en ninguna parte de la página. El `/v1/` proviene de dos SDKs de terceros. Ahora se documentan ambas variantes con su fuente, y se agregó al checklist de homologación la prueba de las dos |
| Las otras 25 | CONFIRMADAS con cita textual | — |

**Ajustes de precisión derivados de la misma pasada:**

- La URL de la etiqueta vive en la clave **`contenido`** del elemento de `linking`; `meta` es el rótulo `"Etiqueta"`. Aclarado en `04` §4.4 y `07` §7.1.
- La documentación no habla de "longitud" sino de *"Máximo caracteres guardados"*. Aclarado en `04` §4.3.
- Por el mismo motivo que el path de tarifas, se revisaron los paths de tracking: la doc oficial los escribe **sin `/v2/`**. El único `/v2/` literal de la página es el de la URL de etiqueta. Documentado como ambigüedad a resolver en QA (`04` §4.10, `08` §8.1).

> **Lección del relevamiento:** en una documentación de esta calidad, la diferencia entre "lo que dice la fuente" y "lo que hacen los SDKs que la usan" es material y frecuente. Por eso cada dato de esta spec lleva su marca de origen. **Cuando un dato 🟡 contradice a uno 🟢, gana el 🟢 y la discrepancia se documenta como algo a probar** — nunca se resuelve por plausibilidad.
