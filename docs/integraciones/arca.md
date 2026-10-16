# ARCA (ex AFIP): factura electrónica

Facturación electrónica de las ventas con CAE online (WSFEv1). Estado:
**completo en código y probado contra un ARCA simulado**; contra ARCA real solo
se verificó `FEDummy` en homologación. Falta activar un certificado (primero de
homologación, después de producción) para emitir el primer CAE de verdad.

## Qué hace en Tiendafy

- **Factura A, B o C** según el emisor y el comprador: Responsable Inscripto
  emite A (a otro RI o a un monotributista, este con la leyenda de la Ley
  27.618 en el PDF) o B (al resto); Monotributo emite C.
- **Emisión automática** opcional por tienda, al acreditarse el pago o al
  despachar, con una cola durable y reintentos.
- **Nota de crédito automática** cuando una venta se reembolsa por completo
  (y cuando Mercado Libre informa una venta facturada como cancelada o
  devuelta), al mismo receptor y con la misma clase que la factura, que va
  referenciada. Solo en las tiendas con la emisión automática prendida: con
  la facturación a mano no se encola ninguna (ver Pendiente). En Mercado
  Libre sale también si la auto-factura de ML está prendida (aunque la
  automática de la tienda no); si no sale sola, no se reintenta en cada aviso.
- **Emisión manual** desde Ventas (con documento y condición de IVA que puede
  completar el comercio) y facturas sueltas sin orden.
- **Ventas de Mercado Libre**: se facturan a consumidor final, con el botón
  "Facturar" o solas si la conexión de Mercado Libre tiene la auto-factura
  prendida (es otra opción, aparte de la de la tienda).
- **Consulta al padrón A5**: quién es un CUIT y su condición frente al IVA.
- **PDF** del comprobante con el QR de ARCA (adjunto en el email "factura" si
  la tienda prendió esa plantilla), **libro IVA ventas** del mes en CSV y un
  **diagnóstico de conexión** por pasos.
- **Asistente de certificado**: la clave privada y el CSR se generan en el
  backend; el comercio nunca toca OpenSSL ni ve la clave.

Fuera de alcance a propósito: CAEA, percepciones provinciales (solo IVA
nacional), servicios (el concepto es siempre Productos) y alícuotas distintas
del 21% (el envío se factura como ítem gravado al 21%).

## Cómo está implementado

| Pieza | Archivo |
|---|---|
| Emisor, preferencias y puntos de venta | `backend/src/Modules/Fiscal/Fiscal.Core/Domain/FiscalConfig.cs` |
| Certificado y ticket de acceso (TA) | `Fiscal.Core/Domain/FiscalCertificate.cs` (`FiscalCertificate`, `FiscalAccessToken`) |
| Comprobante y su estado | `Fiscal.Core/Domain/FiscalDocument.cs` |
| Cola de emisión | `Fiscal.Core/Domain/FiscalEmissionJob.cs`, `Fiscal.Infrastructure/Emission/FiscalEmissionQueue.cs` |
| Receptor (tipo de doc y condición IVA) | `Fiscal.Core/Domain/ReceptorResolver.cs` |
| Importes por clase | `Fiscal.Core/Domain/ComprobanteBuilder.cs` |
| Errores de ARCA explicados | `Fiscal.Core/Domain/ArcaErrorCatalog.cs` |
| CSR y validación del certificado | `Fiscal.Infrastructure/Security/FiscalCertificateFactory.cs` |
| Cifrado de secretos | `Fiscal.Infrastructure/Security/FiscalSecretProtector.cs` (purpose `Tiendafy.Fiscal.Secrets.v1`) |
| WSAA (TRA, firma CMS, loginCms, caché del TA) | `Fiscal.Infrastructure/Wsaa/TraSigner.cs`, `WsaaClient.cs`, `FiscalAuthenticator.cs` |
| Hosts por ambiente | `Fiscal.Infrastructure/Wsaa/WsaaOptions.cs` (`FiscalEndpointsOptions`) |
| WSFEv1 | `Fiscal.Infrastructure/Wsfe/WsfeClient.cs` |
| Emisión con lock, write-ahead y reconciliación | `Fiscal.Infrastructure/Emission/EmitInvoiceHandler.cs` |
| Padrón A5 | `Fiscal.Infrastructure/Padron/PadronA5Client.cs` |
| PDF con QR | `Fiscal.Infrastructure/Pdf/ComprobantePdfRenderer.cs` |
| TLS de los clientes de ARCA | `Fiscal.Infrastructure/FiscalModule.cs` |
| Worker de la cola | `backend/src/Api/Fiscal/FiscalEmissionWorker.cs` |
| Email "factura" con el PDF | `backend/src/Api/Fiscal/InvoiceEmail.cs` |
| Endpoints de configuración, padrón y emisión suelta | `backend/src/Api/Endpoints/FiscalEndpoints.cs` |
| Facturar una orden, estado fiscal y PDF | `backend/src/Api/Endpoints/OrderEndpoints.cs` |
| PDF para el comprador (desde su pedido) | `backend/src/Api/Endpoints/ShopOrdersEndpoints.cs` (`/shop/orders/{id}/invoice.pdf`) |
| Facturar una venta de Mercado Libre | `backend/src/Api/Endpoints/MeliEndpoints.cs` (`POST /admin/meli/orders/{meliOrderId}/invoice`) |
| Disparadores | `Api/Orders/PaidOrderSideEffects.cs`, `OrderFulfillment.cs`, `RefundedOrderSideEffects.cs`, `Api/Meli/MeliSyncService.cs` |
| Panel | `admin/src/pages/Settings/FiscalInvoicing.tsx` (Configuración → Facturación) |

Tablas: `fiscal_configs`, `fiscal_points_of_sale`, `fiscal_certificates`,
`fiscal_access_tokens`, `fiscal_documents`, `fiscal_sequences`,
`fiscal_emission_jobs`. En la misma base del módulo vive `store_legal_info`
(los datos legales que la tienda muestra en el pie y el precio sin impuestos
nacionales), que no interviene en la facturación.

## Configuración

Casi todo es por tienda y se carga en el panel:

| Qué | Endpoint | Notas |
|---|---|---|
| Emisor | `PUT /api/v1/fiscal/config` | CUIT (con dígito verificador), razón social, condición (RI o Monotributo), ambiente (homologación o producción) |
| Preferencias | `PUT /api/v1/fiscal/config/emission` | Automática sí/no, disparador `PAYMENT` o `FULFILLMENT`, punto de venta por defecto, umbral de consumidor final (default $10.000.000) |
| Puntos de venta | `GET/POST/DELETE /api/v1/fiscal/points-of-sale` | Número de ARCA + etiqueta. Sin default y con uno solo activo, se usa ese |
| Certificado | `POST /fiscal/certificate/csr`, `POST /fiscal/certificate/activate` | Ver el flujo abajo |
| ¿Se puede facturar? | `GET /api/v1/fiscal/readiness` | Emisor + certificado activo + punto de venta |

Permisos: `FiscalConfig` para configurar, probar la conexión y bajar el libro
IVA; `FiscalEmit` para emitir, reintentar un job y consultar el padrón.

Del servidor:

- `DataProtection:KeyPath` persistente (en prod, volumen `dpkeys` en `/keys`).
  Clave privada, certificado y TA están cifrados con ese keyring: si se pierde,
  cada tienda tiene que generar y activar un certificado nuevo.
- `Workers:Enabled=true` en una sola instancia (corre `FiscalEmissionWorker`).
- `Fiscal:Endpoints:*` (opcional) pisa los hosts por defecto: `WsaaHomologacion`,
  `WsaaProduccion`, `WsfeHomologacion`, `WsfeProduccion`,
  `PadronA5Homologacion`, `PadronA5Produccion`. Hoy no se setea en ningún
  ambiente.

## Flujos

**Certificado (una vez por ambiente).**

1. Cargá el emisor. `POST /fiscal/certificate/csr` genera RSA 2048 y un CSR
   con subject `C=AR, O={razón social}, CN={alias}, SERIALNUMBER=CUIT {cuit}`
   (alias por defecto `tiendafy-homologacion` o `tiendafy-produccion`). La
   clave queda cifrada; el CSR se descarga.
2. Subí el CSR a ARCA con clave fiscal: en homologación por WSASS, en
   producción por "Administración de Certificados Digitales". Descargá el
   certificado.
3. En el Administrador de Relaciones, autorizá ese certificado al servicio
   `wsfe` (y a `ws_sr_padron_a5` si vas a consultar el padrón).
4. Pegá el certificado en el panel: `activate` verifica que sea X.509, que
   corresponda a la clave generada y lee el CUIT del titular. Si el ambiente
   coincide con el de la configuración, habilita la facturación.
5. En producción, creá en ARCA un punto de venta de tipo "RECE para aplicativo
   y web services" y cargá su número.
6. Probá con `POST /fiscal/test-connection`.

**Diagnóstico** (`test-connection`): (1) certificado activo y de quién es
(avisa si el titular no es el CUIT que factura), (2) WSAA entrega el ticket,
(3) WSFEv1 acepta el CUIT (`FECompUltimoAutorizado`, solo lectura),
(4) los puntos de venta existen en ARCA como web services, no bloqueados ni
dados de baja. `POST /fiscal/health` es `FEDummy`, sin autenticación.

**Autenticación (WSAA).** El TRA va con generación 10 minutos atrás y
vencimiento 10 adelante, firmado como CMS con el certificado. El TA (dura hasta
12 horas) se guarda cifrado en la base por tienda, servicio y ambiente, y se usa
hasta 2 minutos antes de vencer. Si no hay uno válido, se pide bajo
`pg_advisory_xact_lock` con doble chequeo adentro.

**Emisión** (`EmitInvoiceHandler`), en este orden:

1. Cortes previos, sin llamar a ARCA: la orden ya tiene factura (o nota de
   crédito) autorizada; consumidor final anónimo por encima del umbral; el
   comprador es la propia tienda.
2. Receptor: 11 dígitos con verificador válido = CUIT; 7 u 8 = DNI; si no,
   consumidor final anónimo. La condición frente al IVA declarada (comercio o
   padrón) gana; si no hay, prefijo 30, 33 o 34 = Responsable Inscripto y
   cualquier persona física = consumidor final.
3. Importes: RI desarma el IVA del total (neto redondeado al centavo, IVA =
   total − neto, alícuota 21%); Monotributo va sin IVA. Moneda `PES`.
4. Locks de **sesión** (`pg_advisory_lock`): primero el de la venta (facturas
   y NC por separado) y, con él tomado, se repite el corte "ya tiene
   factura"; después el de la serie (tienda, ambiente, punto de venta y tipo
   de comprobante). Dos emisiones de la misma venta (botón manual y worker, o
   un job retomado por lease) no corren a la vez.
5. `FECompUltimoAutorizado`: el número es **ese + 1, exacto**. La secuencia
   local es un espejo y se corrige si quedó desfasada.
6. Reconciliación: cada comprobante de la serie que quedó `Pending` se consulta
   con `FECompConsultar`. Si ARCA lo tiene con el mismo receptor e importe, se
   adopta su CAE (y si era de esta venta, no se emite otro); si lo tiene con
   otro receptor o importe, el número quedó usado por otro comprobante y el
   nuestro se marca así. Si el número es mayor al último de ARCA, nunca llegó.
   Si ARCA no lo confirma, se frena la serie hasta revisarlo a mano.
7. **Write-ahead**: el comprobante se graba `Pending` con su número antes de
   pedir el CAE.
8. `FECAESolicitar`. Autorizado: guarda CAE, vencimiento y observaciones, y
   avanza la secuencia. Rechazado: guarda errores y observaciones; el número no
   se consumió. Sin respuesta (red, respuesta ilegible o un error HTTP sin
   SOAP Fault, como el 502 de un proxy): queda `Pending` para reconciliar en
   el próximo intento. Solo un SOAP Fault es rechazo.

**Automática.** Los disparadores encolan un job único por (tienda, orden,
tipo) si la facturación está habilitada (se habilita sola al activar un
certificado del mismo ambiente que el emisor) y automática; la factura,
además, solo si el disparador coincide. El worker corre cada 10 s, toma 20 por vuelta, reintenta los fallos
transitorios con espera de 1, 2, 4… hasta 60 minutos (8 intentos) y manda a
fallidos los rechazos de ARCA y la falta de documento del comprador, porque
reintentar no los arregla. Un job tomado (`Processing`) hace más de 15
minutos se da por abandonado (el proceso murió con él) y vuelve a la cola: el
reintento va por el emisor, que reconcilia el pendiente con ARCA antes de
pedir otro número. Desde Ventas se ve el estado (`GET /orders/{id}/fiscal`) y
se reintenta (`POST /fiscal/jobs/{id}/retry`).

**Email al comprador.** Cuando una factura de una orden de la tienda obtiene
el CAE (worker o botón "Facturar"), sale la plantilla "factura" con el PDF
adjunto, una sola vez (`buyer_notified_at_utc`). Viene apagada: solo la mandan
las tiendas que la prendieron. No sale a `@sin-email.local` ni en ventas de
Mercado Libre.

**Nota de crédito.** Acredita la última factura autorizada de la orden **en
el ambiente actual** y copia de ella el receptor (tipo y número de documento,
condición frente al IVA, guardada en `receptor_condicion`) y la clase: A → NC
A, B → NC B, C → NC C, con la factura en `CbtesAsoc`. El documento con que se
encola (el de la venta, o ninguno en Mercado Libre) no se usa: ARCA rechaza
una NC de otra clase o a otro receptor (10123). Por el monto reembolsado, una
sola por orden. No hay nota de crédito suelta: `POST /fiscal/emit` con
`creditNote` responde `Fiscal.NcNeedsOrder`, porque la NC necesita la factura
de la orden que acredita.

**Libro IVA.** `GET /fiscal/documents/export?year&month`: comprobantes
autorizados del ambiente en que factura la tienda (columna "Ambiente";
homologación no tiene validez fiscal), del mes en hora argentina.

## Lo que aprendimos de la API real

- **ARCA no entrega otro TA mientras el anterior siga vigente**
  (`coe.alreadyAuthenticated`, que viene en el `faultcode`). Por eso el TA va a
  la base y no a memoria, se usa hasta su vencimiento real y, ante ese error,
  se vuelve al guardado. Perderlo (una base restaurada, el mismo certificado
  en otro sistema) deja a la tienda hasta 12 horas sin facturar.
- **El TA es del certificado, no del CUIT**: se busca por tienda, servicio y
  ambiente. Corregir el CUIT no puede disparar otro login.
- **El número lo decide ARCA**: último autorizado + 1. Un número local
  adelantado hace que ARCA rechace todo lo que sigue (10016).
- **Con resultado `R`, las Observaciones son el motivo.** Mirar solo `Errors`
  deja la mitad de los rechazos "sin detalle".
- **Un timeout después de pedir el CAE no se reintenta a ciegas**: ARCA pudo
  haber autorizado. De ahí el write-ahead y `FECompConsultar`; que este diga
  "no existen datos" no es una falla, un 600 o 601 sí.
- **Error 600** tapa dos causas: el CUIT que factura no es el del certificado
  ni le delegó el servicio, o el contribuyente está inhabilitado (monotributo
  dado de baja por deuda, por ejemplo).
- `FECAEDetRequest` es una `xsd:sequence`: el orden de los campos importa
  (`CondicionIVAReceptorId`, después `CbtesAsoc`, después `Iva`).
- Clase C no lleva array `Iva` (error 10071) e `ImpNeto` es el subtotal.
- Tolerancia del IVA: error relativo ≤ 0,01% o absoluto ≤ 0,01 por alícuota.
  Un epsilon fijo rechazaría comprobantes que ARCA acepta.
- En homologación `FEParamGetPtosVenta` no lista nada (602) y se acepta
  cualquier punto de venta; en producción tiene que ser de web services.
- Hosts explícitos por ambiente, nunca derivados reemplazando el dominio, y
  TLS 1.2/1.3 forzado. `servicios1.afip.gov.ar` (WSFEv1 producción) elige DHE
  de 1024 bits si el cliente lo ofrece y OpenSSL 3 corta con
  `DH_KEY_TOO_SMALL`: por eso el cliente ofrece solo ECDHE (ver abajo).
- En Windows un certificado armado desde PEM no firma CMS: hay que pasar por
  PKCS#12 (`TraSigner.LoadForSigning`).
- Padrón A5: los hijos de `getPersona_v2` van sin namespace, un CUIT
  inexistente vuelve como SOAP Fault y el certificado necesita autorización
  aparte para `ws_sr_padron_a5`.
- ARCA no deja facturarse a uno mismo, y su mensaje no lo dice claro: pasa al
  probar con el CUIT de la propia empresa.

## TLS contra ARCA

Probado el 15-oct-2026 desde la imagen de runtime
(`mcr.microsoft.com/dotnet/aspnet:10.0`, que es **Ubuntu 24.04** con OpenSSL
3.0.13, no Debian) y desde `debian:bookworm-slim` (OpenSSL 3.0.22), con el mismo
resultado. Ninguna de las dos imágenes trae `SECLEVEL` ni `CipherString` en
`/etc/ssl/openssl.cnf`: el nivel por defecto es 2.

```bash
openssl s_client -connect HOST:443 -servername HOST </dev/null               # por defecto
openssl s_client ... -cipher DEFAULT@SECLEVEL=2                              # igual al anterior
openssl s_client ... -cipher DEFAULT@SECLEVEL=1
openssl s_client ... -tls1_2 -cipher ECDHE@SECLEVEL=2                        # solo ECDHE
openssl s_client ... -tls1_2 -cipher DHE@SECLEVEL=1                          # solo DHE
openssl s_client ... -tls1_3
```

| Host | Por defecto / SECLEVEL=2 | SECLEVEL=1 | Solo ECDHE (SECLEVEL=2) | DH que ofrece | TLS 1.3 |
|---|---|---|---|---|---|
| `servicios1.afip.gov.ar` (WSFEv1 prod) | **falla: `dh key too small`** | DHE-RSA-AES256-GCM, DH 1024 | ECDHE-RSA-AES256-GCM-SHA384 | **1024 bits** | no |
| `wsaa.afip.gov.ar` | ECDHE-RSA-AES256-GCM-SHA384 | igual | igual | 2048 | no |
| `aws.afip.gov.ar` (padrón prod) | ECDHE-RSA-AES128-GCM-SHA256 | igual | igual | 1024 | no |
| `wsaahomo.afip.gov.ar` | ECDHE-RSA-AES128-GCM-SHA256 | igual | igual | 2048 | no |
| `wswhomo.afip.gov.ar` | ECDHE-RSA-AES256-GCM-SHA384 | igual | igual | 2048 | no |
| `awshomo.afip.gov.ar` | ECDHE-RSA-AES128-GCM-SHA256 | igual | igual | 2048 | no |

`servicios1` elige DHE antes que ECDHE cuando el cliente ofrece los dos, y su
grupo DH es de 1024 bits. Homologación no tiene el problema: por eso "anda en
homologación y revienta en producción".

Con .NET (un `SslStream` dentro de la imagen de runtime):

| Cliente | `servicios1` | Los otros cinco |
|---|---|---|
| Lista por defecto de .NET | ECDHE-RSA-AES256-GCM-SHA384 | ECDHE |
| `CipherSuitesPolicy` con DHE | `dh key too small` | ECDHE |
| Lista por defecto + `openssl.cnf` con `CipherString = DEFAULT@SECLEVEL=2` | **`dh key too small`** | ECDHE |
| `CipherSuitesPolicy` solo ECDHE + ese mismo `openssl.cnf` | ECDHE-RSA-AES256-GCM-SHA384 | ECDHE |

Hoy la imagen andaría de casualidad: .NET en Linux aplica su propia lista
(solo ECDHE) **mientras** el `openssl.cnf` no defina un `CipherString`; si lo
define (varias distros lo hacen), usa esa, ofrece DHE y `servicios1` falla.
La decisión fue la más angosta que no depende de la imagen: el handler de ARCA
(`FiscalModule.ArcaHandler`, compartido por WSAA, WSFEv1 y padrón) fija una
`CipherSuitesPolicy` de TLS 1.3 + TLS 1.2 ECDHE con AEAD. No se baja el
`SECLEVEL` (ni global ni para ARCA) y el `Dockerfile` no cambia. En Windows
(desarrollo) la política no existe y decide SChannel; homologación negocia
ECDHE igual.

Si ARCA cambia la configuración de `servicios1`, se repite con
`openssl s_client` desde la imagen de runtime (como root, instalando `openssl`
con apt) y con un `SslStream` publicado para `linux-x64`.

## Cómo probar

Automático: `backend/tests/IntegrationTests/FiscalEmissionTests.cs`,
`FiscalFlowTests.cs` y `FiscalWorkerTests.cs` contra `Infrastructure/FakeArca.cs`
(una CA de prueba que firma el CSR real y un ARCA en SOAP que se puede romper a
pedido), y en `backend/tests/UnitTests/Fiscal/` los de dominio, WSAA, WSFEv1,
padrón, PDF y `ArcaGotchasTests.cs`.

Homologación:

1. Emisor con ambiente homologación y un CUIT tuyo con clave fiscal.
2. Certificado por WSASS (`wsass-homo.afip.gov.ar`), autorizado a `wsfe`.
3. Activar, cargar un punto de venta cualquiera y correr `test-connection`.
4. Emitir un comprobante suelto (`POST /fiscal/emit`) o facturar una venta de
   prueba, y bajar el PDF.

Para el detalle de la API de ARCA están las skills del repo
(`.claude/skills/afip-*`: WSAA, certificados, emisión, tipos de comprobante,
padrones, troubleshooting) y el
[portal de web services de ARCA](https://www.arca.gob.ar/ws/) (sección
Documentación: manuales de WSAA y WSFEv1).

## Pendiente

- **Certificado real**: activar uno de homologación y emitir el primer CAE;
  después el de producción (es otro certificado), el punto de venta de web
  services y una factura de prueba verificada en el portal de ARCA.
- **Condición frente al IVA del comprador**: ya no se asume RI por tener CUIT
  (persona jurídica = RI, persona física = consumidor final salvo que se
  declare), y el padrón se puede consultar desde el panel. Pero la emisión
  automática no consulta el padrón y el checkout no pide la condición: un RI
  persona física recibe B salvo que el comercio facture a mano.
- **Reembolsos parciales**: no generan nota de crédito (una por orden).
- **Nota de crédito con la facturación a mano**: si la tienda no tiene la
  emisión automática prendida, un reembolso total no encola la NC y desde el
  panel no hay cómo emitirla: la factura de una venta devuelta queda viva. Lo
  mismo con las ventas de Mercado Libre facturadas por la auto-factura de la
  conexión si la tienda no tiene la automática.
- **Email "factura" en ventas de Mercado Libre**: no sale (no son órdenes de
  la tienda y ML no da el email del comprador).
