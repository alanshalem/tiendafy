# 03 — Catálogo de servicios, sucursales y cobertura

Responde las preguntas 5, 6 y 7 del checklist.

## 3.1 Productos y modalidades de envío

### Lo que está documentado

🟢 **OFICIAL** — [developers.andreani.com/documentacion](https://developers.andreani.com/documentacion), campo del body de `POST /ordenes-de-envio`:

| Campo | Tipo | Obligatorio | Descripción textual |
|---|---|---|---|
| `tipoServicio` | string | No | **"Tipo de entrega a realizar. Ej: Domicilio / Sucursal"** |
| `tipoProducto` | string | No | "Categoría de producto a enviar. Ej: Linea Blanca, Electrodoméstico, etc." |
| `categoriaFacturacion` | string | No | "Categoria de facturacion" |
| `pagoDestino` | integer | No | **"Tipo de porte. Porte = 1, Debido = 2"** |

⛔ **GAP-12 — No existe una tabla de productos ni un catálogo de códigos de servicio.** La documentación da dos ejemplos entre comillas (`Domicilio`, `Sucursal`) y nada más. No hay endpoint de "listar servicios disponibles", no hay enum en el OpenAPI del sandbox (verificado: `tipoDeServicio` figura como `string` nullable, sin `enum`), y no hay lista de valores válidos de `tipoProducto` ni de `categoriaFacturacion`.

### Cómo se determina la modalidad en la práctica

La modalidad **no se elige principalmente con `tipoServicio`**, sino con la **forma del objeto `destino`**:

| Modalidad | Cómo se expresa en el request | Fuente |
|---|---|---|
| **Entrega a domicilio** | `destino.postal` con calle, número, localidad, CP | 🟢 doc |
| **Retiro en sucursal Andreani** | `destino.sucursal.id` — "Identificador de la sucursal Andreani destino del envío, **debe tener atención al cliente**, por la cual se retirará el envío" | 🟢 doc |
| **Imposición en domicilio del remitente** (retiro por Andreani) | `origen.postal` | 🟢 doc |
| **Imposición en sucursal** (el comercio despacha) | `origen.sucursal.id` — "Sucursal de imposición... **se debe calcular con API de sucursales, una con atención al cliente**" | 🟢 doc |

**`origen` y `destino` deben contener exactamente uno de `postal` o `sucursal`.** Esa es la regla estructural principal del contrato.

Y además, cada modalidad usa **un contrato distinto** (ver `02-alta-credenciales-ambientes.md` §2.4): `CONTRATO_DOMICILIO` vs `CONTRATO_SUCURSAL`.

> **Interpretación honesta:** en Andreani el "producto" está codificado en el **contrato**, no en un campo del request. El contrato lleva embebido el canal (B2C/B2B), la modalidad y probablemente el nivel de servicio y las tarifas negociadas. `tipoServicio` parece ser una etiqueta descriptiva más que un selector. Esto hay que confirmarlo — es la pregunta que más define el diseño del selector de envío en el checkout.

### Modalidades que Andreani ofrece comercialmente pero NO documenta en la API

| Modalidad | Estado |
|---|---|
| Urgente vs Estándar | ⛔ Sin evidencia de cómo se selecciona vía API |
| Punto de retiro de terceros (kioscos, farmacias, etc.) | 🟢 Existe: es lo que devuelve `GET /puntos-de-tercero`. Se usa igual que una sucursal, vía `destino.sucursal.id` |
| Buzón inteligente | 🟢 Existe: `/puntos-de-tercero` acepta el filtro `conBuzonInteligente` |
| Logística inversa / devoluciones | ⛔ Sin API. Ver `10-excepciones-y-devoluciones.md` |
| Contra reembolso / cobro en destino | 🟢 Parcial: `valorACobrar` y `bultos[].valorDeclaradoConImpuestos` "para gestiones cobranza", más `pagoPendienteEnMostrador` (bool) en el esquema beta. Sin documentación de cómo se rinde |

## 3.2 Sucursales — `GET /sucursales`

Devuelve **todas** las sucursales de Andreani. Sin filtros documentados.

🟢 **OFICIAL** — respuesta de ejemplo (transcripta tal cual de la doc, incluida la llave externa mal formada que trae la página):

```json
{
  [
    {
      "nomenclatura": "CNQ",
      "descripcion": "CORRIENTES",
      "direccion": {
        "localidad": "CORRIENTES",
        "region": "CORRIENTES",
        "pais": "Argentina",
        "codigoPostal": "3400",
        "componentesDeDireccion": [
          { "meta": "Calle",  "contenido": "Belgrano" },
          { "meta": "Numero", "contenido": "275" }
        ]
      },
      "telefonos": [ { "tipo": 2, "numero": "(03783) 42-0332" } ],
      "geocoordenadas": { "elevacion": 0, "latitud": -33.0133, "longitud": -58.53697 },
      "datosAdicionales": [ { "meta": "seHaceAtencionAlCliente", "contenido": "True" } ],
      "id": "48",
      "horarioDeAtencion": "Lunes a Viernes de 08:00 a 17:00 . Sábado de 08:00 a 12:00"
    }
  ]
}
```

**Trampas de este endpoint:**

- `datosAdicionales` es un array de pares `{meta, contenido}` con el valor como **string `"True"`**, no booleano. Hay que parsear.
- `seHaceAtencionAlCliente` es el flag que determina si la sucursal sirve como destino de retiro o como punto de imposición. **Filtrar por esto es obligatorio**: la doc dice explícitamente que la sucursal destino "debe tener atención al cliente".
- No hay paginación documentada. Es una descarga completa.
- ⛔ Sin filtros: no se puede pedir "sucursales del CP 1425". Para eso está `/puntos-de-tercero`.

## 3.3 Puntos de tercero por contrato — `GET /puntos-de-tercero`

🟢 **OFICIAL.** Anotado **"Only for B2C channel"**. Es el endpoint que sirve para poblar el selector del checkout.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `contrato` | string | **Sí** | "Contrato de tipo B2C" |
| `id` | string | No | ID de la sucursal |
| `admiteEnvios` | bool | No | Admite envíos |
| `entregaEnvios` | bool | No | Entrega envíos |
| `codigo` | string | No | Código de la sucursal |
| `sucursal` | string | No | Nombre de la sucursal abreviado |
| `region` | string | No | Nombre de la región abreviado |
| `localidad` | string | No | Nombre de la localidad |
| `codigoPostal` | string | No | **Código postal atendido por la sucursal deseada** |
| `canal` | string | No | Canal (B2C/B2B) |
| `seHaceAtencionAlCliente` | bool | No | Si se hace atención al cliente |
| `conBuzonInteligente` | bool | No | Con buzón inteligente |
| `numero` | string | No | ID de la sucursal no unificado |

Respuesta de ejemplo 🟢 **OFICIAL**:

```json
[
  {
    "id": 10048,
    "codigo": "CNQ",
    "numero": "48",
    "descripcion": "CORRIENTES",
    "canal": "B2C",
    "direccion": {
      "calle": "Av. Independencia ",
      "numero": "3903",
      "provincia": "Corrientes",
      "localidad": "Corrientes",
      "region": "Nea",
      "pais": "Argentina",
      "codigoPostal": "3400"
    },
    "coordenadas": { "latitud": "-27.479620", "longitud": "-58.804338" },
    "horarioDeAtencion": "Lunes a Viernes de 08:00 a 18:00 - Sábados de 08:00 a 13:00",
    "datosAdicionales": {
      "seHaceAtencionAlCliente": true,
      "tipo": "SUCURSAL",
      "admiteEnvios": true,
      "entregaEnvios": true
    },
    "telefonos": [ "0810-122-1111" ],
    "codigosPostalesAtendidos": [
      "3485","3411","3406","3480","3473","3436","3402","3449","3441","3483",
      "3412","3487","3414","3481","3405","3454","3403","3400","3401","",
      "3407","3410","3409","3416","3404","3453","3408","3418"
    ]
  }
]
```

**Diferencias importantes con `/sucursales`:**

| | `/sucursales` | `/puntos-de-tercero` |
|---|---|---|
| Requiere `contrato` | No | **Sí** |
| `id` | string (`"48"`) | **int** (`10048`) — ¡tipo distinto y valor distinto! |
| `datosAdicionales` | array de `{meta, contenido}` con strings | **objeto con booleanos reales** |
| Filtros | Ninguno | 12 filtros, incluido `codigoPostal` |
| `codigosPostalesAtendidos` | No | **Sí** — es la clave para cobertura |
| Alcance | Todas las sucursales Andreani | Puntos habilitados **para ese contrato** |

> ⚠️ **Trampa seria:** el mismo punto físico aparece con `id: "48"` en `/sucursales` y con `id: 10048` (y `numero: "48"`) en `/puntos-de-tercero`. **Cuál de los dos va en `destino.sucursal.id` no está documentado.** 🔵 Por el campo `numero` ("ID de la sucursal no unificado") la hipótesis más razonable es que el que va en la orden es el `numero`/`id` de `/sucursales`, pero **hay que verificarlo en QA con un envío real**. Ponerlo mal genera órdenes rechazadas o entregadas en la sucursal equivocada.

### Cómo poblar el selector del checkout

```
1. El comprador ingresa su CP.
2. GET /puntos-de-tercero?contrato={contratoSucursalDelTenant}
                        &codigoPostal={cp}
                        &entregaEnvios=true
                        &seHaceAtencionAlCliente=true
3. Renderizar la lista con descripción, dirección, horario y coordenadas
   (las coordenadas permiten ordenar por cercanía o mostrar un mapa).
4. El punto elegido se guarda y se envía como destino.sucursal.id al crear la orden.
```

**Cacheable con TTL largo** (24 h o más). El catálogo de sucursales cambia con frecuencia mensual, no diaria. Ver estrategia en §3.5.

## 3.4 Cobertura: dado un CP, qué servicios hay

⛔ **GAP-14 — No existe un endpoint de cobertura como tal.** No hay `/cobertura?cp=1425` ni nada equivalente. La cobertura se determina indirectamente:

| Modalidad | Cómo verificar cobertura |
|---|---|
| **Retiro en sucursal / punto** | `GET /puntos-de-tercero?contrato=X&codigoPostal=1425&entregaEnvios=true`. Si devuelve array vacío → sin punto de retiro en ese CP |
| **Entrega a domicilio** | 🔵 **Inferencia:** llamar al endpoint de cotización con ese `cpDestino`. Si cotiza, hay cobertura. Si devuelve error, no la hay. **La doc no dice esto.** Es la única vía disponible |
| **Existencia del CP** | `GET /localidades?codigosPostales=1425` (sin auth). Valida que el CP exista en el catálogo de Andreani |

⛔ **Qué pasa con destinos no cubiertos: no documentado.** No hay código de error publicado para "fuera de cobertura". Ver `11-errores-y-codigos.md`.

**Estrategia recomendada para el checkout de Tiendafy:**

1. Validar el CP contra el catálogo local de localidades (precargado desde `/localidades`). Si no existe → error de validación inmediato, sin llamar a la API.
2. Cotizar. Si la cotización falla o devuelve vacío → mostrar "Andreani no llega a esa dirección" y ofrecer los otros carriers configurados.
3. **Nunca dejar el checkout sin opciones**: si ningún carrier cotiza, mostrar un mensaje explícito y permitir "coordinar envío" o retiro en local.

## 3.5 Localidades y códigos postales — `GET /localidades`

🟢 **OFICIAL.** **No requiere autorización.** Es el endpoint más útil y menos conocido de la API.

| Parámetro | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `localidad` | string | No | Localidad/es por la/s que se desea filtrar |
| `provincia` | string | No | Provincia/s por la/s que se desea filtrar |
| `idProvLocalidad` | string | No | ID de la provincia que se desea consultar |
| `codigosPostales` | string | No | Códigos postales por los que se desea filtrar |
| `partido` | string | No | Partidos por los que se desea filtrar |
| `p` | string | No | Paginación: número de localidades que se desea obtener |

Respuesta 🟢 **OFICIAL**:

```json
[
  {
    "idDeProvLocalidad": 107362,
    "localidad": "PASO DE LOS LIBRES",
    "provincia": "CORRIENTES",
    "codigosPostales": [ "3230" ]
  }
]
```

**Por qué importa tanto:** el campo `destino.postal.localidad` de la orden de envío tiene 40 caracteres y **el nombre debe coincidir con el catálogo de Andreani**. La causa número uno de rechazos en integraciones logísticas argentinas es una localidad escrita distinto ("CABA" vs "C.A.B.A." vs "Ciudad Autónoma de Buenos Aires"). Este endpoint es la fuente de verdad.

**Estrategia obligatoria:** precargar el catálogo completo en PostgreSQL, refrescarlo con un job semanal, y **normalizar la localidad del comprador contra ese catálogo antes de crear la orden**, no después de recibir el error.

> El ejemplo muestra las localidades en **MAYÚSCULAS y sin acentos** (`PASO DE LOS LIBRES`, `C.A.B.A.`). Normalizá comparando sin acentos y case-insensitive, pero **enviá el string exacto del catálogo**.

## 3.6 Estrategia de cache de datos maestros

| Dato | Origen | TTL sugerido | Invalidación | Dónde |
|---|---|---|---|---|
| Localidades y CP | `GET /localidades` | 7 días | Job semanal programado | **PostgreSQL** (tabla propia, se consulta con joins y búsquedas por texto) |
| Sucursales Andreani | `GET /sucursales` | 24 h | Job diario | PostgreSQL + Redis para el lookup por id |
| Puntos de tercero por contrato | `GET /puntos-de-tercero?contrato=X` | 12 h | Por `(tenant, contrato)`. Purga al cambiar el contrato del tenant | **Redis**, clave `andreani:puntos:{contrato}:{cp}` |
| Sucursales por CP (selector checkout) | derivado | 12 h | idem | Redis |

Las localidades van a PostgreSQL y no a Redis porque son datos relacionales que se consultan con LIKE y joins, y porque son la base de la validación de direcciones, que debe funcionar aunque Redis esté caído.

## 3.7 GAPs de este documento

| ID | GAP | Pregunta a Andreani |
|---|---|---|
| GAP-12 | Sin catálogo de `tipoServicio`, `tipoProducto`, `categoriaFacturacion` | ¿Cuál es la lista de valores válidos de cada uno? ¿`tipoServicio` es selector real o solo descriptivo? |
| GAP-14 | Sin endpoint de cobertura por CP | ¿Cómo verifico cobertura a domicilio para un CP antes de cotizar? |
| — | Ambigüedad de `id` de sucursal | ¿Qué id va en `destino.sucursal.id`: el `id` de `/sucursales` o el `id`/`numero` de `/puntos-de-tercero`? |
| — | Servicio urgente vs estándar | ¿Cómo se selecciona el nivel de servicio? ¿Es un contrato distinto? |
| — | Contra reembolso | ¿Cómo funciona `valorACobrar` y `pagoPendienteEnMostrador`? ¿Cómo se rinde la cobranza? |
