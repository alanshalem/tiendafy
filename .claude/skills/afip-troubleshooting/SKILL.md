---
name: afip-troubleshooting
description: Diagnóstico de fallas contra ARCA (TLS dh key too small, faults de WSAA, errores 500-602 y validaciones 10000+ de WSFEv1). Usala cuando una factura se rechaza, el diagnóstico de Configuración → Facturación falla o hay que agregar una entrada a ArcaErrorCatalog.
---

# ARCA: troubleshooting

## Por dónde empezar

```
¿Falla el handshake TLS?            → "TLS" (abajo)
¿SOAP Fault de WSAA?                → skill afip-wsaa-autenticacion
¿Errors con 500/501/502/600/601/602? → "Errores de infraestructura"
¿Resultado R?                       → mirar Observaciones (ahí está el motivo) y Errors
¿Resultado A con Observaciones?     → hay CAE; corregir para la próxima
¿Timeout o HTTP sin SOAP Fault?     → NO es rechazo: reconciliar (afip-emision-cae)
```

En Tiendafy: `POST /api/v1/fiscal/test-connection` corre los pasos
(certificado, WSAA, `FECompUltimoAutorizado`, puntos de venta) y
`POST /fiscal/health` hace `FEDummy`. Los mensajes de ARCA se muestran tal
cual más una explicación si está en `Fiscal.Core/Domain/ArcaErrorCatalog.cs`
(hoy: 600, 10016, `alreadyAuthenticated`, `notAuthorized`). Solo se agregan
entradas que se conocen con certeza.

## TLS

**`dh key too small` / `DH_KEY_TOO_SMALL` solo en producción.**
`servicios1.afip.gov.ar` (WSFEv1 de producción) elige DHE antes que ECDHE si
el cliente ofrece los dos, con un grupo DH de 1024 bits; OpenSSL 3 con su
`SECLEVEL=2` por defecto corta. Homologación (`wswhomo`) y los demás hosts
negocian ECDHE: por eso "anda en homologación y revienta en producción".

- Solución de Tiendafy: el handler de ARCA (`FiscalModule.ArcaHandler`,
  compartido por WSAA, WSFEv1 y padrón) fija TLS 1.2/1.3 y una
  `CipherSuitesPolicy` **solo ECDHE con AEAD** en Linux. Negocia
  ECDHE-RSA-AES256-GCM-SHA384.
- **No** bajar `SECLEVEL` a 1 (ni global ni para ARCA), **no** desactivar la
  validación del certificado del servidor, **no** forzar DHE.
- .NET en Linux usa su propia lista (solo ECDHE) mientras el `openssl.cnf` no
  defina `CipherString`; si una imagen base lo define, ofrece DHE y falla. Por
  eso la política está en el código y no depende de la imagen.
- En Windows (desarrollo) la política no existe y decide SChannel.
- Si ARCA cambia algo, repetir las pruebas con `openssl s_client` desde la
  imagen de runtime (tabla y comandos en `docs/integraciones/arca.md`).
- Ningún host de ARCA habla TLS 1.3 hoy (oct-2026).

**Hosts:** siempre explícitos por ambiente. El certificado TLS de producción no
cubre `.gob.ar`: no derivar hosts reemplazando el dominio.

## Errores de infraestructura (`Errors`)

| Código | Significado (manual WSFEv1) | Qué hacer |
|---|---|---|
| 500 | Error interno de aplicación | Reintentar más tarde |
| 501 | Error interno de base de datos | Reintentar más tarde |
| 502 | Error interno de base de datos – autorizador CAE con transacción activa | Reintentar más tarde; reconciliar antes |
| 600 | No se corresponden token y firma / usuario no autorizado | Ver abajo |
| 601 | CUIT representada no incluida en el token | El CUIT de `Auth` no es el del certificado ni le delegó el servicio |
| 602 | No existen datos en nuestros registros | En `FECompConsultar` es "no existe"; en `FEParamGetPtosVenta` de homologación es normal |

**600** tapa dos causas que la respuesta no distingue: (1) el CUIT que
factura no es el del certificado y no le delegó `wsfe`, o (2) la relación
existe pero el contribuyente está inhabilitado (por ejemplo, monotributo dado
de baja por deuda). Revisar primero el estado del contribuyente.

## Rechazos más comunes en Tiendafy

| Código | Causa | Acción |
|---|---|---|
| 10016 | Número no correlativo, o fecha fuera de rango o anterior al último | El emisor se resincroniza; si se repite, otro sistema usa el mismo punto de venta |
| 10013 | A sin `DocTipo` 80 | A siempre a CUIT |
| 10284 | El número no corresponde al tipo de documento CUIT | Revisar el CUIT |
| 10040 | NC asociada a una factura de otra clase | NC de la misma clase que la factura |
| 10048 | `ImpTotal` no cierra | Recalcular |
| 10070 / 10071 | Falta `Iva` en A/B / sobra en C | Según la clase |
| 10242 / 10243 / 10246 | Condición del receptor inválida / no válida para la clase / faltante | `afip-tipos-comprobantes` |
| 10247 | CUIT receptor inactivo o inválido | Verificar el CUIT |
| 10005 / 10004 | Punto de venta inexistente o no habilitado para web services | Crear uno "RECE para aplicativo y web services" |
| 10069 | El documento del receptor es el del emisor (pasa al probar con el CUIT de la propia empresa) | Otro receptor: ARCA no deja facturarse a uno mismo |
| 10000 | El emisor no está habilitado (no es RI, no autorizado a emitir esa clase, sin domicilio fiscal…; el mensaje trae un subcódigo 01, 02…) | Revisar el estado del contribuyente en ARCA |

Observaciones que no rechazan pero conviene mostrar: 10017/10063 (receptor de
A no activo en el padrón o en IVA), 10041 (la factura asociada no está en
ARCA), 10188 (correspondía FCE), 10235/10236 (el monto
excede la categoría de Monotributo), 10237 (la NC supera a la factura), 10238
(el CUIT no existe), 10245 (falta la condición frente al IVA, obligatoria
desde el 1-dic-2026), 10249 (receptor fallecido).

Catálogo ampliado: `references/codigos-error.md`.

## Checklist antes de mandar

- TA vigente para `wsfe` y el CUIT de `Auth` es el emisor.
- Número = `FECompUltimoAutorizado + 1`; `CbteFch` dentro de rango y no
  anterior al último.
- `CondicionIVAReceptorId` presente y válido para la clase.
- Fórmula de `ImpTotal` de la clase; C sin `Iva`.
- NC: misma clase y receptor, factura en `CbtesAsoc`, importe ≤ factura.
- Comprobante grabado `Pending` antes de llamar (write-ahead).

Soporte de ARCA: el manual de WSFEv1 lista los canales de atención (sección
"Canales de atención"). Documentación: <https://www.afip.gob.ar/ws/>.
