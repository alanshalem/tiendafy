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
(certificado, WSAA, `FECompUltimoAutorizado`, puntos de venta y padrón); con
ARCA caído, el paso de WSFEv1 queda en error. Los mensajes de ARCA se muestran tal
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

**Hosts:** siempre explícitos por ambiente, nunca derivados reemplazando el
dominio. Aunque un manual nuevo dé la URL en `arca.gob.ar`, probala antes
(DNS, certificado, TLS desde la imagen): el 16-oct-2026 `awshomo.arca.gob.ar`
(padrón de homologación, del manual de constancia v4.1) no resolvía por DNS;
el 18-oct ya andaba.

## Padrón (constancia de inscripción)

| Síntoma | Causa | Qué hacer |
|---|---|---|
| WSAA rechaza el TRA de `ws_sr_constancia_inscripcion` (`coe.notAuthorized`) | El certificado no está asociado a ese servicio | Asociarlo (WSASS en homologación, Administrador de Relaciones en producción). Tiendafy cae a `ws_sr_padron_a5` si ese sí está asociado |
| El diagnóstico avisa "anda con el servicio viejo" | Certificado asociado solo a `ws_sr_padron_a5`, deprecado por ARCA | Asociarle `ws_sr_constancia_inscripcion` antes de que ARCA corte el viejo |
| SOAP Fault "No existe persona con ese Id" | CUIT inexistente (en homologación, cualquier CUIT que no esté en los datos de prueba) | Es un dato inválido, no una caída |
| `Padron.NoCondition` | Vino `errorRegimenGeneral`/`errorMonotributo` sin los datos de ese régimen (mensaje fijo "No cumple con las condiciones para enviar datos…") | No se adivina: el comercio elige la condición a mano |
| `errorConstancia` con texto (constancia bloqueada, domicilio incompleto, CUIT limitada…) | Lo explica el anexo 5.3 del manual de constancia v4.1 | Mostrar el texto de ARCA tal cual |

El paso del padrón en el diagnóstico es opcional: un aviso ahí no deja la
conexión en rojo. Detalle: skill `afip-padrones-validaciones`.

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
| 10123 | Opcionales de la RG 4004-E en un B o C (no es "receptor distinto", como dicen algunos comentarios del código) | Tiendafy no manda opcionales: si aparece, algo cambió |
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
(el CUIT no existe), 10245 (falta la condición frente al IVA; desde el
1-dic-2026, manual v4.8, queda en desuso y la falta rechaza con 10246), 10249
(receptor fallecido).

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
"Canales de atención"). Documentación: <https://www.afip.gob.ar/ws/>; manual
WSFEv1 v4.8: <https://www.arca.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf>.
