# 03 — Modelos de cobro disponibles y decisión

---

## 1. Inventario de modalidades

Del código de los SDKs oficiales se desprenden **cinco** formas de cobrar con Payway.

### A. API directa con tokenización (SDK JS de frontend + API v2 de backend)

El comprador tipea la tarjeta en **nuestro** formulario. El `decidir.js` (o un `POST /tokens` directo desde el browser) intercambia los datos de la tarjeta por un **token de un solo uso**. Nuestro backend ejecuta `POST /payments` con ese token y la API key privada.

- **Los datos de tarjeta nunca tocan nuestro backend.**
- Fuente: https://github.com/payway-ar/sdk-javascript-ventaonline + https://raw.githubusercontent.com/payway-ar/sdk-node-ventaonline/master/lib/services/payments.js

| | |
|---|---|
| **Ventajas** | Control total de la UI. Sin redirects. Funciona en SPA. Un solo flujo para todas las tiendas. Soporta 3DS, cuotas, tokenización de tarjetas guardadas, pagos distribuidos. |
| **Desventajas** | Hay que construir y mantener el formulario de tarjeta, la grilla de cuotas y el manejo de errores. Más superficie de testing. |
| **PCI-DSS** | **SAQ A-EP.** El PAN no pasa por nuestros servidores, pero servimos la página que lo captura → somos responsables de la integridad de esa página. |
| **Control de UI** | ★★★★★ |

### B. API directa PCI (card_data en el request)

`POST /payments` con el objeto `card_data` conteniendo el PAN, CVV, vencimiento y titular **en claro**, desde nuestro backend.

- Fuente: `Decidir/lib/Payment/DataPCI.php`, `Model/CardData.cs`, README .NET sección "Ejecución del pago PCI".

| | |
|---|---|
| **Ventajas** | Máximo control. Permite flujos server-to-server sin browser (call center, suscripciones). |
| **Desventajas** | Nos convierte en entorno de datos de titular de tarjeta. |
| **PCI-DSS** | **SAQ D / certificación completa.** Auditoría anual, segmentación de red, cifrado, retención. Costo real de seis cifras. |
| **Control de UI** | ★★★★★ |

> **Descartado de plano para Tiendafy.** Requiere que la plataforma sea PCI-DSS Nivel 1. No es viable.

### C. Formulario hosted embebido (`/web/validate` + `/web/forms/{hash}`)

Backend hace `POST /web/validate` con los datos de la operación y recibe un `hash`. El browser se redirige a `GET /web/forms/{hash}?apikey={public_key}`, donde Payway renderiza **su** formulario con el template configurado para ese comercio. Al pagar, Payway redirige a `success_url` o `cancel_url`.

- Fuente: README del SDK .NET, sección "Formulario de Pago"; `RESTClient::setUrl()` del SDK PHP.

| | |
|---|---|
| **Ventajas** | Mínima superficie PCI. Payway mantiene el formulario, las cuotas y las validaciones. |
| **Desventajas** | **El template es único por comercio y lo genera Payway** (`site.template.id`). En multi-tenant significa gestionar N templates con Payway, uno por tienda. Salimos del dominio de Tiendafy en medio del checkout. Personalización limitada. |
| **PCI-DSS** | **SAQ A.** |
| **Control de UI** | ★★☆☆☆ |

### D. Checkout / Botón de pago con link (`POST /api/v1/checkout-payment-button/link`)

Backend genera un link de pago (`payment_id`) y redirige al comprador a la página de checkout de Payway.

- Fuente: https://raw.githubusercontent.com/payway-ar/sdk-node-ventaonline/master/lib/services/checkout.js

| | |
|---|---|
| **Ventajas** | El más simple de integrar. Es el único modelo con un campo `notifications_url` (posible webhook — **GAP-06**). Soporta `plan_gobierno` (Ahora 12/18) como flag. |
| **Desventajas** | Redirect completo fuera del sitio. `template_id` fijo (1 = sin Cybersource, 2 = con Cybersource). Muy poca personalización. |
| **PCI-DSS** | **SAQ A.** |
| **Control de UI** | ★☆☆☆☆ |

### E. Pagos offline (cupón: Rapipago, Pago Fácil, Cobro Express, Pago Mis Cuentas)

`POST /payments` con `payment_mode: "offline"` y un `payment_method_id` de la familia offline (25, 26, 41, 48, 51). Genera un cupón con vencimiento.

- Fuente: README del SDK .NET, sección "Ejecución del Pago Offline".
- **No es una alternativa a A–D**, es un medio de pago adicional. Requiere polling para saber si se pagó (no hay webhook confirmado).

---

## 2. Comparativa

| Criterio | A. API + tokenización | B. API PCI | C. Form hosted | D. Checkout link |
|---|---|---|---|---|
| Datos de tarjeta en nuestro backend | ❌ No | ✅ Sí | ❌ No | ❌ No |
| Nivel PCI-DSS | SAQ A-EP | SAQ D | SAQ A | SAQ A |
| Control de UI | Total | Total | Bajo | Mínimo |
| Redirect fuera del sitio | No | No | Sí | Sí |
| Esfuerzo de integración | Alto | Alto | Medio | Bajo |
| Grilla de cuotas propia | Sí (la armamos) | Sí | No (la trae el template) | No |
| Multi-tenant sin fricción | ✅ Sí (solo cambian keys) | ✅ | ⚠️ N templates a gestionar con Payway | ⚠️ N configs |
| Soporta 3DS | ✅ | ✅ | ✅ (implícito) | ✅ (`auth_3ds`) |
| Soporta tarjetas guardadas | ✅ | ✅ | ✅ | GAP |
| Soporta pago distribuido | ✅ | ✅ | ✅ | GAP |
| Posible webhook | ❌ | ❌ | ❌ | ⚠️ `notifications_url` (GAP-06) |

---

## 3. Decisión para Tiendafy: **Modelo A — API directa con tokenización**

### Justificación

1. **UI propia en Next.js 15 es un requisito duro.** El checkout de Tiendafy es parte del producto; mandar al comprador a un formulario de Payway con branding ajeno rompe la propuesta de valor de una plataforma tipo Tiendanube. Descarta C y D.

2. **No queremos tocar datos de tarjeta.** El PAN va del browser directo a Payway vía `POST /tokens`; nuestro backend .NET solo ve un UUID. Descarta B.

3. **Multi-tenancy limpia.** En el modelo A, cambiar de tienda es cambiar `site_id` + par de keys. Nada más. En C hay que dar de alta y mantener un `template_id` por tienda **del lado de Payway**, lo que introduce una dependencia operativa externa por cada tienda nueva. Eso es inaceptable para una plataforma SaaS que quiere onboarding rápido.

4. **Paridad con la integración de Mercado Pago ya resuelta.** MP con Checkout API + tokenización via SDK JS es exactamente la misma forma: token en el browser, pago en el backend. Eso hace que el `IPaymentGateway` sea una abstracción honesta y no una fuga de conceptos. Ver `13-payway-vs-mercadopago.md`.

5. **Es el único modelo que expone todo el contrato.** Cuotas, promociones, 3DS, tokenización de tarjetas guardadas, pagos distribuidos, devoluciones parciales — todo está disponible en `POST /payments`. Los modelos hosted esconden parte de eso detrás del template.

### Costo de la decisión (asumirlo conscientemente)

- Somos responsables del formulario de tarjeta: validación de Luhn, detección de marca por BIN, máscara de campos, accesibilidad.
- Somos responsables de la **grilla de cuotas**, y como no hay endpoint de promociones (**GAP-09**), hay que cargar los planes a mano por tenant. Ver `06-cuotas-y-promociones.md`.
- Somos responsables de traducir ~30 códigos de rechazo a mensajes útiles. Ver `10-errores-y-codigos.md`.
- Caemos en **SAQ A-EP**, no en SAQ A. Implica escaneos ASV trimestrales del sitio del checkout y control de cambios sobre esa página. Ver `07-seguridad-3ds-pci.md`.

### Alternativa de contingencia

Si durante la certificación Payway exige el formulario hosted (algunos comercios lo tienen impuesto por contrato), el fallback es **C**, no D — C al menos permite pago embebido y conserva más datos de la operación. En ese escenario, el `IPaymentGateway` cambia de `AuthorizeAsync(token, ...)` a `CreateCheckoutSessionAsync(...)`, que es una operación que la interfaz ya debe contemplar porque Mercado Pago Checkout Pro la usa.

---

## 4. Medios de pago adicionales: recomendación de fase 2

Los pagos offline (Rapipago, Pago Fácil) son un diferencial real en Argentina, pero:
- Requieren polling agresivo o conciliación por reporte (**GAP-06**, **GAP-15**).
- El estado de la orden queda "pendiente de pago" por días, lo que obliga a manejar reserva de stock con expiración.

**No incluirlos en el MVP.** Backlog fase 3 en `12-plan-de-implementacion.md`.
