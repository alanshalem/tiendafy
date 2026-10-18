# Códigos de WSFEv1 (FECAESolicitar), según el manual v4.8

Solo los que pueden aparecer en lo que hace Tiendafy (A, B, C y sus NC, en
pesos, productos). Para el resto, el manual: sección "Validaciones y errores"
de `FECAESolicitar`. El texto exacto lo manda ARCA en `Msg`: mostralo siempre.

## Infraestructura y autenticación (`Errors`)

| Código | Significado |
|---|---|
| 500 | Error interno de aplicación |
| 501 | Error interno de base de datos |
| 502 | Error interno de base de datos – autorizador CAE, transacción activa |
| 600 | No se corresponden token y firma / usuario no autorizado |
| 601 | CUIT representada no incluida en el token |
| 602 | No existen datos en nuestros registros |

## Excluyentes (rechazan)

### Emisor y cabecera

| Código | Validación |
|---|---|
| 10000 | Datos registrales del emisor (no RI, no autorizado a emitir, domicilio fiscal…); subcódigo en el mensaje |
| 10001 | `CantReg` entre 1 y 9998 |
| 10002 | `CantReg` igual a la cantidad de detalles |
| 10003 | Más registros que `FECompTotXRequest` (FCE: 1) |
| 10004 | `PtoVta` entre 1 y 99998 |
| 10005 | Punto de venta dado de alta y del tipo RECE (web services) |
| 10007 | `CbteTipo` no válido para la clase del emisor |
| 10012 | A, C, 49 y FCE: `CbteDesde` = `CbteHasta` |
| 10013 | A: `DocTipo` 80 |
| 10014 / 10015 | B en lote: promedio por comprobante por encima del umbral sin identificar al receptor |
| 10016 | Número no correlativo con el último autorizado, o `CbteFch` fuera de rango o anterior al último comprobante de la serie |

### Receptor

| Código | Validación |
|---|---|
| 10069 | El documento del receptor no puede ser el del emisor |
| 10284 | El número de documento no corresponde al tipo indicado (CUIT) |
| 10242 | `CondicionIVAReceptorId` no es un valor permitido |
| 10243 | `CondicionIVAReceptorId` no válido para la clase |
| 10246 | `CondicionIVAReceptorId` obligatorio (RG 5616, desde el 1-dic-2026) |
| 10247 | CUIT receptor inactivo o inválido (no aplica a NC) |
| 10248 | CUIT receptor limitado por sujeto no confiable en seguridad social (no aplica a NC) |
| 10067 / 10283 | B a no categorizado (23000000000) sin el tributo 13 |

### IVA e importes

| Código | Validación |
|---|---|
| 10018 | Objeto `Iva`: con `ImpIVA` 0 solo Id 3 (0%); con `ImpIVA` > 0 es obligatorio |
| 10019 / 10020 / 10021 | `AlicIva`: `Id` obligatorio, `BaseImp` > 0, `Importe` ≥ 0 (en ND/NC pueden ser 0) |
| 10022 | `Id` de alícuota repetido: totalizar por alícuota |
| 10023 | Suma de `Iva[].Importe` ≠ `ImpIVA` (tolerancia 0,01% o 0,01) |
| 10043–10047 | `ImpTotConc`, `ImpOpEx`, `ImpNeto`, `ImpTrib`, `ImpIVA` negativos (en C, los de IVA en 0) |
| 10048 | `ImpTotal` ≠ suma de componentes |
| 10051 | `Importe` no corresponde a `BaseImp` × alícuota |
| 10061 | Suma de `BaseImp` ≠ `ImpNeto` (no aplica a ND/NC) |
| 10070 | `ImpNeto` > 0 sin array `Iva` |
| 10071 | Clase C con array `Iva` |

### Moneda

| Código | Validación |
|---|---|
| 10037 | `MonId` fuera de `FEParamGetTiposMonedas` |
| 10038 | `MonCotiz` obligatoria (salvo `CanMisMonExt = S`) y > 0 |
| 10119 | Cotización fuera de 2%–400% de la orientativa |
| 10239 / 10240 / 10241 | `CanMisMonExt`: S o N; cotización no mayor en 1 a la oficial; con PES no se informa (o N) |

### Comprobantes asociados

| Código | Validación |
|---|---|
| 10040 | Tipos que se pueden asociar (NC A → A, NC B → B, NC C → C; tabla en `afip-tipos-comprobantes`) |
| 10122 | Con remitos asociados (88, 91, 988, 990–997), el receptor tiene que ser el del asociado |
| 10183 | FCE: el receptor tiene que ser el del comprobante asociado |

### Opcionales

| Código | Validación |
|---|---|
| 10123 | B o C con opcionales de la RG 4004-E: solo Id 17, 1801, 1802. **No** es "receptor distinto" |

## Observaciones (hay CAE)

| Código | Validación |
|---|---|
| 10017 | A: el receptor no está registrado y activo en el padrón |
| 10041 | El comprobante asociado (de punto de venta electrónico) no está en ARCA |
| 10063 | A: el receptor no está activo en IVA |
| 10188 | Por la categoría de emisor y receptor correspondía FCE |
| 10235 | El monto excede la categoría máxima de Monotributo |
| 10236 | El monto excede la categoría del Monotributo del emisor |
| 10237 | La NC supera al comprobante asociado |
| 10238 | El CUIT receptor no existe |
| 10245 | Falta `CondicionIVAReceptorId` (hasta el 30-nov-2026; en desuso desde la v4.8) |
| 10249 | El documento es de una persona fallecida sin sucesión indivisa |

## Eventos (`Events`)

Avisos de ARCA (cambios que vienen, mantenimiento). No son errores: loguearlos.
