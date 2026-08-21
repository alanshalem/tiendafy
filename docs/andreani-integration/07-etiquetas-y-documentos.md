# 07 — Etiquetas y documentos

Responde las preguntas 17, 18 y 19 del checklist.

> **Advertencia previa:** este es, junto con la cotización, el área peor documentada de la API. Casi todo lo operativo de este documento es 🟡 de terceros o ⛔ GAP. Leerlo con eso en mente.

## 7.1 Cómo se obtiene la etiqueta

**No se construye la URL: se usa la que devuelve la creación de la orden.**

🟢 La respuesta de `POST /ordenes-de-envio` trae, **por cada bulto**, un array `linking` con un elemento de `meta: "Etiqueta"`:

```json
"bultos": [
  {
    "numeroDeBulto": "1",
    "numeroDeEnvio": "360000000036820",
    "totalizador": "1/2",
    "linking": [
      { "meta": "Etiqueta", "contenido": "https://apisqa.andreani.com/v2/360000000036820/etiquetas" }
    ]
  }
]
```

**Regla de implementación:** persistir `linking[meta=Etiqueta].contenido` como `label_url` de cada parcel y usar siempre ese valor. Es lo único respaldado por documentación oficial y es a prueba de cambios de path.

### El problema del path

🚨 **GAP-06.** Hay tres versiones del path circulando:

| Path | Fuente |
|---|---|
| `GET /v2/{numeroDeEnvio}/etiquetas` | 🟢 **Oficial** — es el que viene en `linking` |
| `GET /v2/ordenes-de-envio/{numeroAndreani}/etiquetas` | 🟡 SDK PHP |
| `ordenes-de-envio/{numeroAndreani}` | 🟢 Oficial, sección *"Get a label"* — **idéntico al de consultar la orden**, casi seguro un error de la documentación |

La sección "Get a label" de la documentación oficial no tiene tabla de parámetros, ni verbo, ni formatos. Es prácticamente un placeholder.

**Qué hacer:** usar el link de `linking`. Probar los dos primeros paths en QA y documentar cuál responde.

## 7.2 Formato de la etiqueta

| Formato | Evidencia |
|---|---|
| **PDF** | 🟡 El SDK PHP devuelve `(object)['pdf' => $response->body]` cuando el status es 200 — o sea, **PDF binario en el body de la respuesta**, no base64, no JSON |
| **ZPL** | ⛔ **Cero evidencia.** Ninguna fuente, oficial ni de terceros, menciona ZPL para la API de Andreani |
| **PNG / imagen** | ⛔ **Cero evidencia** |

⛔ **Tamaños de etiqueta: no documentados.** Ningún parámetro de tamaño en ninguna fuente.

### Por qué la ausencia de ZPL importa

Los comercios con volumen usan impresoras térmicas Zebra, que consumen ZPL nativamente. Sin ZPL hay dos caminos, ambos peores:

1. Imprimir el PDF por el driver del sistema. Funciona, pero la calidad del código de barras depende del rasterizado y del DPI. Es la fuente clásica de "el código no escanea en el depósito".
2. Convertir PDF→ZPL del lado de Tiendafy. Agrega una dependencia pesada y frágil.

**Es una pregunta de go/no-go para tiendas con volumen alto. Preguntarla explícitamente.**

### Parámetro `tipo`

🟡 Del SDK PHP:

| Valor | Constante en el SDK | Significado |
|---|---|---|
| *(ausente o vacío)* | `ETIQUETA_ESTANDAR` | Etiqueta normal |
| `documentoDeCambio` | `ETIQUETA_DOCUMENTO_DE_CAMBIO` | Etiqueta de documento de cambio |

```http
GET /v2/ordenes-de-envio/360000000036820/etiquetas?tipo=documentoDeCambio
```

⛔ La lista completa de valores válidos de `tipo` no está documentada. El esquema beta menciona `etiquetasDocumentoDeCambio` y `etiquetasPorAgrupador` como campos de respuesta, lo que sugiere que hay al menos tres variantes.

## 7.3 Etiquetas en lote

⛔ **GAP-15 — No existe endpoint de etiquetas en lote.** El modelo es **un link por bulto**.

> ⚠️ No confundir con `POST /almacenes/{idAlmacen}/lotes`: esos son **lotes de stock** del producto de Fulfillment, nada que ver con etiquetas.

El campo `etiquetasPorAgrupador` del esquema beta sugiere que **podría** existir una etiqueta agrupada por `agrupadorDeBultos`. ⛔ Sin documentación. **Preguntar.**

### Impresión masiva desde el panel admin

Como no hay lote del lado de Andreani, Tiendafy lo resuelve del suyo:

```
1. El operador selecciona N envíos en el panel.
2. Backend descarga las N etiquetas en paralelo (con límite de concurrencia, ej. 5).
3. Concatena los PDFs en uno solo (PdfSharpCore, QuestPDF o similar).
4. Devuelve un único PDF para imprimir de una vez.
5. Cachea el PDF individual de cada parcel para no re-descargar.
```

**Cachear las etiquetas es importante**: el operador va a reimprimir. Guardar el PDF en el object storage la primera vez y servirlo desde ahí, con la URL de Andreani como fallback.

> ⛔ **No documentado si la etiqueta cambia entre descargas** (algunos carriers invalidan la anterior). Verificar en QA descargando dos veces y comparando. Si cambia, no cachear.

## 7.4 Manifiesto de despacho

⛔ **No existe endpoint de manifiesto ni de remito de despacho generable.**

Lo más cercano es `GET /envios/{numeroAndreani}/multimedia`, que devuelve documentos **ya digitalizados a posteriori**: *"Constancias Electrónicas", "Constancias de hojas de ruta", "remitos"*. Es evidencia post-hoc, no un documento para despachar.

Si el comercio necesita un manifiesto para entregarle al chofer, hoy lo tiene que generar por su cuenta. **Tiendafy puede generarlo**: un PDF propio con la lista de `numeroDeEnvio`, destinatarios, bultos y un total, para que el chofer firme la recepción. No tiene valor contra Andreani, pero sirve como constancia interna del comercio.

**Preguntar si existe un proceso de manifiesto/hoja de ruta y si es API o portal.**

## 7.5 Qué imprimir y requisitos físicos

⛔ **La documentación oficial no publica requisitos físicos de impresión.** Verificado: las cadenas `pdf`, `Content-Type`, `Accept`, `application/pdf`, `zpl`, `manifiesto`, `tamaño de etiqueta` e `impresión` **no aparecen en ninguna parte** de la página de documentación.

Lo que sí se sabe:

| Elemento | Estado |
|---|---|
| Etiqueta por bulto | 🟢 **Obligatoria.** Es lo que lleva el código de barras del `numeroDeEnvio` |
| `numeroDePermisionaria` (ej. `RNPSP Nº 586`) | 🟢 Viene en la respuesta de creación. Es un dato regulatorio del Registro Nacional de Prestadores de Servicios Postales; presumiblemente ya viene impreso en la etiqueta |
| Etiqueta de documento de cambio | 🟡 Existe (`?tipo=documentoDeCambio`). Aplica a envíos con canje de documentación |
| Remito | 🟢 `remito.numeroRemito` se envía en la orden y `etiquetaRemito` vuelve en la respuesta. ⛔ Su uso no está documentado |
| Tamaño, DPI, calidad, ubicación del código de barras | ⛔ **No documentado** |

**Recomendación operativa para el checklist de go-live:** imprimir una etiqueta real de QA, en la impresora que va a usar el comercio, y **escanearla con un lector de código de barras** antes de habilitar producción. Es una prueba de cinco minutos que evita un problema de depósito que aparece recién con volumen. Está en el checklist de `13-plan-de-implementacion.md`.

## 7.6 Flujo de etiquetas en Tiendafy

```mermaid
sequenceDiagram
    autonumber
    actor OP as Operador (panel admin)
    participant FE as React admin
    participant API as Tiendafy API
    participant S3 as Object storage
    participant AND as apis.andreani.com

    OP->>FE: Selecciona envíos y pide "Imprimir etiquetas"
    FE->>API: POST /admin/shipments/labels {shipmentIds[]}
    API->>API: Expande shipments → parcels
    loop por parcel (concurrencia limitada)
        API->>S3: ¿Existe label PDF cacheado?
        alt HIT
            S3-->>API: PDF
        else MISS
            API->>AND: GET {parcel.label_url}
            AND-->>API: 200 PDF binario
            API->>S3: Guarda PDF
        end
    end
    API->>API: Concatena PDFs en uno
    API-->>FE: 200 application/pdf
    FE-->>OP: Abre diálogo de impresión
```

## 7.7 GAPs de este documento

| ID | GAP | Pregunta a Andreani |
|---|---|---|
| GAP-06 | Path de etiquetas ambiguo | ¿Cuál es el path canónico? ¿`/v2/{n}/etiquetas` o `/v2/ordenes-de-envio/{n}/etiquetas`? |
| — | Formatos | **¿Existe ZPL?** ¿Y PNG? ¿Hay parámetro de formato o de tamaño? |
| — | Valores de `tipo` | ¿Cuál es la lista completa? ¿Qué es `etiquetasPorAgrupador`? |
| GAP-15 | Lote y manifiesto | ¿Hay etiquetas en lote? ¿Hay manifiesto/hoja de ruta generable por API? |
| — | Estabilidad de la etiqueta | ¿La etiqueta cambia si la descargo dos veces? ¿Se puede cachear? |
| — | Requisitos físicos | ¿Tamaño mínimo, DPI, tipo de papel, ubicación del código de barras? ¿Hay una guía de impresión? |
| — | Remito | ¿Para qué sirve `etiquetaRemito`? ¿Cuándo es obligatorio el remito? |
