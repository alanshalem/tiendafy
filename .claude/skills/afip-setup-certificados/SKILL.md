---
name: afip-setup-certificados
description: Alta del certificado de ARCA (CSR, WSASS, Administrador de Relaciones, delegación) y del punto de venta de web services. Usala para guiar a un comercio con el asistente de Configuración → Facturación o al tocar FiscalCertificateFactory.
---

# ARCA: certificado y punto de venta

Una vez por ambiente: clave RSA 2048 + CSR → ARCA firma el certificado → se lo
autoriza a cada servicio (`wsfe`, padrón) → punto de venta de web services.

## Cómo lo hace Tiendafy (el comercio no toca OpenSSL)

1. Cargá el emisor (CUIT, razón social, condición, ambiente).
2. `POST /api/v1/fiscal/certificate/csr`: el backend genera la clave RSA 2048
   (queda cifrada con Data Protection, purpose `Tiendafy.Fiscal.Secrets.v1`) y
   un CSR con subject `C=AR, O={razón social}, CN={alias}, SERIALNUMBER=CUIT {cuit}`.
   Alias por defecto: `tiendafy-homologacion` / `tiendafy-produccion`.
3. El comercio sube el CSR a ARCA (ver abajo) y pega el certificado.
4. `POST /fiscal/certificate/activate` verifica que sea X.509, que corresponda
   a la clave generada y lee el CUIT del titular.
5. `POST /fiscal/test-connection` corre el diagnóstico por pasos.

Código: `Fiscal.Infrastructure/Security/FiscalCertificateFactory.cs`. Si se
pierde el keyring de Data Protection (volumen `dpkeys`), la clave es
irrecuperable: hay que generar y activar un certificado nuevo.

## En ARCA, homologación

1. Con la clave fiscal **de persona física** (WSASS no es delegable ni se usa
   con la de una empresa), adherí el servicio **WSASS – Autogestión de
   Certificados Homologación** y entrá desde el portal de ARCA. (La URL
   directa vieja `wsass-homo.afip.gov.ar/wsass/portal/main.aspx` daba 404 el
   18-oct-2026.)
2. En WSASS: "Nuevo certificado" → alias + CSR → descargá el certificado
   (PEM).
3. En WSASS, "Crear autorización a servicio": el certificado (alias) →
   servicio `wsfe` y, si se va a consultar el padrón,
   `ws_sr_constancia_inscripcion` (ver `afip-padrones-validaciones`).
4. Punto de venta: en homologación se acepta cualquier número
   (`FEParamGetPtosVenta` devuelve 602, sin datos).

## En ARCA, producción

1. **Administración de Certificados Digitales** (clave fiscal nivel 3): agregar
   alias, subir el CSR, descargar el certificado.
2. **Administrador de Relaciones de Clave Fiscal** → Nueva relación → ARCA →
   Web Services → **Facturación Electrónica** (`wsfe`); como representante, el
   certificado (computador fiscal) creado en el paso 1. Repetir para el padrón
   si se usa (`ws_sr_constancia_inscripcion`; el viejo `ws_sr_padron_a5` está
   deprecado).
3. Si el certificado es de otra CUIT (un proveedor de software), el emisor
   **delega** el servicio en esa CUIT desde su Administrador de Relaciones.
4. **Punto de venta**: ABM de puntos de venta → sistema **"RECE para aplicativo
   y web services"** (Monotributo: "Factura Electrónica - Monotributo - Web
   Services"). Un punto de venta de "Factura en línea" o de controlador fiscal
   no sirve para WSFEv1.
5. Cargá ese número en el panel; el diagnóstico verifica con
   `FEParamGetPtosVenta` que exista, sea de web services y no esté bloqueado.

## Reglas duras

- Un certificado por ambiente; el de homologación no autentica en producción.
- Un certificado sirve para varios servicios: no hace falta uno por servicio.
- La clave no lleva passphrase (los servicios la usan sin intervención) y no
  sale nunca del backend.
- No usar el mismo certificado en dos sistemas: el TA vigente queda en el otro
  (`coe.alreadyAuthenticated`, ver `afip-wsaa-autenticacion`).
- El certificado vence (típicamente 2 años): hay que renovar antes, con un CSR
  nuevo.

## Problemas típicos

| Síntoma | Causa | Solución |
|---|---|---|
| `coe.notAuthorized` ("Computador no autorizado") | Falta la autorización del certificado a `wsfe` | WSASS (homologación) o Administrador de Relaciones (producción) |
| WSFEv1 da 600 o 601 | El CUIT que factura no es el del certificado y no lo delegó, o está inhabilitado | Delegación, o revisar el estado del contribuyente |
| Activar dice que no corresponde a la clave | Se pegó un certificado de otro CSR | Volver a subir el CSR que generó el panel |
| Funciona en homologación y no en producción | Certificado de homologación, o punto de venta que no es de web services | Certificado de producción y punto de venta RECE |

Con OpenSSL a mano (solo fuera de Tiendafy):

```bash
openssl genrsa -out clave.key 2048
openssl req -new -key clave.key -subj "/C=AR/O=Razon Social/CN=mi-sistema/serialNumber=CUIT 30712345678" -out pedido.csr
```

En Git Bash de Windows el `-subj` que empieza con `/` se convierte en ruta:
anteponé `MSYS_NO_PATHCONV=1` al comando.

Documentación oficial: <https://www.afip.gob.ar/ws/documentacion/wsaa.asp>
(obtener el certificado de producción y asociarlo a un servicio) y el manual
de WSASS: <https://www.afip.gob.ar/ws/WSASS/html/introduccion.html>.
