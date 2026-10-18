---
name: afip-wsaa-autenticacion
description: WSAA de ARCA (TRA, firma CMS, loginCms, Ticket de Acceso). Usala al tocar Fiscal.Infrastructure/Wsaa o ante faults como coe.alreadyAuthenticated, coe.notAuthorized o "no se corresponden token y firma".
---

# ARCA: WSAA (autenticación)

El cliente arma un **TRA** (XML), lo firma como **CMS/PKCS#7** con su
certificado y lo manda en base64 a `loginCms`. WSAA devuelve un **Ticket de
Acceso (TA)** con `token`, `sign` y `expirationTime` (hasta 12 h). Cada llamada
a un servicio de negocio lleva `Auth { Token, Sign, Cuit }`.

En Tiendafy: `Fiscal.Infrastructure/Wsaa/TraSigner.cs` (TRA y firma),
`WsaaClient.cs` (SOAP), `FiscalAuthenticator.cs` (caché en base y lock).

## TRA

```xml
<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>1760620800</uniqueId>                         <!-- xsd:unsignedInt -->
    <generationTime>2026-10-16T09:50:00-03:00</generationTime>
    <expirationTime>2026-10-16T10:10:00-03:00</expirationTime>
  </header>
  <service>wsfe</service>                                     <!-- un TA por servicio -->
</loginTicketRequest>
```

- `generationTime` en el pasado y `expirationTime` en el futuro, con offset;
  la especificación admite hasta 24 h para cada lado. Tiendafy usa −10 min /
  +10 min: holgado contra reloj corrido. El TRA no define cuánto dura el TA:
  la especificación dice 12 h desde la emisión.
- `uniqueId` es `unsignedInt`: epoch en segundos entra hasta 2106.
- `service`: `wsfe` para WSFEv1; el padrón tiene su propio id (ver
  `afip-padrones-validaciones`). Cada servicio pide su propio TA.

## Firma CMS

CMS "attached" (`SignedData` con el TRA adentro), incluyendo el certificado
del firmante. En .NET: `SignedCms` + `CmsSigner` con
`X509IncludeOption.EndCertOnly`; el digest queda en el default de .NET
(SHA-256). La especificación técnica v1.2.2 dice "SHA1+RSA" y Tiendafy todavía
no hizo un `loginCms` contra ARCA real: si el primero da `cms.sign.invalid`,
revisar el digest antes que la clave.

Gotcha de Windows: un `X509Certificate2` armado con `CreateFromPem` tiene clave
efímera y **no firma CMS**. Hay que pasar por PKCS#12
(`TraSigner.LoadForSigning`). En Linux anda igual, por eso se hace siempre.

## Llamada SOAP

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wsaa="http://wsaa.view.wsdl.afip.gov.ar/">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms><wsaa:in0>{CMS en base64}</wsaa:in0></wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>
```

`SOAPAction: ""`. La respuesta trae `loginCmsReturn` con el
`loginTicketResponse` escapado: `credentials/token`, `credentials/sign` y
`header/expirationTime`.

## Caché del TA (la regla que más importa)

- **ARCA no entrega otro TA mientras el anterior siga vigente**: responde un
  SOAP Fault con `coe.alreadyAuthenticated` en el `faultcode`. Por eso el TA
  no puede vivir en memoria (un reinicio deja a la tienda sin facturar hasta
  12 h). Tiendafy lo guarda **cifrado en la base** por tienda, servicio y
  ambiente, lo usa hasta 2 minutos antes de vencer y, ante ese fault, vuelve al
  guardado.
- **El TA es del certificado, no del CUIT**: se busca por tienda, servicio y
  ambiente. Corregir el CUIT no tiene que disparar otro login.
- Pedirlo bajo lock (`pg_advisory_xact_lock`) con doble chequeo adentro: dos
  workers pidiendo a la vez = uno recibe `alreadyAuthenticated`.
- Mismo certificado en dos sistemas (o una base restaurada sin el TA) = hasta
  12 h sin TA. No compartir certificados entre sistemas.

## Auth en WSFEv1

```xml
<ar:Auth>
  <ar:Token>…</ar:Token>
  <ar:Sign>…</ar:Sign>
  <ar:Cuit>30712345678</ar:Cuit>   <!-- CUIT que factura (representado) -->
</ar:Auth>
```

`Cuit` es el del emisor. Si no es el titular del certificado, el emisor tiene
que haberle delegado el servicio en el Administrador de Relaciones; si no,
WSFEv1 devuelve 600 o 601 (ver `afip-troubleshooting`).

## Faults frecuentes de WSAA

| Fault / mensaje | Causa | Qué hacer |
|---|---|---|
| `coe.alreadyAuthenticated` | Ya hay un TA vigente para ese certificado y servicio | Usar el guardado; si se perdió, esperar a que venza |
| `coe.notAuthorized` ("Computador no autorizado") | El certificado no está autorizado a ese servicio | Crear la autorización en WSASS (homologación) o en el Administrador de Relaciones (producción) |
| `cms.cert.untrusted` / `cms.cert.expired` | Certificado de otro ambiente, vencido o que no emitió ARCA | Certificado del ambiente correcto |
| `cms.bad` / `cms.sign.invalid` | CMS mal armado o clave que no corresponde | Revisar que la clave sea la del CSR |
| `xml.generationTime.invalid` / `xml.expirationTime.expired` / `xml.expirationTime.invalid` | Generación en el futuro o de más de 24 h; expiración ya pasada o a más de 24 h | NTP en el servidor; offset en las fechas |
| `wsn.notFound` | Id de servicio inexistente en el TRA | Revisar el `service` |
| `wsaa.unavailable` / `wsaa.internalError` / `wsn.unavailable` | Caída de ARCA | Reintentar, no antes de 60 s |

Regla de la especificación: ante un error que **no** sea `wsaa.*` ni
`wsn.unavailable`, no pedir otro TA hasta corregir la causa (autorización,
reloj, desarrollo); ante esos, no pedir otro dentro de los 60 s siguientes.

## Lo que NO hay que hacer

- Bajar `SECLEVEL` de OpenSSL ni desactivar la validación del certificado TLS
  "porque la firma va en el payload": el TA viaja en esa conexión. El problema
  de DH chico está solo en `servicios1` y se resuelve ofreciendo ECDHE (ver
  `afip-troubleshooting`).
- Pedir un TA por request.

Especificación técnica de WSAA:
<https://www.afip.gob.ar/ws/WSAA/Especificacion_Tecnica_WSAA_1.2.2.pdf>.
