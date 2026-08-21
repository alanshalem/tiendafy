# 01 — Resumen ejecutivo

---

## 1. Qué es Payway

Payway (ex **Decidir**, de Prisma Medios de Pago) es el gateway de pagos online más establecido de Argentina para cobros con tarjeta. Su API pública vigente es la **v2**, con endpoints REST/JSON sobre `developers.decidir.com` (sandbox) y `ventasonline.payway.com.ar` (producción).

Es un gateway **clásico**: procesa tarjetas de crédito y débito de todas las marcas locales, más pagos offline con cupón (Rapipago, Pago Fácil, Cobro Express, Pago Mis Cuentas). No es una billetera ni un ecosistema de pagos. Eso lo hace más simple de integrar en algunos aspectos y notablemente más manual en otros.

### Lo que hay que saber antes de leer el resto

Tres hallazgos definen la forma de esta integración:

1. **No hay API de promociones ni de planes de cuotas.** Los tres plugins oficiales de Payway (WooCommerce, PrestaShop, Magento) administran las promociones en tablas locales del comercio. Tiendafy tiene que construir ese módulo.
2. **No hay webhooks.** El flujo principal es sincrónico y para los casos pendientes hay que hacer polling.
3. **No hay idempotencia.** No existe `Idempotency-Key`. La prevención de cobros duplicados es enteramente responsabilidad nuestra.

Ninguno de los tres es bloqueante, pero los tres cambian el diseño y el esfuerzo.

---

## 2. Advertencia metodológica

**El portal oficial de developers de Payway no fue accesible desde el entorno de relevamiento.** `developers.payway.com.ar`, `docs.payway.com.ar` y `documentacion-ventasonline.payway.com.ar` son SPAs con HTML vacío, y el proxy de red del entorno bloquea esos dominios. Tampoco se pudo acceder a `web.archive.org`.

Toda esta especificación se construyó a partir del **código fuente de los SDKs y plugins oficiales de Payway publicados en GitHub** (organización `payway-ar`), más fuentes de tercero explícitamente marcadas.

Esto tiene una ventaja: **el código es más confiable que la prosa para los contratos HTTP**, porque es lo que efectivamente se ejecuta. Y una desventaja concreta: las **tablas de referencia** (códigos de rechazo vigentes, tarjetas de prueba, semántica de cada estado) no viven en el código y quedan parcialmente cubiertas o declaradas como GAP.

Detalle completo en `00-cobertura-fuentes.md`.

---

## 3. Modelos de cobro y recomendación

| Modelo | PCI | Control de UI | Recomendación |
|---|---|---|---|
| **A. API directa con tokenización** | SAQ A-EP | Total | ✅ **ELEGIDO** |
| B. API PCI (card_data) | SAQ D | Total | ❌ Requiere certificación PCI Nivel 1 |
| C. Formulario hosted | SAQ A | Bajo | ⚠️ Contingencia |
| D. Checkout / link de pago | SAQ A | Mínimo | ❌ Redirect completo |
| E. Pagos offline (cupón) | — | — | ⏭️ Fase 3, no es alternativa sino medio adicional |

### Decisión: **Modelo A — API directa con tokenización**

El comprador tipea la tarjeta en nuestro formulario de Next.js. El `decidir.js` intercambia esos datos por un token de un solo uso **directamente contra Payway** — el PAN nunca toca nuestro backend. El backend .NET ejecuta `POST /payments` con ese token y la API key privada del tenant.

**Por qué:**
1. UI propia es un requisito duro del producto. Descarta C y D.
2. No queremos ser entorno de datos de tarjeta. Descarta B.
3. **Multi-tenancy limpia**: cambiar de tienda es cambiar `site_id` + par de keys. En el modelo hosted habría que gestionar un `template_id` por tienda **del lado de Payway**, lo que introduce una dependencia operativa externa por cada tienda nueva.
4. Es el mismo patrón que ya usamos con Mercado Pago, lo que hace que la abstracción `IPaymentGateway` sea honesta y no una fuga de conceptos.

Justificación completa en `03-modelos-de-cobro.md`.

### Modelo multi-tenant elegido

**Un tenant = un `site_id` + un set de credenciales propio**, guardadas cifradas y resueltas en runtime. Payway soporta además pago distribuido (`sub_payments[]`) y modelo agregador (`aggregate_data`), pero ambos tienen implicancias contractuales y regulatorias que no justifican asumirlas en el MVP. Detalle en `02-alta-y-credenciales.md` §4.

---

## 4. Esfuerzo estimado

| Fase | Alcance | Estimación |
|---|---|---|
| **0. Descubrimiento** | Credenciales de sandbox, cierre de GAPs bloqueantes, fixtures | **1 semana** 🔴 |
| **1. Núcleo del cobro** | `IPaymentGateway`, modelo de datos, tokenización, pago, idempotencia, recuperación ante timeout | **2–3 semanas** |
| **2. Cuotas y post-venta** | Módulo de promociones, grilla de cuotas, devoluciones, notas de crédito | **2–3 semanas** |
| **3. Reconciliación** | Polling, conciliación diaria, métricas, alertas | **1–2 semanas** |
| **4. Opcionales** | 3DS, Cybersource, tarjetas guardadas, offline, distribuido | Según prioridad |
| | **Total MVP productivo (fases 0–3)** | **6–9 semanas** |

Fuera de esa estimación, y en el camino crítico: **la certificación con Payway y el alta comercial**, cuyos plazos dependen de ellos.

### De dónde sale el esfuerzo

El delta contra una integración "estándar" está en tres lugares, y conviene tenerlo presente al negociar el plazo:

- **~1 semana** solo por el módulo de administración de promociones y cuotas, que con Mercado Pago sería una llamada a la API.
- **~1 semana** por la estrategia de idempotencia y reconciliación, que con `Idempotency-Key` sería un header.
- **~0,5 semana** por la traducción de códigos de rechazo a mensajes de usuario.

---

## 5. Cobertura del checklist de 26 preguntas

| # | Pregunta | Estado | Dónde |
|---|---|---|---|
| 1 | Alta de comercio y tipos de credenciales | ✅ | `02` §1, §2 |
| 2 | Ambientes y base URLs | ✅ ⚠️ | `02` §3 — **GAP-11** en el host productivo |
| 3 | `site_id` / multi-tenant | ✅ | `02` §4 |
| 4 | Todas las formas de cobrar | ✅ | `03` §1, §2 |
| 5 | Recomendación justificada | ✅ | `03` §3 |
| 6 | Secuencia completa del happy path | ✅ | `05` §1, §2 |
| 7 | Tokenización: endpoint, payload, TTL, single-use | ⚠️ **PARCIAL** | `04` §2 — **el TTL exacto es GAP**, hay que medirlo |
| 8 | Ejecución del pago: request y response completos | ✅ | `04` §3 |
| 9 | Idempotencia | ✅ | `05` §6 — **no existe**, estrategia propia propuesta |
| 10 | Máquina de estados | ✅ ⚠️ | `05` §4 — **GAP-04** en 4 estados |
| 11 | Autorización vs. captura | ❌ **GAP-16** | `04` §5 — el endpoint existe, el contrato de entrada no está documentado |
| 12 | Medios de pago con sus IDs | ⚠️ **CONFLICTO** | `06` §2 — **GAP-12**, dos tablas en circulación |
| 13 | Cuotas y promociones, CFT/TEA, costo financiero | ✅ | `06` §4 — **no hay API (GAP-09)**, modelo local documentado |
| 14 | Consulta de BIN | ❌ **NO EXISTE** | `06` §5 — **GAP-10** |
| 15 | 3D Secure completo | ⚠️ **PARCIAL** | `07` §1 — **falta el paso del browser en el challenge** |
| 16 | Antifraude | ✅ ⚠️ | `07` §2 — **GAP** en device fingerprint y semántica de decisiones |
| 17 | PCI-DSS y qué no persistir | ✅ | `07` §3 |
| 18 | Devoluciones totales y parciales | ✅ | `08` §2, §3 |
| 19 | Anulación vs. devolución | ✅ ⚠️ | `08` §1 — **GAP** en el horario del cierre de lote |
| 20 | Consulta de transacciones | ✅ | `08` §6 |
| 21 | Webhooks | ✅ | `09` §1 — **no existen (GAP-06)**, estrategia de polling propuesta |
| 22 | Conciliación | ⚠️ **PARCIAL** | `09` §4 — **GAP-15**, sin reportes documentados |
| 23 | Tabla de códigos de error y mensajes al comprador | ⚠️ **PARCIAL** | `10` §3 — **GAP-02**, ~30 códigos cubiertos, faltan varios |
| 24 | Timeouts, rate limits, 5xx | ⚠️ **PARCIAL** | `10` §5 — **GAP-07** en rate limits |
| 25 | Tarjetas de prueba | ⚠️ **PARCIAL** | `11` §2 — **GAP-05**, tabla de tercero de alta confiabilidad |
| 26 | Probar devoluciones y webhooks en sandbox | ✅ | `11` §4, §5 |

**Resultado: 14 respondidas con fuente verificada, 10 parciales con GAP declarado, 2 sin respuesta (11 y 14).**
Ninguna de las parciales bloquea el MVP; las que sí bloquean están en la fase 0 del backlog.

---

## 6. Pendiente de confirmar — preguntas para soporte de Payway

Copiar y pegar en el ticket. Ordenadas por prioridad.

### 🔴 Bloqueantes para empezar

1. **Credenciales de sandbox.** Necesitamos nuestro propio `site_id`, `public_key` y `private_key` de sandbox. ¿Cuál es el procedimiento y el plazo?

2. **Host de producción.** Sus propios SDKs apuntan a hosts distintos: el SDK .NET usa `https://live.decidir.com/api/v2/`, el SDK Node y el Java usan `https://ventasonline.payway.com.ar/api/v2`, y el SDK PHP embebido en el plugin de WooCommerce usa `https://api.decidir.com/api/v2/`. **¿Cuál es el host productivo correcto y vigente para un comercio nuevo?**

3. **Tabla vigente de `payment_method_id`.** Encontramos dos tablas en circulación: la clásica (Mastercard=15, Maestro=99, Cabal débito=67) y una más nueva usada por integraciones productivas (Mastercard crédito=104, Mastercard débito=105, Maestro=106, Cabal débito=108, Discover=139). **¿Cuál aplica a un comercio dado de alta hoy? ¿Nos pueden enviar la tabla completa y vigente?**

4. **TTL del token de pago.** ¿Cuánto tiempo vive un token devuelto por `POST /api/v2/tokens` antes de expirar? ¿Es estrictamente de un solo uso? ¿Qué respuesta devuelve la API si se reutiliza un token ya consumido?

### 🟠 Definen la arquitectura

5. **Webhooks / notificaciones asíncronas.** ¿Payway ofrece notificaciones server-to-server para `POST /api/v2/payments`? Vimos un campo `notifications_url` en el checkout hosted (`/api/v1/checkout-payment-button/link`), pero no encontramos especificación. Si existe:
   - ¿Cuál es el payload?
   - ¿Cómo se valida la autenticidad (firma HMAC, secreto compartido, rango de IPs)?
   - ¿Cuál es la política de reintentos?
   - ¿Está disponible para la API directa o solo para el checkout hosted?

   Si **no** existe, ¿cuál es la estrategia de conciliación recomendada?

6. **API de promociones y cuotas.** Sus tres plugins oficiales administran los planes de cuotas localmente. **¿Existe algún endpoint para consultar las promociones y planes vigentes de un comercio?** Si no, ¿cómo se mantienen sincronizados los coeficientes cuando cambian las promociones bancarias?

7. **Modelo marketplace / multi-tienda.** Somos una plataforma SaaS de e-commerce con múltiples tiendas del mismo grupo. **¿Cuál es el modelo que recomiendan?**
   - ¿Un `site_id` y un set de credenciales por tienda?
   - ¿Pago distribuido (`sub_payments[]`)? ¿Qué requiere habilitarlo?
   - ¿Modelo agregador (`aggregate_data`)? ¿Qué requisitos contractuales y regulatorios tiene?

   ¿Hay algún proceso de onboarding simplificado para dar de alta tiendas nuevas de forma recurrente?

8. **Pre-autorización y captura en dos pasos.** Vimos `PUT /api/v2/payments/{id}` (llamado `CapturePayment`/`confirmPayment` en los SDKs) y el estado `pre_approved`. **¿Cómo se solicita una pre-autorización?** ¿Es un flag en `POST /payments`, un `payment_mode`, o configuración del site? ¿Cuál es el plazo máximo para capturar y qué ocurre si no se captura?

### 🟡 Necesarias para completar la implementación

9. **Tabla completa de códigos de rechazo.** Necesitamos la tabla vigente de `status_details.error.reason.id` de la **API v2**, con descripción oficial por medio de pago. Nos faltan al menos los códigos 58, 62, 63, 65, 89, 94, 98 y 99, y los específicos de Cabal y Naranja.

10. **Semántica de los estados.** El enum de estados incluye `accredited`, `adhered`, `reversed` y `cancelled`. **¿Qué significa cada uno y en qué circunstancias se devuelven?** ¿En qué se diferencia `pre_approved` de `accredited`?

11. **Tarjetas de prueba oficiales.** ¿Nos pueden enviar la tabla oficial de tarjetas de sandbox, y el mecanismo para forzar cada escenario de rechazo (fondos insuficientes, tarjeta reportada, límite excedido)? ¿Existen emails "mágicos" de Cybersource además de `accept@decidir.com.ar` (por ejemplo `reject@` o `review@`)?

12. **3D Secure: paso del browser.** Cuando `POST /payments` devuelve `status: "challenge pending"` con un `instruction_value`, **¿qué debe hacer exactamente el browser?** ¿Se postea a una URL del ACS? ¿Se abre un iframe? ¿El `instruction_value` es un JWT? No encontramos esto documentado en ninguno de sus SDKs. ¿Hay un ejemplo de implementación de referencia?

13. **Rate limits.** ¿Cuáles son los límites de requests por segundo/minuto de la API v2? ¿Devuelven `429` con `Retry-After`?

14. **Cierre de lote.** ¿A qué hora se hace el cierre de lote? Es lo que define si una reversa es anulación o devolución, y necesitamos poder informarlo en nuestro panel.

15. **Reportes de conciliación.** ¿Qué reportes hay disponibles (formato, frecuencia, canal de acceso)? ¿Hay API o solo descarga desde el portal de comercios? ¿Incluyen el TID para cruzar contra las transacciones?

16. **Device fingerprint de Cybersource.** Si activamos el módulo antifraude, ¿cuál es el script de device fingerprint a embeber y el `org_id` correspondiente? ¿Qué significan exactamente las decisiones `green`, `yellow`, `red`, `black` y `BLUE`?

17. **Código de provincia.** En su tabla de provincias para Cybersource, **Entre Ríos y Río Negro figuran ambas con el código `R`**. ¿Cuál es el código correcto de cada una?

18. **Planes Ahora 12 / Ahora 18.** En el checkout hosted hay un flag `plan_gobierno`. **¿Cómo se informa un plan de gobierno en la API directa (`POST /api/v2/payments`)?** ¿Con el campo `plan_id`? ¿Con un valor específico de `installments`?

---

## 7. Riesgos de la integración

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| **R1** | **Cobros duplicados por ausencia de idempotencia** | Media | 🔴 **Crítico** | Tres capas de defensa: lock en Redis, `site_transaction_id` determinístico + constraint única en PostgreSQL, y reconciliación obligatoria por `siteOperationId` ante toda incertidumbre. **Política de retry de Polly restringida a GET**, con test de no-regresión. Ver `05` §6 y `12` §4.1 |
| **R2** | **Ausencia de API de promociones** obliga a un módulo de administración manual | **Alta** (confirmado) | 🟠 Alto | Aceptado en el plan: fase 2 completa. Riesgo residual: **desincronización** entre los coeficientes cargados y las promociones bancarias reales, que puede hacernos cobrar de menos. Mitigación: proceso operativo mensual de revisión + alerta cuando una promoción esté por vencer |
| **R3** | **Ausencia de webhooks** obliga a polling | **Alta** (confirmado) | 🟡 Medio | El flujo principal es sincrónico, así que el impacto es acotado. Cola de reconciliación con backoff en RabbitMQ. Diseño preparado para absorber webhooks si aparecen, sin refactor |
| **R4** | **Onboarding manual de cada tienda** con Payway | **Alta** | 🟠 Alto | **Riesgo de negocio, no técnico.** Comunicarlo al producto: el time-to-value del onboarding con Payway no es comparable al de Mercado Pago. Preguntar por un proceso simplificado (pregunta 7) |
| **R5** | **Certificación con Payway** puede exigir cambios o demorar | Media | 🟠 Alto | Iniciar la conversación **antes** de terminar la fase 1. Preparar la batería de pruebas de `11` §6.3 con anticipación. Contemplar el fallback al formulario hosted en el diseño de la interfaz |
| **R6** | **Tabla de `payment_method_id` incorrecta** → rechazos masivos de una marca | Media | 🟠 Alto | Tabla en base de datos (`payment_provider_method_map`) con override por tenant. Un cambio es un `UPDATE`, no un deploy. Alerta si la tasa de aprobación de una marca cae abruptamente |
| **R7** | **Host de producción equivocado** (GAP-11) | Media | 🔴 Crítico | Base URL parametrizable por tenant (`base_url_override`). Confirmar por escrito antes del go-live (pregunta 2) |
| **R8** | **Error de unidad en el monto** (centavos vs. pesos) | Media | 🔴 **Crítico** | Value Object `Money` con propiedades explícitas `AmountInCents` / `AmountInMajorUnits`. Columna `amount_cents bigint`. **Nunca una variable llamada `amount` a secas.** Test unitario dedicado |
| **R9** | **Tratar el `402` como error HTTP** y perder el detalle del rechazo | **Alta** (es el error más común) | 🟡 Medio | Test unitario dedicado al `402`. Documentado en `10` §1. Code review específico sobre el `HttpClient` |
| **R10** | **3DS obligatorio impuesto por las marcas** durante el proyecto | Baja-Media | 🟠 Alto | `IPaymentGateway` modela `RequiresAction` desde el MVP aunque no se implemente. Recolectar datos de browser desde el día uno. Cerrar la pregunta 12 antes de que sea urgente |
| **R11** | **Rate limit desconocido** alcanzado en producción | Baja | 🟡 Medio | Bulkhead de 10 concurrentes por tenant. Backoff exponencial en el polling. Nunca polling de estados terminales |
| **R12** | **Fuga de PCI en logs o trazas** | Media | 🔴 Crítico | `SanitizingLogHandler` obligatorio en el pipeline del `HttpClient`. Test automatizado que verifica que los logs no contienen PAN/CVV/apikey. Revisión de la configuración de APM. `PaywayCredentials.ToString()` sobreescrito |
| **R13** | **La abstracción `IPaymentGateway` se erosiona** con el tiempo | **Alta** | 🟡 Medio | Test de arquitectura que falla si `Application` referencia tipos de `Infrastructure.Payments.Payway`. Es la protección más barata y efectiva del diseño |
| **R14** | **Un tenant mal configurado afecta a los demás** | Media | 🟠 Alto | Circuit breaker **por tenant**, no global. Test explícito de aislamiento. Alerta cuando un breaker se abre |

### Los tres que hay que vigilar

Si hay que elegir dónde poner la atención del equipo:

1. **R1 (cobros duplicados)** — es el único riesgo con consecuencias legales y de reputación difíciles de revertir.
2. **R8 (unidad del monto)** — es silencioso: no falla, cobra mal, y solo se descubre en la conciliación.
3. **R4 (onboarding manual)** — es el que puede invalidar el caso de negocio, y no se resuelve con código.
