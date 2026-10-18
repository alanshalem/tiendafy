---
name: afip-padrones-validaciones
description: Validar un CUIT, consultar el padrón de ARCA (constancia de inscripción, getPersona_v2) para saber la condición frente al IVA, y los catálogos FEParamGet* de WSFEv1. Usala al tocar ConstanciaInscripcionClient, Cuit o ReceptorResolver.
---

# ARCA: CUIT, padrón y catálogos

## CUIT (módulo 11)

11 dígitos: 2 de tipo, 8 de número, 1 verificador.

```
pesos  = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]   # sobre los 10 primeros
v = 11 - (suma(d[i] * pesos[i]) % 11)
v = 0 si v == 11;  v = 9 si v == 10        # convención de ARCA
```

Implementado en `Fiscal.Core/Domain/Cuit.cs`. Prefijos: 20, 23, 24, 27 persona
física; 30, 33, 34 persona jurídica. El prefijo **no** dice la condición frente
al IVA de una persona física; de una jurídica, Tiendafy asume RI solo si no hay
dato mejor. 23000000000 = sujeto no categorizado (no se valida contra el
padrón).

Un CUIT con verificador válido puede no existir: ARCA lo informa como
observación (10238, "La CUIT receptora ingresada no existe"); uno inactivo o
inválido se rechaza (10247, salvo en notas de crédito); un número que no
corresponde a un CUIT, también (10284). Para A, ARCA además observa si no está
activo en el padrón (10017) o en IVA (10063).

## Padrón: constancia de inscripción (`getPersona_v2`)

Tiendafy lo usa para saber quién es un CUIT y su condición frente al IVA
(`Fiscal.Infrastructure/Padron/ConstanciaInscripcionClient.cs` y
`ConstanciaInscripcionResponse.cs`).

Confirmado en el manual oficial "Consulta a Padrón Constancia de Inscripción",
**v4.1, marzo 2026**
(<https://www.afip.gob.ar/ws/WSCI/manual_ws_sr_ws_constancia_inscripcion.pdf>):

- **Id del servicio para WSAA: `ws_sr_constancia_inscripcion`.** Es el viejo
  `ws_sr_padron_a5` renombrado (v2.0 del manual, nov-2017); el catálogo de
  ARCA marca el viejo como **deprecado**. Tiendafy pide TA para el nuevo y, si
  WSAA lo rechaza (certificado asociado solo al viejo), cae a
  `ws_sr_padron_a5`; el diagnóstico de conexión avisa que hay que asociar el
  nuevo.
- **Mismo web service**: URL `…/sr-padron/webservices/personaServiceA5`,
  namespace `http://a5.soap.ws.server.puc.sr/`, métodos `dummy`,
  `getPersona_v2` y `getPersonaList_v2` (hasta 250 claves; `getPersona` y
  `getPersonaList` siguen por compatibilidad).
- **Hosts**: el manual v4.1 da `awshomo.arca.gob.ar` / `aws.arca.gob.ar`. El
  16-oct-2026 `awshomo.arca.gob.ar` no resolvía por DNS; el 18-oct ya
  resolvía a la misma IP que `awshomo.afip.gov.ar` y devolvía el WSDL. Los
  cuatro hosts contestan el mismo servicio. Tiendafy sigue con los de
  `afip.gov.ar` (`FiscalEndpointsOptions`); cambiarlos pide repetir las
  pruebas de TLS.
- El id del servicio para WSAA puede ser largo: `ws_sr_constancia_inscripcion`
  tiene 28 caracteres (la columna del servicio en `fiscal_access_tokens` tuvo
  que ensancharse).
- El certificado necesita autorización aparte para el servicio del padrón,
  además de `wsfe`, y su propio TA (en homologación, desde WSASS).
- Request: `token`, `sign`, `cuitRepresentada` (tiene que estar en las
  relaciones del token) e `idPersona` (el consultado). `SOAPAction: ""`.
- Respuesta (`personaReturn`, hijos **sin namespace**, todos opcionales en el
  WSDL): `metadata`, `datosGenerales`, `datosRegimenGeneral`,
  `datosMonotributo`, `errorConstancia`, `errorRegimenGeneral`,
  `errorMonotributo`. `datosGenerales` trae `tipoPersona` (FISICA/JURIDICA),
  `apellido`/`nombre` o `razonSocial`, `domicilioFiscal`, `estadoClave`,
  `caracterizacion`… `impuesto` trae `idImpuesto`, `descripcionImpuesto`,
  `estadoImpuesto` (p. ej. `AC`), `motivo` y `periodo`.
  `categoriaAutonomo` y `categoriaMonotributo` también traen `idImpuesto`:
  leé los de `impuesto`, no cualquier `idImpuesto`.
- `errorConstancia` trae `error` (uno o varios), `idPersona` y también
  `nombre`/`apellido`: leé el nombre como hijo directo de `datosGenerales`.
  `errorRegimenGeneral` y `errorMonotributo` traen `error` y un `mensaje` fijo
  ("No cumple con las condiciones para enviar datos del régimen general /
  monotributo"): **sin ese bloque de datos la condición no se puede deducir**.
- CUIT inexistente: en `getPersona_v2` vuelve como **SOAP Fault** ("No existe
  persona con ese Id"); en `getPersonaList_v2`, como `errorConstancia` de esa
  persona.
- Cómo deduce Tiendafy la condición: `datosMonotributo` presente →
  Monotributo (6), aunque también tenga régimen general (un monotributista
  empleador figura con el impuesto 301); impuesto 30 en `datosRegimenGeneral`
  → RI (1); impuesto 32 → Exento (4); sin régimen general por un
  `errorRegimenGeneral`/`errorMonotributo` → `Padron.NoCondition` (no se
  adivina); si no → consumidor final (5).
- Feb-2026 (v3.9-4.1): `impuesto` suma `motivo` y `estadoImpuesto`;
  `caracterizacion` suma `fechaSolicitud` (la 639 es Ganancias simplificada,
  Ley 27.779). El anexo 5.3 lista los mensajes de error de la constancia.

Catálogo de web services de ARCA:
<https://www.afip.gob.ar/ws/documentacion/catalogo.asp> ("Padrón Constancia de
Inscripción").

## Catálogos de WSFEv1 (`FEParamGet*`)

No hardcodear lo que puede cambiar; cachear horas, no días.

| Método | Devuelve |
|---|---|
| `FEDummy` | Estado de AppServer, DbServer, AuthServer (sin `Auth`) |
| `FEParamGetTiposCbte` | Tipos de comprobante |
| `FEParamGetTiposConcepto` | 1, 2, 3 |
| `FEParamGetTiposDoc` | 80, 86, 87, 96, 99… |
| `FEParamGetTiposIva` | 3 = 0%, 4 = 10,5%, 5 = 21%, 6 = 27%, 8 = 5%, 9 = 2,5% |
| `FEParamGetTiposMonedas` | `PES`, `DOL`, `060`… |
| `FEParamGetCotizacion(MonId, FchCotiz?)` | Cotización orientativa (la fecha es opcional desde v4.0) |
| `FEParamGetTiposTributos` / `FEParamGetTiposOpcional` | Tributos y opcionales |
| `FEParamGetPtosVenta` | Puntos de venta de web services, con bloqueo y baja. **602 en homologación** (no lista nada) |
| `FEParamGetActividades` | Actividades del emisor |
| `FEParamGetTiposPaises` | Países |
| `FEParamGetCondicionIvaReceptor(ClaseCmp?)` | Condiciones válidas por clase (`A`, `B`, `C`, `M`, `49`); 10244 si la clase no existe |

## Condición frente al IVA del receptor (RG 5616)

Obligatoria en cada comprobante desde el **1-dic-2026** (manual WSFEv1 v4.8);
hasta entonces ARCA observa (10245). Ids y combinaciones válidas por clase: skill
`afip-tipos-comprobantes`. En Tiendafy: enum `CondicionIvaReceptor`
(`ComprobanteEnums.cs`), hoy con 1, 4, 5 y 6.

## Errores típicos

| Código | Qué pasa | Acción |
|---|---|---|
| 10017 (obs.) | A a un CUIT que no está activo en el padrón | Verificar el CUIT; quizás corresponde B |
| 10063 (obs.) | A a un receptor no activo en IVA | Revisar la condición |
| 10238 (obs.) | El CUIT receptor no existe | Pedir el CUIT de nuevo |
| 10247 | CUIT receptor inactivo o inválido (excluyente salvo NC) | Verificar el CUIT |
| 10249 (obs.) | El documento es de una persona fallecida sin sucesión | Revisar el documento |
| 10119 | Cotización fuera de 2%–400% de la orientativa | `FEParamGetCotizacion` |
| 10242 / 10243 | `CondicionIVAReceptorId` no permitido / no válido para la clase | `FEParamGetCondicionIvaReceptor` |
| 10245 (obs.) → 10246 | Falta la condición: hoy observa, desde el 1-dic-2026 rechaza | Mandarla siempre |
| Fault del padrón "no existe persona" | CUIT inexistente | Mostrarlo como dato inválido, no como caída |
| Fault de autorización en el padrón | Certificado sin autorización al servicio del padrón | Asociarle `ws_sr_constancia_inscripcion` (el viejo `ws_sr_padron_a5` está deprecado) |
