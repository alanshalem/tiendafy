# 02 — Alta, credenciales y ambientes

---

## 1. Alta del comercio

Payway no expone un alta self-service por API. El proceso es **comercial y manual**:

1. El comercio contrata Payway (ex Decidir / Prisma Medios de Pago) y obtiene un **número de sitio** (`site` / `site_id` / merchant).
2. El equipo de soporte entrega las credenciales por mail. La fuente lo dice explícitamente:

> *"Ambas API Keys serán provistas por el equipo de Soporte de Payway (soporte@payway.com.ar)."*
> — https://github.com/payway-ar/sdk-net-ventaonline (README, sección "Inicializar la clase correspondiente al conector")

3. Antes de habilitar producción hay una instancia de **certificación / homologación** contra el ambiente sandbox. El SDK .NET incluso define un ambiente `AMBIENTE_HOMO = 4` distinto de sandbox y de producción (https://raw.githubusercontent.com/payway-ar/sdk-net-ventaonline/master/Solution/Decidir/Constants/Ambiente.cs).

> **GAP-08 / GAP-15:** el detalle del proceso de certificación, los SLA y el acceso al portal de comercios no están documentados públicamente. Ver preguntas para soporte en `01-resumen-ejecutivo.md`.

---

## 2. Tipos de credenciales

Payway maneja **hasta cinco** valores de credencial, no dos. Esto es una de las diferencias más importantes contra Mercado Pago y hay que modelarlo bien en multi-tenant.

Fuente autoritativa: la selección de key por operación en https://raw.githubusercontent.com/payway-ar/sdk-php-ventaonline/master/Decidir/lib/RESTClient.php y https://raw.githubusercontent.com/payway-ar/sdk-node-ventaonline/master/lib/sdk.js

| Credencial | Nombre en los SDKs | Dónde vive | Qué puede hacer |
|---|---|---|---|
| **API Key pública** | `public_key` / `publicApiKey` | **Frontend** (browser). Es pública por diseño. | `POST /tokens` — tokenizar una tarjeta. `POST /transaction_gateway/tokens`. Renderizar el formulario hosted (`?apikey=`). |
| **API Key privada** | `private_key` / `privateApiKey` | **Solo backend**. Secreta. | `POST /payments`, consultas, devoluciones, anulaciones, `cardtokens`, cierre de lote, `threeds/instruction`, generación de link de checkout. |
| **API Key de formulario / PCI** | `form_apikey` / `validateApiKey` | Solo backend. Secreta. | `POST /web/validate` — únicamente si se usa el **formulario hosted**. |
| **Site del formulario** | `form_site` / `merchant` | Backend. No es secreto (es el nro. de comercio). | Viaja como header `X-Consumer-Username` en `/web/validate`. |
| **Consumer username 3DS** | `x_consumer_username` | Backend. | Viaja como header `X-Consumer-Username` en `POST /threeds/instruction`. |

**Regla práctica:** si la integración es API directa con tokenización (la que recomendamos), solo se necesitan **pública + privada** (y `x_consumer_username` si se activa 3DS).

### 2.1 Cómo se envían — nombre exacto de los headers

```
apikey: <valor de la API key>
Content-Type: application/json
Cache-Control: no-cache
X-Source: <base64 opcional, telemetría del SDK>
X-Consumer-Username: <solo en /web/validate y /threeds/instruction>
```

- El header de autenticación se llama literalmente **`apikey`**, en minúsculas, sin prefijo `Bearer` ni `Basic`. Fuente: `RESTClient.php` (`array_push($header_http, 'apikey: '.$key)`) y `lib/services/payments.js` (`headers: { apikey: apikey, ... }`).
- **No hay OAuth, ni access tokens, ni refresh tokens.** La API key es estática y de larga vida. Esto es una diferencia grande contra Mercado Pago.
- `X-Source` es telemetría del SDK: base64 de `{"service":"SDK-NODE","grouper":"...","developer":"..."}`. Fuente: https://raw.githubusercontent.com/payway-ar/sdk-node-ventaonline/master/lib/utils/functions.js. **No es obligatorio** (el SDK .NET no lo envía).

> **Trampa:** el SDK PHP arma los headers como `'X-Consumer-Username:'.$this->formKey` — **sin espacio** después de los dos puntos. Es válido en HTTP pero conviene normalizar con espacio en una implementación propia.

---

## 3. Ambientes y base URLs

Fuente principal: https://raw.githubusercontent.com/payway-ar/sdk-node-ventaonline/master/lib/utils/constants.js

| Ambiente | API v2 (pagos, tokens, refunds) | API v1 (cierre de lote, transaction_gateway) | Checkout hosted |
|---|---|---|---|
| **Sandbox / Developers** | `https://developers.decidir.com/api/v2` | `https://developers.decidir.com/api/v1` | `https://developers.decidir.com/api/v1/checkout-payment-button` |
| **Producción** | `https://ventasonline.payway.com.ar/api/v2` | `https://ventasonline.payway.com.ar/api/v1` | `https://ventasonline.payway.com.ar/api/v1/checkout-payment-button` |

### Formulario hosted (paths `/web/`, fuera de `/api/`)

| Ambiente | Validate | Form renderizado |
|---|---|---|
| Sandbox | `https://developers.decidir.com/web/validate` | `https://developers.decidir.com/web/forms/{hash}?apikey={public_key}` |
| Producción | `https://ventasonline.payway.com.ar/web/validate` | `https://ventasonline.payway.com.ar/web/forms/{hash}?apikey={public_key}` |

Fuente: `RESTClient::setUrl()` del SDK PHP + README del SDK .NET.

### SDK JavaScript de frontend

```html
<script src="https://ventasonline.payway.com.ar/static/v2.6.4/decidir.js"></script>
```
Fuente: https://github.com/payway-ar/sdk-javascript-ventaonline (README). Nótese que **el script se sirve siempre desde el host de producción**, y el ambiente se elige por la URL que se le pasa al constructor:
```javascript
const decidir = new Decidir("https://developers.decidir.com/api/v2"); // sandbox
decidir.setPublishableKey(publicApiKey);
decidir.setTimeout(5000);
```

### ⚠️ Contradicción abierta (GAP-11)

Otros SDKs oficiales apuntan producción a hosts distintos:
- SDK .NET: `https://live.decidir.com/api/v2/` (https://raw.githubusercontent.com/payway-ar/sdk-net-ventaonline/master/Solution/Decidir/DecidirConnector.cs)
- SDK PHP embebido en el plugin WooCommerce: `https://api.decidir.com/api/v2/`
- ActiveMerchant: `https://live.decidir.com/api/v2`

**Hay que confirmar con Payway a qué host apuntar en producción antes de certificar.** Recomendación: parametrizar la base URL por configuración (nunca hardcodear), lo que además nos sirve para el multi-tenant.

### ⚠️ No usar

`constants.js` filtra hosts internos de Payway: `http://decidir.payway-dev.tanzu.intra` y `http://decidir.payway-qa.tanzu.intra`. Son redes internas, inaccesibles desde afuera. Ignorarlos.

### Pasaje de sandbox a producción

Cambian **dos cosas**: la base URL y el par de API keys. No hay flag ni parámetro en el payload.

> *"Cada ambiente tiene su propia API key (ya sea para desarrollo o producción) y estas no deben usarse fuera de su respectivo ambiente."*
> — README del SDK .NET

---

## 4. `site_id`, `merchant_id` y la implicancia multi-tenant

### 4.1 Qué identificadores existen

| Campo | Dónde aparece | Qué es |
|---|---|---|
| `site` / `site_id` | Request de `/payments`, request de `/web/validate` (`site.id`), respuesta de `/payments` | **Número de comercio/sitio de Payway**. Numérico, formato `"00020220"` (8 dígitos con ceros a la izquierda en los ejemplos oficiales). Es el identificador de liquidación. |
| `site_transaction_id` | Request y respuesta de `/payments` | Id **del comercio** para esa transacción. Alfanumérico, hasta 39–40 caracteres. Es nuestra clave de idempotencia natural. |
| `merchant_id` | Dentro de `aggregate_data` y como query param del listado | Identificador del **sub-comercio** en el modelo agregador. |
| `establishment_name` | Request de `/payments` | Nombre del establecimiento. Es lo que suele verse en el resumen de la tarjeta. |
| `id` (respuesta) | Respuesta de `/payments` | **Payment ID de Payway**. Numérico (`971344`). Es la clave para consultar, devolver y anular. |

### 4.2 Los tres modelos posibles para Tiendafy

La evidencia del código muestra **tres** formas de modelar varias tiendas. Son distintas y no intercambiables:

#### A. Un comercio = un set de credenciales (N sets de keys)
Cada tienda de Tiendafy tiene su propio `site_id` y su propio par `public_key`/`private_key`, contratados directamente con Payway. Cada tienda cobra a su propio CBU.

- **Evidencia:** es el modelo por defecto de todos los SDKs — el conector se instancia con un par de keys y punto.
- **Implicancia:** Tiendafy debe guardar las credenciales **por tenant**, cifradas, y resolverlas en runtime.
- **Es el modelo que recomendamos.** Ver `03-modelos-de-cobro.md`.

#### B. Pago distribuido (`payment_type: "distributed"` + `sub_payments[]`)
Una **sola** transacción se reparte entre varios `site_id` en el mismo momento del cobro. Cada sub-pago recibe su propio `ticket`, `card_authorization_code`, `subpayment_id` y `tid`.

```json
{
  "payment_type": "distributed",
  "amount": 200000,
  "sub_payments": [
    { "site_id": "04052023", "amount": 100000, "installments": 1 },
    { "site_id": "00009007", "amount": 100000, "installments": 1 }
  ]
}
```
Fuente: README del SDK .NET, sección "Campo TID".

**Restricción:** la suma de `sub_payments[].amount` debe ser **exactamente igual** a `amount` (README del SDK Node).

> Esto es un **split de una compra entre varios comercios del mismo grupo**, no un marketplace tipo Mercado Pago. Sirve, por ejemplo, para separar la comisión de la plataforma del monto del vendedor — **pero requiere que cada `site_id` esté dado de alta en Payway y habilitado para operar en modo distribuido**.

#### C. Comercio agregador (`aggregate_data`)
Tiendafy sería el comercio titular ante Payway, y en cada pago informa los datos del sub-comercio (CUIT, nombre, dirección, MCC, canal) dentro del objeto `aggregate_data`. Es el modelo "payment facilitator".

```json
"aggregate_data": {
  "indicator": "1",
  "identification_number": "30598910045",
  "merchant_name": "TIENDA EJEMPLO",
  "merchant_id": "tienda_042",
  "category": "50044",
  "channel": "005",
  "aggregator_name": "payfact",
  "gateway_id": "payway",
  "seller_id": "seller_123"
}
```
Fuente: README del SDK .NET (tabla completa de `aggregate_data`) y `Model/AggregateDataPayment.cs`.

> **`seller_id` es exclusivo de American Express** y solo se envía cuando `payment_method_id` corresponde a Amex.
> **Ser agregador implica requisitos regulatorios y contractuales fuertes** (BCRA, PCI, contrato específico con Payway). No es una decisión técnica.

### 4.3 Recomendación para Tiendafy

**Modelo A: un tenant = un `site_id` + un set de credenciales propio.**

Razones:
1. Es el modelo soportado sin fricción por la API y por todos los SDKs.
2. Cada tienda del grupo liquida a su propia cuenta, que es lo que suele querer un grupo con varias marcas.
3. No arrastra las obligaciones regulatorias de ser agregador.
4. Encaja naturalmente con el RLS por tenant que ya tenemos en PostgreSQL.

Si más adelante aparece el requerimiento de "Tiendafy se queda una comisión de cada venta", el camino es evaluar **B (distribuido)** con Payway, no C.

> **GAP-08:** confirmar con soporte comercial si Payway ofrece un modelo marketplace/split formal, y bajo qué contrato. Pregunta exacta en `01-resumen-ejecutivo.md`.

### 4.4 Implicancia concreta en el modelo de datos

```
tenant (tienda)
  └── payment_gateway_credential
        ├── tenant_id            (FK, RLS)
        ├── provider             ('payway' | 'mercadopago')
        ├── environment          ('sandbox' | 'production')
        ├── site_id              -- nro. de comercio Payway
        ├── public_key_encrypted
        ├── private_key_encrypted
        ├── form_api_key_encrypted        (nullable)
        ├── x_consumer_username_encrypted (nullable)
        ├── base_url_override             (nullable, por GAP-11)
        └── is_active
```
Detalle completo en `12-plan-de-implementacion.md`.

---

## 5. Qué NO hay

- ❌ No hay OAuth ni flujo de autorización delegada (a diferencia de Mercado Pago Marketplace).
- ❌ No hay rotación de keys por API.
- ❌ No hay scopes ni permisos granulares por key más allá de la división pública/privada/form.
- ❌ No hay alta de comercios por API.
