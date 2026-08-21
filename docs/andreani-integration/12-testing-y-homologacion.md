# 12 — Testing y homologación

Responde las preguntas 30 y 31 del checklist.

## 12.1 El sandbox de Andreani no es un sandbox

Conviene decirlo de entrada porque afecta la planificación: **no existe un sandbox público de Andreani.**

| Lo que uno esperaría | Lo que hay |
|---|---|
| Registro self-service en un portal de developers | 🟢 *"The credentials will be provided previously" / "Contact your salesperson"* |
| Credenciales de prueba publicadas | ⛔ **No existen** |
| Contrato de prueba compartido | ⛔ **No existe** |
| Datos de prueba documentados | ⛔ **No existen** |
| Botón "generar API key" | ⛔ No existe |

El ambiente QA (`https://apisqa.andreani.com`) **sí existe y está documentado**, pero requiere credenciales nominadas entregadas por Andreani.

### Los valores que circulan no son credenciales

| Valor | Qué es realmente |
|---|---|
| `300006611` | 🟢 Valor de **ejemplo** en la documentación. No hay indicación de que sea funcional |
| `400018110` | 🟡 Ejemplo en el README de un SDK comunitario |
| `alejo` / `sotelo` / `CL0009999` | 🟡 **Placeholders del autor de un SDK.** El propio README aclara que no tiene afiliación con Andreani |

> **Consecuencia para el cronograma: el alta comercial es una dependencia bloqueante.** No se puede desarrollar contra QA sin pasarla. **Iniciarla el día uno del proyecto, en paralelo con todo lo demás.** Ver `13-plan-de-implementacion.md` §13.4, Fase 0.

## 12.2 Restricciones del ambiente QA

🟢 Documentadas para GlobAllPack, sobre **el mismo host** `apisqa.andreani.com`:

| Restricción | Detalle | ¿Aplica a la API nacional? |
|---|---|---|
| **Whitelisting por IP** | "doble control de acceso: uno por usuario y otro por **restricciones x IP**". HTTP 403 = problema de IP | 🔵 Probable. **Confirmar** |
| **Horario 08:00–20:00 ART** | QA solo disponible en ese rango | 🔵 Probable. **Confirmar** |
| **Extensión de horario** | Solicitar al equipo de IT "una extensión por **15 días corridos**" | 🔵 idem |
| Producción 24/7 | Sin restricción horaria | 🟢 |

**Si el horario aplica, hay dos impactos concretos:**

1. **CI/CD no puede correr tests de integración fuera de las 08:00–20:00.** Los tests contra Andreani tienen que estar en una suite separada, con un tag propio, que se saltea fuera de horario y no rompe el pipeline.
2. Un release nocturno no se puede validar contra QA.

**Si el whitelisting aplica**, el runner de CI y el backend necesitan **IP de salida estática**. En cloud eso significa NAT gateway con IP fija. Es una tarea de infraestructura con lead time propio: **planificarla en Fase 0**.

## 12.3 Datos y escenarios de prueba

⛔ **Andreani no publica direcciones de prueba, ni forma de forzar estados, ni escenarios de excepción.**

### Cómo armar la batería de pruebas igual

**Direcciones de prueba:** construirlas desde `GET /localidades`, que es público y no requiere auth. Es la única fuente confiable de pares (localidad, CP) válidos.

Cobertura mínima sugerida:

| Escenario | Por qué |
|---|---|
| CABA (`C.A.B.A.`, CP 1002) | Zona de mayor volumen |
| GBA (partido del conurbano) | Zona distinta de reparto |
| Capital de provincia (Córdoba 5000, Rosario 2000) | Interior con cobertura plena |
| Localidad chica del interior | Prueba de plazos y cobertura |
| Patagonia (Ushuaia 9410) | Tarifas y plazos extremos |
| Localidad con nombre ambiguo | Prueba de normalización |
| Localidad con acentos y caracteres especiales | Prueba de encoding |
| **CP inexistente** (ej. 9999) | **Prueba negativa: qué error devuelve** |
| **Localidad mal escrita** | **Prueba negativa** |
| **CUIT con dígito verificador inválido** | **Prueba negativa** |
| Email de destinatario de 45 caracteres | **Prueba del límite de 40** |
| Bulto de volumen > 999999.999 cm³ | **Prueba del límite `6,3`** |

**Las pruebas negativas son las que más valen**, porque son las que van a poblar el catálogo de errores que Andreani no publica (`11-errores-y-codigos.md` §11.2). Documentar el `code`, `property` y `message` de cada una.

### Cómo forzar estados de tracking

⛔ **No hay mecanismo documentado para forzar estados en QA.**

Opciones, en orden:

1. **Preguntarle a Andreani.** Muchos carriers tienen números de envío mágicos o un panel de QA. Vale la pena preguntar antes de asumir que no existe.
2. **Envíos reales en QA y esperar.** Si QA está conectado a una operación simulada, los estados avanzan solos con el tiempo. Lento pero real.
3. **Mock del carrier para tests automatizados.** Es lo que hay que hacer de todos modos: un stub HTTP (WireMock.Net) que reproduce las respuestas de Andreani, incluidos los JSON de ejemplo de la documentación, para poder testear la máquina de estados sin depender de la red.

**Regla:** la máquina de estados y el mapeo se testean **contra el mock**, no contra QA. QA sirve para validar el contrato HTTP (que el request se acepte), no para testear lógica de dominio.

## 12.4 ¿Hay homologación obligatoria?

⛔ **No hay evidencia de un proceso formal de homologación publicado.** Se buscó específicamente "homologación", "certificación", "pasaje a producción" y "checklist de integración" en dominios Andreani, sin resultado.

**Pero sí hay gating administrativo real**, que en la práctica funciona como una homologación informal:

| Control | Evidencia |
|---|---|
| Credenciales entregadas a mano, no self-service | 🟢 *"The credentials will be provided previously"* |
| **Habilitación de features endpoint por endpoint** | 🟢 Trazas: *"you need to configure your username by the Andreani team"* |
| Flujo secuencial QA → PROD | 🟡 TiendaQuick: primero testing, después se solicitan las de producción |
| Whitelisting de IP | 🟢 GlobAllPack |
| Activación administrativa de cuenta | 🟢 CRM comercial de Andreani |

**Conclusión honesta:** no hay batería de casos de prueba obligatoria ni certificado. Hay una **secuencia de habilitaciones manuales** con lead time desconocido. Eso es peor que una homologación formal, porque no se puede planificar contra un checklist conocido.

**Acción:** pedirle a Andreani, por escrito, la lista de pasos y habilitaciones necesarias para llegar a producción, con lead times. Que quede documentado aunque ellos no lo publiquen.

## 12.5 Estrategia de testing por capa

```
┌──────────────────────────────────────────────────────────────┐
│ E2E (manual, en QA)                                          │
│ Cotizar → crear orden → descargar etiqueta → IMPRIMIR →      │
│ escanear el código de barras → consultar trazas              │
│ Frecuencia: antes de cada release que toque el carrier       │
├──────────────────────────────────────────────────────────────┤
│ Integración (automatizada, contra QA)                        │
│ Un test por endpoint que valida que el request se acepta.    │
│ Tag [Trait("Category","AndreaniQA")], excluido del pipeline  │
│ por defecto (horario de QA + credenciales).                  │
│ Corre en un job nocturno... salvo que QA cierre a las 20:00. │
├──────────────────────────────────────────────────────────────┤
│ Contrato (automatizada, contra mock)                         │
│ WireMock.Net con los JSON de ejemplo oficiales.              │
│ Valida serialización, deserialización, mapeo de errores.     │
│ Corre siempre, en cada commit.                               │
├──────────────────────────────────────────────────────────────┤
│ Unitarias                                                    │
│ Validadores (CP, CUIT, longitudes), cálculo de bultos,       │
│ mapeo de estados, clave de cache, política de reintentos.    │
│ Sin red. Corre siempre.                                      │
└──────────────────────────────────────────────────────────────┘
```

**El grueso del valor está en las dos capas de abajo**, que no dependen de Andreani. La lógica de negocio (bultos, cache, mapeo de estados, degradación) se testea sin red. Eso es lo que permite avanzar mientras se espera el alta comercial.

### Tests que no se pueden saltear

| Test | Capa | Por qué |
|---|---|---|
| `telefonos.tipo` usa el enum correcto según rol | Unitaria | Es la trampa más silenciosa de la API |
| Parseo de tarifa con `InvariantCulture` | Unitaria | `"5806.97"` con cultura es-AR = 580697 |
| Normalización de localidad contra catálogo | Unitaria | Causa #1 de rechazos |
| Idempotencia: dos mensajes con la misma referencia → un solo envío | Integración | Previene envíos duplicados irreversibles |
| 401 → re-login → reintento único | Contrato | Ver `02` §2.2.1 |
| Estado desconocido → `UNKNOWN` + alerta, sin excepción | Unitaria | Un `throw` acá es un incidente |
| Circuito abierto → checkout sigue funcionando sin Andreani | Integración | El checkout no se cae por un carrier |
| Etiqueta impresa y **escaneada físicamente** | E2E manual | Sin ZPL documentado, el rasterizado del PDF es un riesgo real |

## 12.6 Checklist de homologación con Andreani

Para ejecutar en QA antes de pedir credenciales de producción. Cada ítem con evidencia (request, response, captura).

**Conectividad y auth**
- [ ] `POST /login` en QA devuelve `x-authorization-token`
- [ ] El token se acepta en un endpoint autenticado
- [ ] Se mide el TTL real del token (¿24 h?)
- [ ] Un 401 dispara re-login y reintento transparente
- [ ] Se verifica si hay restricción por IP (probar desde otra IP)
- [ ] Se verifica el horario de disponibilidad de QA

**Datos maestros**
- [ ] `GET /localidades` sin auth, catálogo completo descargado a PostgreSQL
- [ ] `GET /sucursales` descargado
- [ ] `GET /puntos-de-tercero?contrato=X&codigoPostal=Y` filtra correctamente
- [ ] **Se determina qué `id` de sucursal va en `destino.sucursal.id`** (el de `/sucursales` o el de `/puntos-de-tercero`)

**Cotización**
- [ ] **Se confirma el path del endpoint de cotización** (`/tarifas` vs `/v1/tarifas`) probando ambos
- [ ] **Se confirma el contrato exacto de la cotización** (GAP-01): parámetros, obligatoriedad, si requiere token
- [ ] Se confirman los paths de tracking (`/envios/...` vs `/v2/envios/...`) probando ambos
- [ ] Cotiza a domicilio y a sucursal con los dos contratos
- [ ] Cotiza con múltiples bultos y se verifica que agregue
- [ ] Los importes se parsean correctamente con `InvariantCulture`
- [ ] Se prueba un CP fuera de cobertura y se documenta el error
- [ ] Se contrasta `pesoAforado` contra el peso real para inferir el factor de aforo

**Creación de orden**
- [ ] Orden a domicilio con un bulto
- [ ] Orden a sucursal con un bulto
- [ ] Orden con 3 bultos y `referencias[idCliente]` compartido → verificar agrupación
- [ ] Se confirma el código HTTP de éxito (200 o 202)
- [ ] Se prueban las validaciones negativas y **se documentan `code`/`property`/`message`**
- [ ] **Se confirma si `idPedido` existe en la versión vigente y si es consultable**
- [ ] **Se confirma cuál body es el vigente**: el de `/documentacion` o el del esquema beta

**Etiquetas**
- [ ] Se descarga la etiqueta desde `linking[meta=Etiqueta]`
- [ ] Se prueban los dos paths alternativos y se documenta cuál responde
- [ ] Se verifica el formato (¿PDF? ¿hay ZPL?)
- [ ] **Se imprime físicamente y se escanea el código de barras**
- [ ] Se descarga dos veces y se compara: ¿la etiqueta es estable?
- [ ] Se prueba `?tipo=documentoDeCambio`

**Tracking**
- [ ] **Se solicita la habilitación del endpoint de trazas** para el usuario
- [ ] `GET /envios/{n}/trazas` devuelve eventos
- [ ] `GET /envios/{n}` devuelve el estado agregado
- [ ] **Se confirman los filtros de `GET /envios`** (masivo)
- [ ] **Se obtiene el catálogo completo de `EstadoId` y `MotivoId`**
- [ ] Se prueba `multimedia` en un envío entregado

**Webhook**
- [ ] Se define el contrato del endpoint receptor y se acuerda con Andreani
- [ ] Se acuerdan los "Client Codes" de `event` y `reason` → **esto entrega el catálogo de estados**
- [ ] Se recibe al menos un evento en QA
- [ ] Se verifica idempotencia enviando el mismo `idTraza` dos veces

**Operación**
- [ ] Se documentan los rate limits observados
- [ ] Se verifica el comportamiento ante 429 y 5xx
- [ ] Se confirma el procedimiento de anulación de un envío no despachado

## 12.7 GAPs de este documento

| ID | GAP | Pregunta a Andreani |
|---|---|---|
| GAP-03 | Sin sandbox público ni datos de prueba | ¿Cómo obtengo credenciales de QA? ¿Cuál es el SLA? ¿Hay datos o direcciones de prueba? |
| — | Forzar estados en QA | ¿Hay forma de simular estados de tracking (números mágicos, panel)? |
| — | Homologación | ¿Existe un proceso formal? ¿Qué habilitaciones necesito y con qué lead time? ¿Hay acta o certificado? |
| — | Horario y IP de QA | ¿QA nacional tiene restricción horaria? ¿Whitelisting de IP? ¿Soporta CIDR? |
| — | Tarifas de QA | ¿Las tarifas de QA son representativas o ficticias? |
