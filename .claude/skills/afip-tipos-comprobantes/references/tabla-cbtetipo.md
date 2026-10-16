# Códigos de CbteTipo (WSFEv1)

El catálogo vigente lo da `FEParamGetTiposCbte`. Los que usa Tiendafy van en
negrita.

## Clase A

| Código | Comprobante |
|---|---|
| **01** | Factura A |
| 02 | Nota de Débito A |
| **03** | Nota de Crédito A |
| 04 | Recibo A |
| 05 | Nota de Venta al Contado A |
| 34 | Cbtes. A del Anexo I, apartado A, inc. f), RG 1415 |
| 39 | Otros comprobantes A que cumplan con la RG 1415 |
| 60 | Cuenta de Venta y Líquido Producto A |
| 63 | Liquidación A |
| 201 / 202 / 203 | FCE MiPyME A: factura / ND / NC |

## Clase B

| Código | Comprobante |
|---|---|
| **06** | Factura B |
| 07 | Nota de Débito B |
| **08** | Nota de Crédito B |
| 09 | Recibo B |
| 10 | Nota de Venta al Contado B |
| 35 | Cbtes. B del Anexo I, apartado A, inc. f), RG 1415 |
| 40 | Otros comprobantes B que cumplan con la RG 1415 |
| 61 | Cuenta de Venta y Líquido Producto B |
| 64 | Liquidación B |
| 206 / 207 / 208 | FCE MiPyME B: factura / ND / NC |

## Clase C

| Código | Comprobante |
|---|---|
| **11** | Factura C |
| 12 | Nota de Débito C |
| **13** | Nota de Crédito C |
| 15 | Recibo C |
| 211 / 212 / 213 | FCE MiPyME C: factura / ND / NC |

## Otros

| Código | Comprobante |
|---|---|
| 49 | Comprobante de Compra de Bienes Usados a Consumidor Final |
| 51 / 52 / 53 / 54 | Clase M: factura / ND / NC / recibo. Desde el manual v4.1 (dic-2025) se reemplaza por "A con leyenda operación sujeta a retención" |
| 88, 91, 988, 990–997 | Remitos (electrónicos, cárnicos, harineros, tabaco) que pueden ir como asociados |

## Qué se puede asociar en CbtesAsoc (10040)

| Comprobante | Asociados válidos |
|---|---|
| 02, 03 (ND/NC A) | 01, 02, 03, 04, 05, 34, 39, 60, 63, 88, 991 |
| 07, 08 (ND/NC B) | 06, 07, 08, 09, 10, 35, 40, 61, 64, 88, 991 |
| 12, 13 (ND/NC C) | 11, 12, 13, 15 |
| 52, 53 (ND/NC M) | 51, 52, 53, 54, 88, 991 |
| 01, 06, 51 | 88, 991 |
| 202, 203 / 207, 208 / 212, 213 | La FCE de su clase (201–203 / 206–208 / 211–213) |
| 201, 206, 211 | 91, 990, 991, 993, 994, 995 |
