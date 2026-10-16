---
name: afip-tipos-comprobantes
description: Qué CbteTipo y qué CondicionIVAReceptorId corresponden según emisor y receptor (A, B, C, notas de crédito, FCE) en WSFEv1. Usala al tocar ComprobanteBuilder o ReceptorResolver, o ante rechazos por clase o condición de IVA.
---

# ARCA: tipos de comprobante y condición del receptor

La clase sale del **emisor** y de la **condición frente al IVA del receptor**.
Desde el manual v4.0, además, `CondicionIVAReceptorId` tiene que ser válido
para la clase: una combinación prohibida se rechaza.

## Qué emite cada uno

| Emisor | Receptor | Clase |
|---|---|---|
| Responsable Inscripto | RI, Monotributo, Monotributista Social, Monotributo Trabajador Independiente Promovido | **A** (01, NC 03, ND 02) |
| Responsable Inscripto | Consumidor final, exento, no categorizado, exterior, IVA no alcanzado | **B** (06, NC 08, ND 07) |
| Monotributo (o exento) | Cualquiera | **C** (11, NC 13, ND 12) |
| RI con "operación sujeta a retención" | RI o Monotributo | A con leyenda (reemplaza a la clase M desde v4.1) |
| MiPyME a gran empresa, por encima del monto del régimen | CUIT | FCE: 201 (A), 206 (B), 211 (C) |

Tiendafy emite solo 1, 6, 11 y sus notas de crédito 3, 8, 13 (enum
`CbteTipo` en `Fiscal.Core/Domain/ComprobanteEnums.cs`). FCE, bienes usados
(49) y A con leyenda no aplican a una tienda online.

## CondicionIVAReceptorId válidos por clase

Del manual WSFEv1 v4.7 (sección "Condición frente al IVA del receptor"):

| Id | Condición | A / A con leyenda | B | C | 49 |
|---|---|:-:|:-:|:-:|:-:|
| 1 | IVA Responsable Inscripto | X | | X | |
| 4 | IVA Sujeto Exento | | X | X | |
| 5 | Consumidor Final | | X | X | X |
| 6 | Responsable Monotributo | X | | X | |
| 7 | Sujeto No Categorizado | | X | X | |
| 8 | Proveedor del Exterior | | X | X | |
| 9 | Cliente del Exterior | | X | X | |
| 10 | IVA Liberado – Ley 19.640 | | X | X | |
| 13 | Monotributista Social | X | | X | |
| 15 | IVA No Alcanzado | | X | X | |
| 16 | Monotributo Trabajador Independiente Promovido | X | | X | |

Consecuencias:

- **Un Monotributista con CUIT recibe A de un RI, no B.** Mandar B con
  condición 6 es una combinación inválida. Con condición 5 (consumidor final)
  pasa la validación de clase, pero es un dato falso para el Libro IVA
  Digital, que es justo lo que la RG 5616 vino a controlar.
- Para C vale cualquier condición: el emisor Monotributo no discrimina IVA.
- El catálogo puede cambiar: consultalo con
  `FEParamGetCondicionIvaReceptor(ClaseCmp)` (`A`, `B`, `C`, `M`, `49`; vacío
  = todas). En el SOAP del manual el elemento aparece como
  `FEParamGetCondicionFrenteIvaReceptor`: fiate del WSDL.

## Cómo resuelve Tiendafy el receptor (`ReceptorResolver`)

- 11 dígitos con verificador válido → `DocTipo` 80; 7 u 8 dígitos → 96 (DNI);
  si no → 99 con `DocNro` 0.
- Gana la condición declarada (la cargó el comercio, la declaró el comprador o
  la devolvió el padrón). Sin dato: prefijo 30, 33 o 34 → RI; persona física
  → consumidor final.
- La emisión automática no consulta el padrón y el checkout no pide la
  condición: un RI persona física recibe B salvo que se facture a mano.

## Reglas por clase

**A (01):** `DocTipo` 80 (10013); ARCA observa si el CUIT no está activo en
el padrón (10017) o en IVA (10063); array `Iva` obligatorio si hay neto.

**B (06):** consumidor final anónimo (`DocTipo` 99) solo por debajo del umbral
de identificación ($10.000.000 desde el 29-may-2025, RG 5700); por encima, CUIT,
CUIL, CDI o DNI. B a no categorizado (23000000000) con importe exige la
percepción de IVA (tributo 13). Admite lote.

**C (11):** sin array `Iva` (10071); `ImpNeto` es el subtotal;
`ImpTotal = ImpNeto + ImpTrib`.

**Notas de crédito (03, 08, 13):** con la factura en `CbtesAsoc`, de la misma
clase: 03 asocia a comprobantes A, 08 a B, 13 a C (10040 si no). El
comprobante asociado tiene que estar en ARCA (si no, observa 10041). Importes positivos y
no mayores que el asociado (observación 10237). Mismo receptor que la
factura: el manual solo lo valida explícitamente para FCE (10183) y remitos
(10122), pero una NC a otro receptor no anula la factura para nadie. Tiendafy
copia de la factura el documento y la condición guardada
(`receptor_condicion`), no los de la venta.

**FCE MiPyME (201/206/211):** `CantReg` 1, `FchVtoPago`, CBU en opcionales,
fecha −5/+1 día. Solo si algún día se le vende a una gran empresa por encima
del monto del régimen.

Tabla completa de códigos: `references/tabla-cbtetipo.md`.
