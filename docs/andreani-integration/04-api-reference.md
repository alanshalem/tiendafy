# 04 — API Reference

Referencia endpoint por endpoint de la API REST de **Transporte y Distribución** de Andreani.
Alcance: lo necesario para cotizar, generar, etiquetar y trackear envíos de e-commerce nacional.
El bloque `almacenes/*` (Fulfillment/WMS) queda documentado solo como inventario en §4.11.

**Base URLs (aplican a todos los endpoints):**

| Ambiente | Base URL |
|---|---|
| Producción | `https://apis.andreani.com` |
| QA / homologación | `https://apisqa.andreani.com` |

**Fuente de todo este documento salvo indicación contraria:** 🟢 https://developers.andreani.com/documentacion

---

## 4.1 Autenticación

### Login

- **Método y path:** `POST /login`
  > ⚠️ La doc oficial no escribe el verbo HTTP. Dice literalmente `Method: login`. `POST` está confirmado por 🟡 SDKs de terceros y por el portal GlobAllPack, que publica `https://apis.andreani.com/login`.
- **Ambiente:** `https://apis.andreani.com/login` · `https://apisqa.andreani.com/login`
- **Auth:** `Authorization: Basic base64(user:password)`
- **Headers adicionales:** ninguno documentado
- **Request:** sin body

- **Response OK:** el token **viene en un header de respuesta**, no en el body.

| Header de respuesta | Tipo | Descripción |
|---|---|---|
| `x-authorization-token` | string | Token a reenviar en todas las llamadas siguientes |

- **Responses de error:** ⛔ no documentadas. Asumir `401` para credenciales inválidas y `403` si hay restricción por IP (🟢 GlobAllPack documenta que 403 = problema de whitelisting).

- **Notas y trampas:**
  - El token se reenvía en el header **`x-authorization-token`** (mismo nombre que el de respuesta), **no** en `Authorization: Bearer`.
  - TTL ⛔ **GAP-09**. GlobAllPack documenta 24 h sobre el mismo host; asumirlo es 🔵 inferencia.
  - `GET /localidades` es el único endpoint que **no** requiere token.
  - El sandbox de Fulfillment usa otro esquema: `Authorization: Bearer {jwt}`.
- **Fuente:** https://developers.andreani.com/documentacion (sección *Authentication*) · https://developers.andreanigloballpack.com/

---

## 4.2 Cotización

### Cotizar un envío

- **Método y path:** `GET /tarifas` — 🟡 los SDKs de terceros usan **`GET /v1/tarifas`**
  > 🚨 **Conflicto de path verificado.** La documentación oficial escribe `Method: tarifas`, **sin prefijo de versión**, y la cadena `v1` no aparece en ninguna parte de la página. Los dos SDKs de terceros construyen `/v1/tarifas`. **Probar los dos en QA.**
  >
  > 🟢 De la doc oficial solo están el nombre del método y la forma de la respuesta. El verbo `GET` y **todos los parámetros de entrada** provienen de 🟡 terceros: la doc oficial **no publica ninguna tabla de parámetros** para este endpoint. Ver **GAP-01**.
- **Ambiente:** `https://apis.andreani.com/tarifas` · `https://apisqa.andreani.com/tarifas` (🟡 variante de terceros: `.../v1/tarifas`)
- **Auth:** `x-authorization-token: {token}`
  > ⚠️ Contradicción entre fuentes: el SDK PHP autentica; una implementación pública ([Test-Envios](https://github.com/Lucasponzoni/Test-Envios)) llama **sin ningún header** y aparentemente funciona. Enviar el token siempre — no cuesta nada y elimina la duda.
- **Headers adicionales:** ninguno

- **Request (query string):**

| Campo | Tipo | Obligatorio | Formato / longitud | Descripción | Fuente |
|---|---|---|---|---|---|
| `cpDestino` | string | **Sí** | 4 dígitos (CP argentino) | Código postal de destino | 🟡 (4 fuentes coincidentes) |
| `contrato` | string | **Sí** | numérico, ej. `300006611` | Contrato Andreani de la modalidad elegida | 🟡 (4 fuentes) |
| `cliente` | string | Probablemente sí | 10 dígitos, **sin prefijo `CL`** | Código de cliente | 🟡 (2 fuentes) |
| `sucursalOrigen` | string | No | nomenclatura, ej. `PRC` | Sucursal/centro de imposición de origen | 🟡 (2 fuentes) |
| `pais` | string | No | — | País. Por defecto Argentina | 🟡 |
| `bultos[N][kilos]` | number | **Sí** | decimal | Peso del bulto N (base 0) | 🟡 (3 fuentes) |
| `bultos[N][volumen]` | number | **Sí** | decimal | Volumen del bulto N | 🟡 (3 fuentes) |
| `bultos[N][valorDeclarado]` | number | **Sí** | decimal | Valor declarado del bulto N | 🟡 (3 fuentes) |
| `bultos[N][pesoAforado]` | number | No | decimal | Peso aforado. Aparece como entrada en 2 SDKs, pero también es campo de salida. Sospechoso | 🟡 (2 fuentes) |
| `bultos[N][altoCm]` | number | No | decimal | Alto en cm | 🟡 (1 fuente) |
| `bultos[N][largoCm]` | number | No | decimal | Largo en cm | 🟡 (1 fuente) |
| `bultos[N][anchoCm]` | number | No | decimal | Ancho en cm | 🟡 (1 fuente) |

- **Ejemplo de request** (🟡 reconstruido de dos SDKs independientes que convergen en el mismo formato):

```http
GET /v1/tarifas?cpDestino=1832        # 🟡 path según SDKs de terceros; la doc oficial escribe /tarifas
    &contrato=300006611
    &cliente=0003750
    &sucursalOrigen=PRC
    &bultos[0][kilos]=1.3
    &bultos[0][volumen]=200
    &bultos[0][valorDeclarado]=1200
    &bultos[0][altoCm]=20
    &bultos[0][largoCm]=30
    &bultos[0][anchoCm]=15 HTTP/1.1
Host: apis.andreani.com
x-authorization-token: eyJhbGciOi...
```

> El formato `bultos[0][kilos]` es el resultado natural de serializar un array anidado con `http_build_query` (PHP) o `URLSearchParams` equivalente. Dos SDKs llegaron a él por separado, lo que da confianza razonable.

- **Response OK (200):**

| Campo | Tipo | Descripción |
|---|---|---|
| `pesoAforado` | string | Peso aforado calculado por Andreani (el mayor entre peso real y volumétrico) |
| `tarifaSinIva.seguroDistribucion` | string | Costo del seguro, sin IVA |
| `tarifaSinIva.distribucion` | string | Costo de distribución, sin IVA |
| `tarifaSinIva.total` | string | Total sin IVA |
| `tarifaConIva.seguroDistribucion` | string | Seguro con IVA |
| `tarifaConIva.distribucion` | string | Distribución con IVA |
| `tarifaConIva.total` | string | **Total con IVA — es el precio a mostrar al comprador** |

```json
{
  "pesoAforado": "70.00",
  "tarifaSinIva": {
    "seguroDistribucion": "12.21",
    "distribucion": "5806.97",
    "total": "5819.18"
  },
  "tarifaConIva": {
    "seguroDistribucion": "14.77",
    "distribucion": "7026.43",
    "total": "7041.21"
  }
}
```

- **Responses de error:** ⛔ no documentadas.
- **Notas y trampas:**
  - **Todos los importes vienen como string**, no como número. Parsear con `InvariantCulture` (punto decimal). Un `decimal.Parse` con cultura `es-AR` interpreta `"5806.97"` como 580697. Es un bug clásico y silencioso.
  - **No devuelve plazo de entrega.** Ni días hábiles, ni fecha estimada. Si el checkout necesita mostrar "llega entre el X y el Y", ese dato **no sale de acá**. Ver `05-flujo-cotizacion.md` §5.6.
  - **No devuelve vigencia ni TTL de la tarifa.** ⛔
  - **No devuelve opciones**: es una tarifa por llamada. Para ofrecer "domicilio" y "sucursal" hay que hacer **dos llamadas con dos contratos distintos**.
  - `pesoAforado` en la respuesta confirma que **Andreani calcula el aforo**, no el cliente.
  - **Verificar el path antes que nada.** Doc oficial: `/tarifas`. SDKs: `/v1/tarifas`. Es la primera prueba a hacer en QA.
- **Fuente:** https://developers.andreani.com/documentacion (sección *Get the rate of a shipment*) + https://github.com/alejoasotelo/andreani-sdk-rest + https://github.com/Lucasponzoni/Test-Envios

---

## 4.3 Órdenes de envío

### Crear una orden de envío

- **Método y path:** `POST /ordenes-de-envio`
  > 🟢 La doc oficial escribe `Method: ordenes-de-envio` **sin prefijo de versión**. El esquema beta del sandbox documenta el mismo body con más campos. Ver §4.3.3.
- **Ambiente:** `https://apis.andreani.com/ordenes-de-envio` · `https://apisqa.andreani.com/ordenes-de-envio`
- **Auth:** `x-authorization-token: {token}`
- **Headers adicionales:** `Content-Type: application/json`

> **Sobre la columna "Long.":** la documentación no dice "longitud" sino *"Máximo caracteres guardados"*. Se transcribe el valor tal cual (`40`, `12,2`, `12,3`, `6,3`). Los campos sin valor en esa columna **no tienen longitud declarada** — no significa que sea ilimitada.

#### Request — campos de primer nivel

| Campo | Tipo | Obligatorio | Long. | Descripción |
|---|---|---|---|---|
| `contrato` | string | **Sí** | — | Código de contrato con Andreani |
| `tipoServicio` | string | No | — | Tipo de entrega. Ej: `Domicilio` / `Sucursal` |
| `sucursalClienteID` | string | No | — | Identificador de la sucursal del remitente |
| `origen` | object | **Sí** | — | Debe contener **exactamente uno** de `postal` o `sucursal` |
| `destino` | object | **Sí** | — | Debe contener **exactamente uno** de `postal` o `sucursal` |
| `remitente` | object | **Sí** | — | Datos del remitente |
| `destinatario[]` | array | **Sí** | — | Destinatario. Se puede pasar un alternativo como segundo elemento |
| `remito` | object | No | — | Remito |
| `centroDeCostos` | string | No | 40 | Centro de costos del envío |
| `productoAEntregar` | string | No | — | Descripción del producto a entregar |
| `productoARetirar` | string | No | — | Descripción del producto a retirar |
| `tipoProducto` | string | No | — | Categoría. Ej: `Linea Blanca`, `Electrodoméstico` |
| `categoriaFacturacion` | string | No | — | Categoría de facturación |
| `pagoDestino` | integer | No | — | Tipo de porte. **Porte = 1, Debido = 2** |
| `valorACobrar` | double | No | 12,2 | Valor total a cobrar al destinatario, si no se completan los `valorDeclaradoConImpuestos` de los bultos |
| `fechaDeEntrega` | object | No | — | Fecha y hora de entrega pactada |
| `codigoVerificadorDeEntrega` | string | No | — | Código para verificar la entrega |
| `bultos[]` | array | **Sí** | — | Datos de cada bulto |

#### Request — `origen` / `destino`

Ambos tienen la misma forma. Deben llevar `postal` **o** `sucursal`, nunca los dos.

| Campo | Tipo | Obligatorio | Long. | Descripción |
|---|---|---|---|---|
| `postal` | object | Sí, si no hay `sucursal` | — | Dirección |
| `postal.localidad` | string | **Sí** | 40 | Localidad. **Debe coincidir con el catálogo de `/localidades`** |
| `postal.region` | string | No | — | **Código ISO 3166-2:AR** (ej. `B` Buenos Aires, `C` CABA, `X` Córdoba, `S` Santa Fe) |
| `postal.pais` | string | No | — | Por defecto `Argentina` |
| `postal.codigoPostal` | string | **Sí** | 12 | Código postal. En Argentina, 4 dígitos numéricos |
| `postal.calle` | string | **Sí** | 40 | Calle |
| `postal.numero` | string | **Sí** | 40 | Altura de la calle |
| `postal.componentesDeDireccion[]` | array | No | 40 c/u | Datos adicionales. Tipo **meta-contenido libre**: `[{"meta":"Piso","contenido":"3"}]` |
| `sucursal` | object | Sí, si no hay `postal` | — | Sucursal |
| `sucursal.id` | string | **Sí** | — | En `origen`: sucursal de imposición, **debe tener atención al cliente**. En `destino`: sucursal de retiro, **debe tener atención al cliente** |

> ⚠️ **`region` es ISO 3166-2:AR, no el nombre de la provincia.** La doc no publica la tabla. Los códigos son de una letra (`C`, `B`, `X`, `S`, `M`, `T`…). El campo es opcional: **si no estás seguro, no lo mandes** — enviarlo mal es peor que omitirlo.

> ⚠️ El ejemplo de longitud 12 para `codigoPostal` es para soportar formatos internacionales. Para Argentina son 4 dígitos. El CPA de 8 caracteres (`C1425DKE`) **no está documentado como aceptado**; usar los 4 dígitos.

#### Request — `remitente`

| Campo | Tipo | Obligatorio | Long. | Descripción |
|---|---|---|---|---|
| `nombreCompleto` | string | **Sí** | 40 | Nombre o razón social |
| `eMail` | string | **Sí** | — | Correo electrónico |
| `documentoTipo` | string | **Sí** | — | `DNI` / `CUIT` / `CUIL` |
| `documentoNumero` | string | **Sí** | 20 | Número de documento |
| `telefonos` | object | No | — | Teléfono |
| `telefonos.tipo` | integer | **Sí** (si hay `telefonos`) | — | **Trabajo = 0, Celular = 1, Casa = 2, Otros = 3** |
| `telefonos.numero` | string | **Sí** (si hay `telefonos`) | 15 | Número |

#### Request — `destinatario[]`

| Campo | Tipo | Obligatorio | Long. | Descripción |
|---|---|---|---|---|
| `nombreCompleto` | string | **Sí** | 40 | Nombre o razón social |
| `eMail` | string | **Sí** | 40 | Correo electrónico |
| `documentoTipo` | string | **Sí** | — | `DNI` / `CUIT` / `CUIL` |
| `documentoNumero` | string | **Sí** | 20 | Número de documento |
| `telefonos` | object | No | — | Teléfono |
| `telefonos.tipo` | integer | **Sí** (si hay `telefonos`) | — | **Trabajo = 1, Celular = 2, Casa = 3, Otros = 4** |
| `telefonos.numero` | string | **Sí** (si hay `telefonos`) | 15 | Número |

> 🚨 **La trampa más peligrosa de toda la API:** `telefonos.tipo` **usa numeraciones distintas en remitente y destinatario**. Remitente arranca en 0 (Trabajo=0, Celular=1, Casa=2, Otros=3), destinatario arranca en 1 (Trabajo=1, Celular=2, Casa=3, Otros=4). Está así en la documentación oficial, en tablas separadas. Un mapper compartido entre ambos objetos produce datos silenciosamente mal clasificados. **Usar dos enums distintos o una función de mapeo por rol.**

#### Request — `remito`

| Campo | Tipo | Obligatorio | Long. | Descripción |
|---|---|---|---|---|
| `numeroRemito` | string | No | 35 | Número de remito |
| `complementarios[]` | array of string | No | — | Números de remitos complementarios |

#### Request — `fechaDeEntrega`

| Campo | Tipo | Obligatorio | Formato | Descripción |
|---|---|---|---|---|
| `fecha` | integer | No | `YYYY-mm-dd` | Fecha de entrega pactada |
| `horaDesde` | integer | No | — | Hora disponible desde |
| `horaHasta` | integer | No | — | Hora disponible hasta |

> ⚠️ La doc tipa `fecha` como `integer` pero le da formato `YYYY-mm-dd`. Es una inconsistencia de la propia documentación. El esquema beta del sandbox lo tipa como `string`. **Probar con string en QA.**

#### Request — `bultos[]`

| Campo | Tipo | Obligatorio | Long. | Descripción |
|---|---|---|---|---|
| `kilos` | double | **Sí** | 12,3 | Peso del bulto **en kilogramos** |
| `largoCm` | double | No | — | Largo en **centímetros** |
| `altoCm` | double | No | — | Alto en **centímetros** |
| `anchoCm` | double | No | — | Ancho en **centímetros** |
| `volumenCm` | double | **Sí** | 6,3 | Volumen del bulto **en cm³** |
| `valorDeclaradoSinImpuestos` | double | No | 12,2 | Valor sin impuestos, **para el seguro de distribución** |
| `valorDeclaradoConImpuestos` | double | No | — | Valor con impuestos, **para gestiones de cobranza** |
| `descripcion` | string | No | — | Descripción del bulto |
| `referencias[]` | array | No | — | Meta-contenido. Ver nota |
| `numeroDeEnvio` | string | No | — | Número de tracking pre-asignado (pre-numeración) |

**Sobre `referencias[]` — dos metas con semántica documentada:**

| meta | Para qué sirve |
|---|---|
| `idCliente` | 🟢 "Para asociar bultos en B2C, enviar el meta `idCliente` con el mismo contenido" — **es como se agrupan varios bultos en un mismo envío** |
| `observaciones` | 🟢 "Para asociar observaciones en la etiqueta enviar el meta `observaciones`" — texto libre impreso en la etiqueta |

> ⚠️ **`volumenCm` es obligatorio y `largoCm`/`altoCm`/`anchoCm` no.** Es al revés de lo intuitivo. Si mandás las tres dimensiones pero no el volumen, el request es inválido. Calculá `volumenCm = largo × alto × ancho` y mandá los cuatro campos.
>
> ⚠️ La longitud declarada de `volumenCm` es **`6,3`**: seis dígitos enteros y tres decimales, o sea máximo 999999.999 cm³ ≈ un cubo de 100 cm de lado. Un bulto de 120×80×80 cm (768.000 cm³) entra; uno de 150×100×100 (1.500.000 cm³) **no**. Validar antes de enviar.

- **Ejemplo de request:**

> ⛔ **La documentación oficial NO publica un ejemplo de request para este endpoint.** Confirmado en pasadas independientes. El siguiente ejemplo está **construido a partir de la tabla de campos oficial**, no copiado de la doc. Tratarlo como plantilla a validar en QA, no como contrato verificado.

```json
{
  "contrato": "300006611",
  "tipoServicio": "Domicilio",
  "sucursalClienteID": "46",
  "origen": {
    "postal": {
      "codigoPostal": "1425",
      "calle": "Av. Santa Fe",
      "numero": "3253",
      "localidad": "C.A.B.A.",
      "region": "C",
      "pais": "Argentina",
      "componentesDeDireccion": [
        { "meta": "Piso", "contenido": "4" },
        { "meta": "Departamento", "contenido": "B" }
      ]
    }
  },
  "destino": {
    "postal": {
      "codigoPostal": "5000",
      "calle": "25 de Mayo",
      "numero": "250",
      "localidad": "CORDOBA",
      "region": "X",
      "pais": "Argentina"
    }
  },
  "remitente": {
    "nombreCompleto": "Tienda Ejemplo SRL",
    "eMail": "ventas@tiendaejemplo.com",
    "documentoTipo": "CUIT",
    "documentoNumero": "30712345678",
    "telefonos": { "tipo": 0, "numero": "1145678900" }
  },
  "destinatario": [
    {
      "nombreCompleto": "Maria Lopez",
      "eMail": "maria.lopez@example.com",
      "documentoTipo": "DNI",
      "documentoNumero": "28123456",
      "telefonos": { "tipo": 2, "numero": "3515551234" }
    }
  ],
  "remito": { "numeroRemito": "0001-00001234" },
  "centroDeCostos": "TENANT-042",
  "productoAEntregar": "Indumentaria",
  "tipoProducto": "Indumentaria",
  "pagoDestino": 1,
  "bultos": [
    {
      "kilos": 1.300,
      "largoCm": 30,
      "altoCm": 20,
      "anchoCm": 15,
      "volumenCm": 9000,
      "valorDeclaradoSinImpuestos": 45000.00,
      "descripcion": "Caja 1 de 2",
      "referencias": [
        { "meta": "idCliente",     "contenido": "TF-ORD-98231" },
        { "meta": "observaciones", "contenido": "Timbre 4B" }
      ]
    },
    {
      "kilos": 0.800,
      "largoCm": 25,
      "altoCm": 15,
      "anchoCm": 10,
      "volumenCm": 3750,
      "valorDeclaradoSinImpuestos": 12000.00,
      "descripcion": "Caja 2 de 2",
      "referencias": [
        { "meta": "idCliente", "contenido": "TF-ORD-98231" }
      ]
    }
  ]
}
```

- **Response OK** — 🟢 el esquema beta del sandbox declara **`202 Accepted`**. La doc principal no declara código. Asumir 200 **o** 202 como éxito.

| Campo | Tipo | Descripción |
|---|---|---|
| `estado` | string | Estado inicial de la orden. Observado: `Pendiente` |
| `tipo` | string | Canal. Observado: `B2C` |
| `sucursalDeDistribucion` | object | `{nomenclatura, descripcion, id}` — sucursal que va a repartir |
| `sucursalDeRendicion` | object | `{nomenclatura, descripcion, id}` |
| `sucursalDeImposicion` | object | `{nomenclatura, descripcion, id}` |
| `sucursalAbastecedora` | object | Solo en el esquema beta |
| `fechaCreacion` | string | ISO 8601 con offset, ej. `2020-05-06T15:47:57-03:00` |
| `zonaDeReparto` | string | — |
| `numeroDePermisionaria` | string | Ej. `RNPSP Nº 586` — dato regulatorio que va en la etiqueta |
| `descripcionServicio` | string | Descripción del contrato |
| `etiquetaRemito` | string | — |
| `bultos[].numeroDeBulto` | string | Ordinal del bulto |
| `bultos[].numeroDeEnvio` | string | **★ Número de seguimiento. Uno por bulto.** |
| `bultos[].totalizador` | string | Ej. `1/2` |
| `bultos[].linking[]` | array | `{meta, contenido}`. Con `meta: "Etiqueta"` trae la URL de la etiqueta |
| `fechaEstimadaDeEntrega` | string | En el ejemplo viene **vacío** |
| `huellaDeCarbono` | string | En el ejemplo viene vacío |
| `gastoEnergetico` | string | En el ejemplo viene vacío |
| `agrupadorDeBultos` | string | Solo esquema beta |
| `etiquetasPorAgrupador` | string | Solo esquema beta |
| `etiquetasDocumentoDeCambio` | string | Solo esquema beta |

```json
{
  "estado": "Pendiente",
  "tipo": "B2C",
  "sucursalDeDistribucion": { "nomenclatura": "BAR", "descripcion": "BARRACAS", "id": "46" },
  "sucursalDeRendicion":    { "nomenclatura": "REN", "descripcion": "PROVEEDOR RENDICIONES", "id": "-1" },
  "sucursalDeImposicion":   { "nomenclatura": "",    "descripcion": "", "id": "" },
  "fechaCreacion": "2020-05-06T15:47:57-03:00",
  "zonaDeReparto": "",
  "numeroDePermisionaria": "RNPSP Nº 586",
  "descripcionServicio": "Contrato de TEST WebService",
  "etiquetaRemito": "",
  "bultos": [
    {
      "numeroDeBulto": "1",
      "numeroDeEnvio": "360000000036820",
      "totalizador": "1/2",
      "linking": [
        { "meta": "Etiqueta", "contenido": "https://apisqa.andreani.com/v2/360000000036820/etiquetas" }
      ]
    },
    {
      "numeroDeBulto": "2",
      "numeroDeEnvio": "360000000036830",
      "totalizador": "2/2",
      "linking": [
        { "meta": "Etiqueta", "contenido": "https://apisqa.andreani.com/v2/360000000036830/etiquetas" }
      ]
    }
  ],
  "fechaEstimadaDeEntrega": "",
  "huellaDeCarbono": "",
  "gastoEnergetico": ""
}
```

- **Responses de error** — 🟢 esquema beta del sandbox: **400** y **500**, ambos con el mismo cuerpo, que es un **array**:

```json
[
  { "code": "string", "property": "string", "message": "string" }
]
```

- **Notas y trampas:**
  - **No hay un "número de envío" único**: hay uno **por bulto**. El identificador estable a persistir es `bultos[].numeroDeEnvio`. Ver `06-flujo-generacion-envio.md` §6.4.
  - `fechaEstimadaDeEntrega` viene vacío en el ejemplo oficial. **No asumir que se puebla.**
  - No existe idempotency key. Ver `06-flujo-generacion-envio.md` §6.5.
  - ⚠️ **Discrepancia de versión:** la doc principal usa `ordenes-de-envio` sin versión; los links de etiqueta que devuelve usan `/v2/`. El esquema beta del sandbox describe un body **distinto y más rico** (con `idPedido`, `pagoPendienteEnMostrador`, `coordenadas`, `componentes`/`ean` por bulto). **Preguntar cuál es la versión vigente.**
- **Fuente:** https://developers.andreani.com/documentacion (*Create a new order*) · https://developers-sandbox.andreani.com/docs/andreani/beta/creacion-de-una-nueva-orden-de-envio

### 4.3.3 Diferencias del esquema BETA (sandbox)

🟢 **OFICIAL** — el OpenAPI beta declara campos que **no están** en la doc principal. Relevantes para Tiendafy:

| Campo beta | Tipo | Por qué importa |
|---|---|---|
| `idPedido` | string, nullable | **Referencia externa propia a nivel orden.** Si existe y es indexable, resuelve buena parte del problema de idempotencia y de consulta por referencia propia. **Confirmar** |
| `pagoPendienteEnMostrador` | boolean | Cobro en mostrador |
| `origen/destino.coordenadas` | `{elevacion, latitud, longitud, poligono}` | Geolocalización del punto de entrega |
| `origen/destino.postal.piso`, `.departamento`, `.casillaDeCorreo` | string | Campos estructurados en vez del meta-contenido libre |
| `bultos[].componentes` | `{numeroAgrupador, componentesHijos[{numeroHijo, referencias[]}], ean}` | Contenido del bulto a nivel SKU/EAN |
| `bultos[].valorDeclarado` | double | Tercer campo de valor declarado, además de con/sin impuestos |
| `remito.centroDeCostos`, `.productoAEntregar`, `.tipoProducto`, `.fechaDeEntrega` | — | **En el beta estos campos están dentro de `remito`, no en el primer nivel.** Cambio estructural |
| `sucursalClienteID` | **int32** | En la doc principal es **string**. Conflicto de tipos |

> ⚠️ **Conflicto documentado:** `sucursalClienteID` es `string` en la doc principal e `int32` en el beta; `remitente.eMail` en la principal vs `remitente.email` en el beta; `telefonos` es un objeto en la principal y un `object[]` en el beta. **No son la misma versión de la API.** Preguntar cuál está vigente antes de escribir el DTO.

### Consultar una orden de envío

- **Método y path:** `GET /ordenes-de-envio/{numeroAndreani}`
- **Ambiente:** `https://apis.andreani.com/ordenes-de-envio/{numeroAndreani}` · QA equivalente
- **Auth:** `x-authorization-token: {token}`
- **Request:** parámetro de path `numeroAndreani`. ⛔ Sin query params documentados
- **Response OK:** misma estructura que la respuesta de creación
- **Notas y trampas:** 🟡 un SDK de terceros advierte que para confirmar la entrega hay que consultar **la orden**, no solo las trazas v2. Ver §4.5.
- **Fuente:** https://developers.andreani.com/documentacion (*Get a new order*)

---

## 4.4 Etiquetas

### Obtener la etiqueta de un bulto

- **Método y path:** `GET /v2/{numeroDeEnvio}/etiquetas`
  > 🚨 **GAP-06 — Path ambiguo.** La doc oficial devuelve en `linking` la URL `https://apisqa.andreani.com/v2/{numeroDeEnvio}/etiquetas` (**sin** `ordenes-de-envio`), mientras que 🟡 el SDK PHP construye `https://apis.andreani.com/v2/ordenes-de-envio/{numeroAndreani}/etiquetas` (**con**). La sección "Get a label" de la doc oficial, por su parte, muestra el path `ordenes-de-envio/{numeroAndreani}`, idéntico al de consultar la orden.
  >
  > **Recomendación de implementación:** no construir la URL. **Usar el link que viene en `bultos[].linking[]` con `meta: "Etiqueta"`.** Es el único camino respaldado por la documentación oficial y además es a prueba de cambios de path.
- **Ambiente:** producción y QA
- **Auth:** `x-authorization-token: {token}` (🔵 inferencia: el link devuelto apunta al mismo gateway autenticado)
- **Request:**

| Campo | Tipo | Obligatorio | Descripción | Fuente |
|---|---|---|---|---|
| `numeroDeEnvio` | path | **Sí** | Número de envío del bulto | 🟢 |
| `tipo` | query | No | Vacío o ausente = etiqueta estándar. `documentoDeCambio` = etiqueta de documento de cambio | 🟡 |

- **Ejemplo de request:**

```http
GET /v2/360000000036820/etiquetas HTTP/1.1
Host: apis.andreani.com
x-authorization-token: eyJhbGciOi...
```

- **Response OK:** 🟡 **200 con el PDF binario en el body.** El SDK PHP hace `return (object)array('pdf' => $response->body)` cuando el status es 200; si no es 200, parsea el body como JSON de error.
- **Responses de error:** ⛔ no documentadas
- **Notas y trampas:**
  - **Una etiqueta por bulto.** Un envío de 3 bultos tiene 3 links y se imprimen 3 etiquetas.
  - **Formatos: solo hay evidencia de PDF.** ⛔ **Cero evidencia de ZPL o PNG** en ninguna fuente, oficial o de terceros. Si el comercio usa impresora térmica Zebra, esto es un problema operativo real: hay que rasterizar el PDF. **Preguntar explícitamente por ZPL.**
  - ⛔ **Tamaños de etiqueta: no documentados.** Ningún parámetro de tamaño en ninguna fuente.
  - ⛔ **No existe endpoint de etiquetas en lote.** El modelo es un link por bulto. (Los "lotes" de `almacenes/{idAlmacen}/lotes` son lotes de stock, cosa distinta.)
  - ⛔ **No existe endpoint de manifiesto/remito de despacho generable.** Lo más cercano es `multimedia`, que devuelve documentos ya digitalizados a posteriori.
- **Fuente:** https://developers.andreani.com/documentacion (*Get a label* y `linking` de la creación) · https://github.com/alejoasotelo/andreani-sdk-rest

---

## 4.5 Tracking

### Trazas de un envío

- **Método y path:** `GET /envios/{numeroAndreani}/trazas` — 🟡 variante de terceros: `/v2/envios/...`
- **Ambiente:** producción y QA
- **Auth:** `x-authorization-token: {token}`
  > 🟢 Nota oficial de esta sección: *"For this version you need to configure your username by the Andreani team. Contact your salesperson."* — **este endpoint requiere habilitación explícita por parte de Andreani.** No alcanza con tener credenciales.
- **Request:** parámetro de path. ⛔ Sin query params documentados
- **Response OK:**

| Campo | Tipo | Descripción |
|---|---|---|
| `eventos[].Fecha` | string | ISO 8601 **sin offset de zona** |
| `eventos[].Estado` | string | Nombre del estado |
| `eventos[].EstadoId` | integer | Código del estado |
| `eventos[].Motivo` | string | **Opcional.** Solo presente en algunos estados |
| `eventos[].MotivoId` | integer | **Opcional** |
| `eventos[].Traduccion` | string | Texto operativo. **Cambia de semántica**: si hay `Motivo`, repite el motivo; si no, trae una descripción en mayúsculas |
| `eventos[].Sucursal` | string | Nombre de la sucursal |
| `eventos[].SucursalId` | integer | Id de la sucursal |
| `eventos[].Ciclo` | string | Observado: `Distribution` |

```json
{
  "eventos": [
    { "Fecha": "2021-03-09T11:08:03", "Estado": "Pendiente de ingreso", "EstadoId": 1,
      "Traduccion": "ENVIO INGRESADO AL SISTEMA", "Sucursal": "Sucursal Genérica",
      "SucursalId": 999, "Ciclo": "Distribution" },
    { "Fecha": "2021-03-09T11:08:09", "Estado": "Ingreso al circuito operativo", "EstadoId": 5,
      "Traduccion": "ENVIO INGRESADO AL SISTEMA", "Sucursal": "Monserrat",
      "SucursalId": 12, "Ciclo": "Distribution" },
    { "Fecha": "2021-03-09T11:53:55", "Estado": "En distribución", "EstadoId": 6,
      "Traduccion": "ENVIO CON SALIDA A REPARTO", "Sucursal": "Monserrat",
      "SucursalId": 12, "Ciclo": "Distribution" },
    { "Fecha": "2021-03-09T11:59:04", "Estado": "Visita", "EstadoId": 11,
      "Motivo": "No se encuentra el titular", "MotivoId": 36,
      "Traduccion": "No se encuentra el titular", "Sucursal": "Monserrat",
      "SucursalId": 12, "Ciclo": "Distribution" }
  ]
}
```

- **Notas y trampas:**
  - **Los nombres de campo empiezan en mayúscula** (`Fecha`, `Estado`, `EstadoId`), a diferencia del resto de la API que usa camelCase. Configurar el serializador en consecuencia o mapear explícitamente.
  - `Fecha` **no trae zona horaria**. Interpretar como hora de Argentina (UTC−3) y convertir a UTC al persistir.
  - **No hay id único de evento** en la respuesta. Para deduplicar hay que usar la tupla `(numeroDeEnvio, Fecha, EstadoId, MotivoId)`. Ver `09-webhooks-o-polling.md`.
  - 🟡 Advertencia de terceros: la **v1** de trazas devolvía campos que la v2 no trae, y en v2 conviene confirmar la entrega consultando la orden.
- **Fuente:** https://developers.andreani.com/documentacion (*Get the traces of a shipment*)

### Consultar un envío

- **Método y path:** `GET /envios/{numeroAndreani}` — 🟡 variante: `/v2/envios/...`
- **Auth:** `x-authorization-token: {token}`
- **Response OK:**

```json
{
  "numeroDeTracking": "360000044179430",
  "contrato": "300006611",
  "ciclo": "Distribution",
  "estado": "Pendiente",
  "estadoId": 21,
  "fechaEstado": "2021-03-09T11:59:04",
  "sucursalDeDistribucion": { "nomenclatura": "MONSERRAT", "descripcion": "Monserrat", "id": 12 },
  "fechaCreacion": "2021-03-10T11:18:01",
  "destino": {
    "Postal": {
      "localidad": "C.A.B.A.", "pais": "Argentina",
      "direccion": "AV J MANUEL DE ROSAS 380", "codigoPostal": "1002"
    }
  },
  "remitente": {},
  "destinatario": {
    "nombreYApellido": "Juana Gonzalez",
    "tipoYNumeroDeDocumento": "PAS783297632",
    "eMail": "destinatario@andreani.com"
  },
  "bultos": [
    { "kilos": 0.005, "valorDeclaradoConImpuestos": 1452, "IdDeProducto": "123456789", "volumen": 0.000005 }
  ],
  "idDeProducto": "123456789",
  "referencias": [ "360000044179430", "2", "B", "123456789" ]
}
```

- **Notas y trampas:**
  - 🚨 **`estadoId` (envío) y `EstadoId` (traza) son enumeraciones DISTINTAS.** En el ejemplo oficial, `fechaEstado` coincide exactamente con el timestamp del último evento de traza (`Visita`, `EstadoId` 11), pero el `estadoId` de cabecera es **21 / `Pendiente`**. Tratarlas como un mismo catálogo es un error de diseño. **GAP-17.**
  - La forma de los sub-objetos cambia respecto de la creación: `destino.Postal` con **P mayúscula**, `destinatario` es un **objeto** (no array), `sucursalDeDistribucion.id` es **int** (en la creación es string), `bultos[].volumen` (no `volumenCm`) y en unidades distintas (`0.000005` — presumiblemente m³).
  - `referencias` acá es un **array de strings planos**, no de `{meta, contenido}`.
- **Fuente:** https://developers.andreani.com/documentacion (*Get a shipment*)

### Tracking masivo

- **Método y path:** `GET /envios`  (masivo) — 🟡 variante: `/envios`
- **Auth:** `x-authorization-token: {token}`
- **Request:** ⛔ **Sin parámetros de filtro documentados.** Confirmado en pasada dedicada: no hay `contrato`, `fechaDesde`, `fechaHasta`, `estado`, `pagina`, `limit` ni `offset` publicados.
- **Response OK:** `{ "envios": [ ...misma forma que Get a shipment... ] }`
- **Notas y trampas:** sin filtros documentados, este endpoint es **inutilizable para polling eficiente** tal como está descripto. **Preguntar por los filtros reales** — es lo que determina si la estrategia de polling es viable. Ver `09-webhooks-o-polling.md`.
- **Fuente:** https://developers.andreani.com/documentacion (*Shipping tracking*)

### Multimedia de un envío

- **Método y path:** `GET /envios/{numeroAndreani}/multimedia` — 🟡 variante: `/v2/envios/...`
- **Auth:** `x-authorization-token: {token}`
- **Response OK:**

```json
{
  "numeroDeEnvio": "360000036137650",
  "multimedia": [ { "meta": "constanciaelectronica", "contenido": "link" } ]
}
```

- **Notas y trampas:** 🟢 la doc describe que puede devolver *"Constancias Electrónicas", "Constancias de hojas de ruta", "remitos"* u otros documentos digitales. Es **lo más parecido a una prueba de entrega** que ofrece la API, pero devuelve **links, no datos estructurados**: no hay campo "quién recibió", "cuándo" ni "firma". ⛔ **GAP-16.**
- **Fuente:** https://developers.andreani.com/documentacion (*List all multimedia*)

---

## 4.6 Datos maestros

Documentados en detalle en `03-catalogo-servicios-cobertura.md`.

| Endpoint | Método | Auth | Resumen |
|---|---|---|---|
| `/sucursales` | GET | Sí | Todas las sucursales Andreani. Sin filtros |
| `/puntos-de-tercero` | GET | Sí | Puntos habilitados **por contrato B2C**. 12 filtros, incluido `codigoPostal`. Devuelve `codigosPostalesAtendidos` |
| `/localidades` | GET | **No** | Localidades y CP de Argentina. Filtros: `localidad`, `provincia`, `idProvLocalidad`, `codigosPostales`, `partido`, `p` |

---

## 4.7 Utilidades de códigos

### Generar QR

- **Método y path:** `GET /codigos-qr/{informacion}` (⛔ verbo no declarado en la doc)
- **Descripción oficial:** "Generates a QR with the sent information"
- **Notas:** ⛔ sin parámetros, headers ni response documentados. Utilidad marginal: no hace falta para el flujo de e-commerce.

### Generar código de barras

- **Método y path:** `GET /codigos-de-barras/{informacion}`
- **Descripción oficial:** "Generates a bar code with the sent information"
- **Notas:** idem anterior.

---

## 4.8 Notificación PUSH de movimientos (webhook invertido)

- **Método y path:** **lo define el cliente.** La doc dice literalmente `A Definir por el cliente` para Productive URL, QA URL y Method.
- **Descripción oficial, textual:**
  > "Sending the movements generated by the shipments to a Web Service / API. The definition of the request, both the properties and the format of the data to be sent, is the responsibility of the client. You can count on security: Basic Authentication, OAUTH, OAUTH2, etc."
- **Campos del payload (documentados):**

| Campo | Descripción oficial |
|---|---|
| `idAndreani` | Código de seguimiento dentro de los sistemas de Andreani |
| `idCliente` | Código de seguimiento dentro del sistema del cliente |
| `idTraza` | **Identificador único del movimiento en los sistemas de Andreani** |
| `event` | *Client Code 1* |
| `reason` | *Client Code 2* |

  > 🟢 "the names of the properties can be changed by those defined by the client"

- **Notas y trampas:** desarrollado en `09-webhooks-o-polling.md`. Lo esencial: **es un webhook invertido** — Andreani se adapta al contrato del cliente, no al revés. Y `event`/`reason` son *"Client Code"*, lo que significa que **el catálogo de estados y motivos se acuerda en el onboarding**. Esa es la vía real para obtener la tabla completa de estados.
- **Fuente:** https://developers.andreani.com/documentacion (sección *Sending the movements generated by the shipments to a Web Service / API*)

---

## 4.9 Esquemas de error

🟢 Existen **dos esquemas distintos** según el producto. Un cliente que consuma ambas familias necesita dos parsers.

**A — Transporte y distribución (beta).** Es un **array**:

```json
[ { "code": "string", "property": "string", "message": "string" } ]
```
Códigos declarados: **202**, **400**, **500**.
Fuente: https://developers-sandbox.andreani.com/docs/andreani/beta/creacion-de-una-nueva-orden-de-envio

**B — Almacenes / fulfillment.** ProblemDetails estilo RFC 7807, un **objeto**:

```json
{ "type": "string", "title": "string", "status": 0, "detail": "string",
  "errors": [ { "field": "string", "message": "string" } ] }
```
Códigos declarados: **200**, **400**, **401**, **404**, **500**.
Fuente: https://developers-sandbox.andreani.com/docs/andreani/obtener-acondicionamiento

⛔ **GAP-07: no hay ni un solo valor concreto de `code` ni un `message` de ejemplo publicado en ninguna fuente.**

---

## 4.10 Versionado — advertencia importante

🚨 **El versionado de los paths es el punto más ambiguo de toda la documentación, y equivocarse cuesta un 404.**

Lo que está verificado:

| Hecho | Certeza |
|---|---|
| La documentación oficial escribe los métodos **sin prefijo de versión**: `login`, `tarifas`, `ordenes-de-envio`, `envios/{n}/trazas`, `sucursales`, `localidades`, `puntos-de-tercero`, `codigos-qr`, `codigos-de-barras`, `almacenes/*` | 🟢 Verificado en dos pasadas independientes |
| El **único segmento de versión literalmente presente** en la página oficial es el `/v2/` de la URL de etiqueta dentro de la respuesta de creación: `https://apisqa.andreani.com/v2/{numeroDeEnvio}/etiquetas` | 🟢 Verificado |
| Los SDKs de terceros construyen `/v1/tarifas` y `/v2/ordenes-de-envio/{n}/etiquetas` | 🟡 Dos SDKs independientes |
| No hay política de versionado, changelog ni avisos de deprecación publicados | 🟢 Verificado por ausencia |

**Regla de implementación:**

1. **Para etiquetas: no construir la URL.** Usar el link de `bultos[].linking[].contenido` con `meta: "Etiqueta"`. Es el único path respaldado por la documentación oficial y sobrevive a cambios de versión.
2. **Para el resto: hacer el path configurable por endpoint**, con el valor de la doc oficial como default y la variante versionada como alternativa. Una constante por endpoint, no una URL armada a mano en cada llamada.
3. **Probar ambas variantes en QA en la primera sesión** y dejar documentado cuál responde. Es media hora de trabajo que evita un 404 en producción.

> El único "deprecated" encontrado en todo el ecosistema Andreani es la API *Novedades Standard* de GlobAllPack, que es producto internacional.

## 4.11 Endpoints de Fulfillment / almacenes (fuera de alcance)

Inventariados para completitud. No aplican al flujo de e-commerce de Tiendafy salvo que se contrate el servicio de almacenamiento de Andreani.

| Operación | Método | Path |
|---|---|---|
| Alta de pedido | POST | `/almacenes/{idAlmacen}/pedidos` |
| Orden de compra | POST | `/almacenes/{idAlmacen}/orden-de-compra` |
| Consulta de stock | GET | `/almacenes/stock` |
| Alta de lote | POST | `/almacenes/{idAlmacen}/lotes` |
| Mantenimiento de artículos | POST | `/almacenes/productos/{codigoArticulo}/mantenimiento` |
| Consulta de mantenimiento | GET | `/almacenes/productos/{codigoArticulo}/mantenimiento/{idTransaccion}` |
| Alta de destinatario | POST | `/almacenes/destinatarios` |
| Confirmación de recepción (PUSH de Andreani al cliente) | — | URL a definir por el cliente |

El portal `developers-sandbox.andreani.com` documenta este producto con mucho más detalle (OpenAPI), incluyendo Datos Maestros, Ingreso de Mercadería, Stock (traslado, cambio de propietario, acondicionamiento, kitting) y Salida de Pedidos.
