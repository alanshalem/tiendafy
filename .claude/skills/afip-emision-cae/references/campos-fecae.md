# Campos de FECAEDetRequest (WSFEv1, manual v4.7)

En el orden de la `xsd:sequence` (el orden importa).

## Identificación

| Campo | Tipo | Notas |
|---|---|---|
| `Concepto` | int | 1 Productos, 2 Servicios, 3 Productos y servicios. Tiendafy: siempre 1 |
| `DocTipo` | int | 80 CUIT, 86 CUIL, 87 CDI, 96 DNI, 99 consumidor final anónimo (`DocNro` 0). Catálogo: `FEParamGetTiposDoc` |
| `DocNro` | long | 0 con `DocTipo` 99. A: CUIT activo en el padrón (si no, observa 10017). 23000000000 = no categorizado |
| `CbteDesde` / `CbteHasta` | long | 1 a 99999999. Iguales salvo B a consumidor final en lote |
| `CbteFch` | yyyymmdd | ±5 días (Concepto 1, sin salir del mes), ±10 (2 y 3); FCE: −5 / +1; nunca anterior al último de la serie |

## Importes (`double`, 13 enteros + 2 decimales)

| Campo | A y B | C |
|---|---|---|
| `ImpTotal` | `ImpTotConc + ImpNeto + ImpOpEx + ImpTrib + ImpIVA` | `ImpNeto + ImpTrib` |
| `ImpTotConc` | No gravado | 0 |
| `ImpNeto` | Suma de `BaseImp` de `Iva` (10061) | Subtotal |
| `ImpOpEx` | Exento | 0 |
| `ImpTrib` | Suma de `Tributos` | Idem |
| `ImpIVA` | Suma de `Iva[].Importe` (10023) | 0 |

Tolerancia: error relativo ≤ 0,01% o absoluto ≤ 0,01. Redondeo half-even.
Notas de crédito y débito: importes **positivos**.

## Servicios (Concepto 2 o 3)

`FchServDesde`, `FchServHasta`, `FchVtoPago` (yyyymmdd), obligatorias. Tiendafy
no factura servicios.

## Moneda

| Campo | Notas |
|---|---|
| `MonId` | `PES`, `DOL`, `060` (EUR)… Catálogo: `FEParamGetTiposMonedas` |
| `MonCotiz` | 1 con PES. Extranjera: entre 2% y 400% de la orientativa (10119); `FEParamGetCotizacion` acepta fecha desde v4.0 |
| `CanMisMonExt` | `S`/`N`: se cancela en la misma moneda extranjera. Con PES no se informa (o `N`). Con `S`, la cotización tiene que ser exactamente la de ARCA del día hábil anterior |

## Condición del receptor

`CondicionIVAReceptorId` (int): obligatorio desde el 1-dic-2026 (RG 5616). Si
el valor no existe, rechaza; si no es válido para la clase, rechaza en CAE.
Tabla por clase en la skill `afip-tipos-comprobantes`. Catálogo:
`FEParamGetCondicionIvaReceptor(ClaseCmp)`.

## Arrays

**`CbtesAsoc`** (notas de crédito y débito, FCE):

```xml
<ar:CbtesAsoc><ar:CbteAsoc>
  <ar:Tipo>6</ar:Tipo><ar:PtoVta>3</ar:PtoVta><ar:Nro>101</ar:Nro>
  <ar:Cuit>30712345678</ar:Cuit><ar:CbteFch>20261016</ar:CbteFch>
</ar:CbteAsoc></ar:CbtesAsoc>
```

`Cuit` (del emisor del asociado) y `CbteFch` son opcionales. En lugar de
`CbtesAsoc` se puede mandar `PeriodoAsoc` (`FchDesde`/`FchHasta`). La NC
tiene que ser de la misma clase y al mismo receptor que la factura.

**`Tributos`**: `Id` (`FEParamGetTiposTributos`), `Desc`, `BaseImp`, `Alic`,
`Importe`. B a no categorizado (23000000000) con importe exige el tributo 13,
percepción de IVA no categorizado (10283, v4.7).

**`Iva`** (solo A y B): `AlicIva { Id, BaseImp, Importe }`. Ids: 3 = 0%,
4 = 10,5%, 5 = 21%, 6 = 27%, 8 = 5%, 9 = 2,5% (`FEParamGetTiposIva`).

**`Opcionales`**: `Opcional { Id, Valor }` (`FEParamGetTiposOpcional`). Los
usan regímenes puntuales (RG 3668, RG 4004-E inmuebles, FCE 2101/27…).
Tiendafy no manda ninguno.

**`Compradores`**: varios receptores con porcentaje. **`Actividades`**:
actividades del emisor (`FEParamGetActividades`), obligatorias solo en ciertos
regímenes (remitos cárnicos, harineros, tabaco).

## Respuesta: `FECAEDetResponse`

| Campo | Notas |
|---|---|
| `Concepto`, `DocTipo`, `DocNro`, `CbteDesde`, `CbteHasta`, `CbteFch` | Eco del request |
| `Resultado` | `A` aprobado, `R` rechazado |
| `CAE` | String de 14 dígitos (solo con `A`) |
| `CAEFchVto` | yyyymmdd |
| `Observaciones` | `Obs { Code, Msg }`. Con `R` explican el rechazo |
