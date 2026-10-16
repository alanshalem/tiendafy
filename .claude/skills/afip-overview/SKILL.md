---
name: afip-overview
description: Mapa de la factura electrónica de ARCA (ex AFIP) y de cómo la implementa Tiendafy. Usala antes de tocar backend/src/Modules/Fiscal o para elegir qué skill afip-* cargar.
---

# ARCA (ex AFIP): mapa general

ARCA expone dos capas SOAP: **WSAA** (autenticación con un certificado X.509,
devuelve un Ticket de Acceso con Token y Sign que dura hasta 12 h) y los **web
services de negocio**. Tiendafy usa dos: **WSFEv1** (`wsfe`, factura con CAE
online) y el **padrón** (constancia de inscripción, para saber la condición
frente al IVA de un CUIT).

Fuente de verdad del proyecto: `docs/integraciones/arca.md` (qué hace, archivos,
flujos, lo que aprendimos de la API real y las pruebas de TLS). Esta skill no
repite eso: resume la API y apunta a las skills de detalle.

## Qué skill cargar

| Necesidad | Skill |
|---|---|
| Certificado, CSR, WSASS, relaciones, punto de venta | `afip-setup-certificados` |
| TRA, firma CMS, `loginCms`, caché del TA | `afip-wsaa-autenticacion` |
| `FECAESolicitar`, numeración, write-ahead, reconciliación | `afip-emision-cae` |
| A, B o C; notas de crédito; qué condición de IVA va con qué clase | `afip-tipos-comprobantes` |
| CUIT, padrón, `FEParamGet*`, condición frente al IVA | `afip-padrones-validaciones` |
| Un código de error, un fault, TLS | `afip-troubleshooting` |

## Hosts (explícitos por ambiente, nunca derivados)

| Servicio | Homologación | Producción |
|---|---|---|
| WSAA | `https://wsaahomo.afip.gov.ar/ws/services/LoginCms` | `https://wsaa.afip.gov.ar/ws/services/LoginCms` |
| WSFEv1 | `https://wswhomo.afip.gov.ar/wsfev1/service.asmx` | `https://servicios1.afip.gov.ar/wsfev1/service.asmx` |
| Padrón A5 | `https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5` | `https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5` |

Agregá `?WSDL` para ver el contrato. En el código viven en
`Fiscal.Infrastructure/Wsaa/WsaaOptions.cs` (`FiscalEndpointsOptions`). Los
hosts siguen en `afip.gov.ar` aunque el organismo se llame ARCA: no los
"corrijas" a `arca.gob.ar`.

## Flujo de una factura

1. Certificado autorizado a `wsfe` (una vez por ambiente).
2. WSAA → TA (Token + Sign). Se reusa hasta que vence.
3. `FECompUltimoAutorizado(PtoVta, CbteTipo)` → el número es ese + 1.
4. `FECAESolicitar` con `CondicionIVAReceptorId` en cada detalle.
5. Resultado `A` → CAE (14 dígitos) y `CAEFchVto`. `R` → errores y
   observaciones explican el rechazo. Sin respuesta → reconciliar con
   `FECompConsultar` antes de pedir otro número.
6. PDF con el QR de ARCA (RG 4892).

## Cambios normativos que importan (2025-2026)

- **Condición frente al IVA del receptor** (`CondicionIVAReceptorId`, RG
  5616/2024): campo nuevo desde el manual v4.0 (mar-2025), opcional desde
  abril de 2025 y **obligatorio desde el 1-dic-2026**: sin él, ARCA rechaza.
  Además, el valor tiene que ser válido para la clase del comprobante (ver
  `afip-tipos-comprobantes`). Tiendafy ya lo manda siempre.
- **Umbral para identificar al consumidor final**: $10.000.000 desde el
  29-may-2025 (RG 5700/2025). Es el default del umbral de la tienda.
- **Clase M**: el manual v4.1 (dic-2025) la reemplaza por "A con leyenda
  operación sujeta a retención".
- **CAEA** (RG 5782, manual v4.6, ago-2026): pasa a ser solo de contingencia.
  Tiendafy no usa CAEA y no lo va a usar (factura online, una por venta).
- Manual vigente al 16-oct-2026: WSFEv1 v4.7 (1-sep-2026); hay noticias de
  una v4.8. Antes de implementar algo nuevo, bajá el último.

## Reglas duras

- Certificados por ambiente: el de homologación no sirve en producción.
- El TA no se pide por request: ARCA no da otro mientras el anterior siga
  vigente (`coe.alreadyAuthenticated`). En Tiendafy se guarda cifrado en la base.
- El número lo decide ARCA (último autorizado + 1); la secuencia local es un
  espejo.
- Un timeout después de pedir el CAE no se reintenta a ciegas: ARCA pudo haber
  autorizado.
- TLS: `servicios1` ofrece DHE de 1024 bits. No se baja `SECLEVEL`: el cliente
  ofrece solo ECDHE (ver `afip-troubleshooting`).
- Homologación no tiene validez fiscal; nunca mezclar comprobantes de los dos
  ambientes en el libro IVA.

## Documentación oficial

- Portal de web services: <https://www.afip.gob.ar/ws/> (Documentación →
  manuales de WSAA y de WSFEv1).
- Manual del desarrollador WSFEv1 (RG 4291):
  <https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf>
- Catálogo de otros web services (padrón y constancia):
  <https://www.afip.gob.ar/ws/documentacion/catalogo.asp>
- Pasos para consumir un web service de factura electrónica:
  <https://www.arca.gob.ar/fe/ayuda/webservice.asp>
- Ejemplo comunitario en Python (Factura C, MIT, sin mantenimiento):
  <https://github.com/alandaitch/afip-facturacion>
