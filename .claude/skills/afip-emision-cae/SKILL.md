---
name: afip-emision-cae
description: Emitir con CAE en WSFEv1 (FECompUltimoAutorizado, FECAESolicitar, FECompConsultar) y el patrón write-ahead + reconciliación de Tiendafy. Usala al tocar EmitInvoiceHandler, WsfeClient o ComprobanteBuilder.
---

# ARCA: emisión con CAE (WSFEv1)

`FECAESolicitar` autoriza uno o más comprobantes y devuelve, por cada uno, un
**CAE de 14 dígitos** y su vencimiento (`CAEFchVto`, yyyymmdd). Requiere un TA
vigente de WSAA para `wsfe`.

Namespace SOAP: `http://ar.gov.afip.dif.FEV1/`; `SOAPAction:
http://ar.gov.afip.dif.FEV1/{Operación}`. Detalle de campos:
`references/campos-fecae.md`.

## El orden que usa Tiendafy (`EmitInvoiceHandler`)

1. Cortes sin llamar a ARCA: ya hay factura autorizada **en el ambiente
   actual** (una de homologación no cuenta en producción) o, para una NC, ya
   hay una autorizada con la misma clave; consumidor final anónimo por encima
   del umbral; el comprador es la propia tienda (ARCA no deja facturarse a uno
   mismo).
2. Lock de **sesión** por venta y después por serie (tienda, ambiente, punto
   de venta, tipo). Dentro del lock de la venta se repite el corte "ya tiene
   factura" y, para una NC, el tope: lo acreditado más lo que está en curso más
   la NC nueva no supera la factura (`CreditNoteLimit`).
3. `FECompUltimoAutorizado(PtoVta, CbteTipo)` → número = **ese + 1, exacto**.
   La secuencia local es un espejo y se corrige si quedó desfasada.
4. **Reconciliación**: cada comprobante de la serie que quedó `Pending` se
   consulta con `FECompConsultar`. Si ARCA lo tiene con el mismo receptor e
   importe, se adopta su CAE (una NC solo adopta el pendiente de su misma
   clave). "No existen datos" (602) significa que nunca llegó; cualquier otra
   duda frena la serie hasta revisarla a mano.
5. **Write-ahead**: se graba `Pending` con su número antes de pedir el CAE.
6. `FECAESolicitar`. Autorizado → CAE. Rechazado → el número no se consumió.
   Sin respuesta (timeout, respuesta ilegible, HTTP de error sin SOAP Fault,
   como un 502 de un proxy) → queda `Pending` para reconciliar. Solo un SOAP
   Fault es un rechazo seguro.

Por qué: un timeout después de pedir el CAE no dice nada; ARCA pudo haber
autorizado. Reintentar con otro número duplica la factura; reintentar con el
mismo da 10016 si ya se usó.

## Request mínimo (Factura B a consumidor final, RI, 21%)

```xml
<ar:FECAESolicitar>
  <ar:Auth>…</ar:Auth>
  <ar:FeCAEReq>
    <ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>3</ar:PtoVta><ar:CbteTipo>6</ar:CbteTipo></ar:FeCabReq>
    <ar:FeDetReq><ar:FECAEDetRequest>
      <ar:Concepto>1</ar:Concepto>
      <ar:DocTipo>99</ar:DocTipo><ar:DocNro>0</ar:DocNro>
      <ar:CbteDesde>101</ar:CbteDesde><ar:CbteHasta>101</ar:CbteHasta>
      <ar:CbteFch>20261016</ar:CbteFch>
      <ar:ImpTotal>12100.00</ar:ImpTotal><ar:ImpTotConc>0</ar:ImpTotConc>
      <ar:ImpNeto>10000.00</ar:ImpNeto><ar:ImpOpEx>0</ar:ImpOpEx>
      <ar:ImpTrib>0</ar:ImpTrib><ar:ImpIVA>2100.00</ar:ImpIVA>
      <ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>
      <ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>
      <ar:Iva><ar:AlicIva><ar:Id>5</ar:Id><ar:BaseImp>10000.00</ar:BaseImp><ar:Importe>2100.00</ar:Importe></ar:AlicIva></ar:Iva>
    </ar:FECAEDetRequest></ar:FeDetReq>
  </ar:FeCAEReq>
</ar:FECAESolicitar>
```

`FECAEDetRequest` es una `xsd:sequence`: **el orden de los elementos importa**.
`ImpTrib` va antes que `ImpIVA`; después `FchServ*`, `MonId`, `MonCotiz`,
`CanMisMonExt`, `CondicionIVAReceptorId`, `CbtesAsoc`, `Tributos`, `Iva`,
`Opcionales`, `Compradores`, `PeriodoAsoc`, `Actividades`.

## Reglas duras

- `CondicionIVAReceptorId` en **todo** comprobante (obligatorio desde el
  1-dic-2026, RG 5616) y válido para la clase (ver `afip-tipos-comprobantes`).
- `ImpTotal = ImpTotConc + ImpNeto + ImpOpEx + ImpTrib + ImpIVA`. Para C:
  `ImpTotal = ImpNeto + ImpTrib` (y `ImpTotConc`, `ImpOpEx`, `ImpIVA` en 0).
- Clase C **no** lleva el array `Iva` (10071). Si `ImpNeto > 0` en A/B, el
  array `Iva` es obligatorio (10070).
- Tolerancia de IVA: error relativo ≤ 0,01% **o** absoluto ≤ 0,01 (por
  alícuota). Redondeo de ARCA: half-even. Un epsilon fijo rechaza lo que ARCA
  acepta. Tiendafy desarma el IVA del total: neto redondeado al centavo, IVA =
  total − neto.
- Importes de notas de crédito: **positivos**, con `CbtesAsoc` apuntando a la
  factura. La NC no puede superar al comprobante asociado (observación 10237).
  El manual no dice nada de la suma de varias NC: ese tope lo pone Tiendafy.
- `CbteFch`: hasta 5 días antes o después (Concepto 1, sin salir del mes) o 10
  (Concepto 2 y 3), y **no anterior al último comprobante** de esa serie
  (10016). Vacía = fecha de proceso.
- `CbteDesde = CbteHasta` salvo B a consumidor final en lote. Tiendafy emite
  de a uno.
- `MonId = PES`, `MonCotiz = 1`; con PES no se manda `CanMisMonExt` (o va `N`).

## Respuesta

- Cabecera `FeCabResp.Resultado`: `A` aprobado, `R` rechazado, `P` parcial
  (lote con algunos rechazados).
- Detalle `FECAEDetResponse.Resultado`: `A` o `R`. Con `A` viene `CAE` y
  `CAEFchVto`; puede traer `Observaciones` igual.
- **Con `R`, el motivo suele estar en `Observaciones`**, no en `Errors`. Leer
  solo `Errors` deja rechazos "sin detalle".
- `Errors` (500, 501, 502, 600, 601, 602…) son de infraestructura o de
  autenticación: el request no se procesó.
- `Events`: avisos de ARCA (cambios próximos). Loguearlos.

## Otras operaciones

| Método | Uso |
|---|---|
| `FECompUltimoAutorizado(PtoVta, CbteTipo)` | Último número; el próximo es + 1 |
| `FECompConsultar(CbteTipo, CbteNro, PtoVta)` | Recuperar un comprobante (y su CAE) ya emitido. 602 = no existe |
| `FECompTotXRequest` | Máximo de comprobantes por request (FCE: 1) |
| `FEDummy` | Salud de AppServer, DbServer y AuthServer; sin autenticación |

## Errores típicos

| Código | Qué pasa | Acción |
|---|---|---|
| 10016 | Número no correlativo, o `CbteFch` fuera de rango o anterior al último | Releer `FECompUltimoAutorizado`; revisar la fecha |
| 10013 | Clase A sin `DocTipo` 80 | A siempre a CUIT |
| 10015 | B en lote por encima del umbral sin identificar | Identificar al receptor |
| 10048 | `ImpTotal` no cierra | Recalcular con la fórmula de arriba |
| 10070 / 10071 | Falta `Iva` en A/B / sobra `Iva` en C | Según la clase |
| 10242 / 10243 / 10246 | `CondicionIVAReceptorId` fuera del catálogo / no válida para la clase / faltante (rechazo desde el 1-dic-2026, manual v4.8; antes, observación 10245) | `FEParamGetCondicionIvaReceptor` |
| 10247 | CUIT receptor inactivo o inválido (no aplica a NC) | Verificar el CUIT |
| 600 / 601 | Token y firma no corresponden, o el CUIT no está en el TA | Delegación o certificado (ver `afip-troubleshooting`) |

Catálogo ampliado: skill `afip-troubleshooting`.
