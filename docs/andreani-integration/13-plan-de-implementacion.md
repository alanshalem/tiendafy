# 13 — Plan de implementación

Diseño de la capa de integración, modelo de datos, backlog por fases y checklist de go-live.

---

## 13.1 Principio rector

**Andreani no entra como "una integración más": entra como una implementación más de un contrato que ya existe.** Zipnova ya está integrado, y va a haber otros. Si el código de Andreani se escribe pegado al vocabulario de Andreani (`contrato`, `bultos`, `numeroAndreani`), cada carrier nuevo cuesta lo mismo que el primero.

La inversión correcta es **definir el contrato neutral primero** y refactorizar Zipnova para que lo cumpla, aunque eso agregue trabajo a la Fase 1. El costo se recupera en el segundo carrier.

---

## 13.2 Diseño de la capa de integración

### Ubicación en Clean Architecture

```
src/
├── Tiendafy.Domain/
│   └── Shipping/
│       ├── Shipment.cs, Parcel.cs, TrackingEvent.cs     (agregados)
│       ├── ShipmentStatus.cs                            (enum neutral)
│       └── Exceptions/CarrierValidationException.cs ...
│
├── Tiendafy.Application/
│   └── Shipping/
│       ├── Abstractions/
│       │   ├── IShippingCarrier.cs                      ← el contrato
│       │   ├── IShippingCarrierResolver.cs
│       │   └── ICarrierCredentialProvider.cs
│       ├── Dtos/                                        (DTOs neutrales)
│       ├── UseCases/QuoteShipping, CreateShipment, ...
│       └── Validators/
│
├── Tiendafy.Infrastructure.Shipping.Andreani/
│   ├── AndreaniShippingCarrier.cs                       ← implementación
│   ├── Http/AndreaniHttpClient.cs, AndreaniAuthHandler.cs
│   ├── Contracts/                                       (DTOs de Andreani)
│   ├── Mapping/AndreaniMapper.cs, AndreaniStatusMap.cs
│   └── AndreaniOptions.cs
│
├── Tiendafy.Infrastructure.Shipping.Zipnova/            (existente, a alinear)
│
└── Tiendafy.Api / Tiendafy.Workers/
```

**Regla de dependencia:** `Application` no conoce Andreani. `Infrastructure.Shipping.Andreani` no conoce Zipnova. El vocabulario de Andreani **no cruza** el límite de `Infrastructure`.

### El contrato `IShippingCarrier`

```csharp
namespace Tiendafy.Application.Shipping.Abstractions;

/// <summary>
/// Contrato neutral de un carrier logístico. Una implementación por carrier
/// (Andreani, Zipnova, ...). Toda operación recibe el contexto del tenant:
/// las credenciales y la configuración se resuelven por tenant, nunca globales.
/// </summary>
public interface IShippingCarrier
{
    /// <summary>Código estable del carrier: "andreani", "zipnova".</summary>
    string CarrierCode { get; }

    /// <summary>Capacidades declaradas. Permite al dominio no pedir lo imposible.</summary>
    CarrierCapabilities Capabilities { get; }

    Task<IReadOnlyList<ShippingQuote>> QuoteAsync(
        ShippingQuoteRequest request, CarrierContext ctx, CancellationToken ct);

    Task<ShipmentCreationResult> CreateShipmentAsync(
        ShipmentRequest request, CarrierContext ctx, CancellationToken ct);

    Task<LabelDocument> GetLabelAsync(
        string parcelTrackingNumber, LabelFormat format, CarrierContext ctx, CancellationToken ct);

    Task<IReadOnlyList<TrackingEventDto>> GetTrackingAsync(
        string parcelTrackingNumber, CarrierContext ctx, CancellationToken ct);

    Task<CancellationResult> CancelAsync(
        string shipmentReference, CarrierContext ctx, CancellationToken ct);
}
```

**`CarrierCapabilities` es la pieza que evita los `if (carrier == "andreani")` repartidos por el código.** Las diferencias entre carriers se declaran, no se preguntan:

```csharp
public sealed record CarrierCapabilities
{
    public bool SupportsCancellation      { get; init; }  // Andreani: false
    public bool SupportsReturns           { get; init; }  // Andreani: false (a confirmar)
    public bool SupportsWebhooks          { get; init; }  // Andreani: true, pero manual
    public bool SupportsBatchLabels       { get; init; }  // Andreani: false
    public bool SupportsIdempotencyKey    { get; init; }  // Andreani: false
    public bool ReturnsDeliveryEstimate   { get; init; }  // Andreani: false
    public bool ReturnsMultipleOptions    { get; init; }  // Andreani: false (1 tarifa por llamada)
    public IReadOnlySet<LabelFormat> LabelFormats { get; init; }  // Andreani: { Pdf }
}
```

Cuando el panel admin pregunta "¿muestro el botón Cancelar?", consulta `Capabilities.SupportsCancellation`. Cuando el checkout pregunta "¿muestro plazo de entrega?", consulta `ReturnsDeliveryEstimate`.

### DTOs neutrales

Sin una sola palabra del vocabulario de Andreani ni de Zipnova.

```csharp
public sealed record CarrierContext(
    Guid TenantId,
    string CarrierCode,
    CarrierEnvironment Environment);     // Sandbox | Production

public sealed record ShippingQuoteRequest(
    Address Origin,
    Address Destination,
    IReadOnlyList<ParcelSpec> Parcels,
    Money DeclaredValue,
    DeliveryMode? PreferredMode,          // Doorstep | PickupPoint
    string? PickupPointId);

public sealed record ParcelSpec(
    decimal WeightKg,
    decimal LengthCm, decimal HeightCm, decimal WidthCm,
    Money DeclaredValue,
    string? Description);
// VolumeCm3 se calcula. Andreani lo exige aparte; Zipnova no. Es detalle de infraestructura.

public sealed record ShippingQuote(
    string CarrierCode,
    string ServiceCode,                   // opaco. Andreani: el nº de contrato
    string ServiceName,                   // "Envío a domicilio"
    DeliveryMode Mode,
    Money PriceWithTax,
    Money PriceWithoutTax,
    Money? InsuranceWithTax,
    decimal? ChargeableWeightKg,          // Andreani: pesoAforado
    DeliveryEstimate? Estimate,           // Andreani: null
    DateTimeOffset QuotedAt,
    TimeSpan? ValidFor);                  // Andreani: null

public sealed record ShipmentRequest(
    string ExternalReference,             // ★ referencia propia. Idempotencia + correlación
    Address Origin, Address Destination,
    Party Sender, Party Recipient,
    IReadOnlyList<ParcelSpec> Parcels,
    string ServiceCode,
    Money DeclaredValue,
    string? PickupPointId,
    string? InvoiceNumber,
    string? CostCenter,
    IReadOnlyDictionary<string,string>? Metadata);

public sealed record ShipmentCreationResult(
    string ShipmentReference,             // Andreani: numeroDeEnvio del primer bulto
    IReadOnlyList<CreatedParcel> Parcels,
    ShipmentStatus InitialStatus,
    DateTimeOffset? EstimatedDelivery,
    IReadOnlyDictionary<string,string> CarrierMetadata);  // lo específico del carrier, sin contaminar el dominio

public sealed record CreatedParcel(
    string TrackingNumber,
    string? LabelUrl,
    string? Sequence);                    // "1/2"

public sealed record TrackingEventDto(
    DateTimeOffset OccurredAt,
    ShipmentStatus NeutralStatus,
    string RawStatusCode,                 // ★ SIEMPRE persistir el crudo
    string RawStatusName,
    string? RawReasonCode,
    string? RawReasonName,
    string? Location,
    string DeduplicationKey);             // idTraza (webhook) o hash de la tupla (polling)
```

**`RawStatusCode`, `RawStatusName`, `RawReasonCode`, `RawReasonName` no son opcionales.** Como el catálogo de estados de Andreani no está publicado, el crudo es la única defensa contra un estado nuevo.

### Selección de carrier por tenant

```csharp
public interface IShippingCarrierResolver
{
    /// Carriers habilitados y configurados para un tenant.
    Task<IReadOnlyList<IShippingCarrier>> GetEnabledAsync(Guid tenantId, CancellationToken ct);

    /// Un carrier puntual. Lanza si no está habilitado para ese tenant.
    Task<IShippingCarrier> GetAsync(Guid tenantId, string carrierCode, CancellationToken ct);
}
```

Registro con **keyed services** de .NET 8+:

```csharp
services.AddKeyedScoped<IShippingCarrier, AndreaniShippingCarrier>("andreani");
services.AddKeyedScoped<IShippingCarrier, ZipnovaShippingCarrier>("zipnova");
services.AddScoped<IShippingCarrierResolver, ShippingCarrierResolver>();
```

Es **Strategy**, con el resolver haciendo de factory sobre la configuración del tenant. Agregar un carrier nuevo = una clase + una línea de registro + una fila de configuración. Cero cambios en `Application`.

### Cotización en paralelo contra varios carriers

```csharp
public sealed class QuoteShippingOptionsHandler
{
    public async Task<ShippingOptionsResult> HandleAsync(QuoteShippingOptions cmd, CancellationToken ct)
    {
        var carriers = await _resolver.GetEnabledAsync(cmd.TenantId, ct);

        // Presupuesto global: el checkout no espera al más lento.
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(TimeSpan.FromSeconds(3));

        var tasks = carriers.Select(async carrier =>
        {
            try
            {
                var ctx = new CarrierContext(cmd.TenantId, carrier.CarrierCode, cmd.Environment);
                var quotes = await carrier.QuoteAsync(cmd.Request, ctx, budget.Token);
                return CarrierQuoteOutcome.Ok(carrier.CarrierCode, quotes);
            }
            catch (OperationCanceledException)
            {
                return CarrierQuoteOutcome.TimedOut(carrier.CarrierCode);
            }
            catch (CarrierNoCoverageException)
            {
                return CarrierQuoteOutcome.NoCoverage(carrier.CarrierCode);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Cotización fallida para {Carrier}", carrier.CarrierCode);
                return CarrierQuoteOutcome.Failed(carrier.CarrierCode);
            }
        });

        var outcomes = await Task.WhenAll(tasks);   // nunca lanza: cada tarea captura lo suyo

        return new ShippingOptionsResult(
            Options: outcomes.SelectMany(o => o.Quotes).OrderBy(q => q.PriceWithTax.Amount).ToList(),
            Failures: outcomes.Where(o => !o.Succeeded).ToList());
    }
}
```

**Tres decisiones que importan:**

1. **Un carrier que falla no tumba la cotización.** Cada tarea captura su excepción y devuelve un `outcome`. El checkout muestra lo que sí cotizó.
2. **Presupuesto global de 3 s**, no por carrier. El comprador espera una vez, no N veces.
3. **`Failures` se devuelve, no se descarta.** El frontend puede mostrar "Andreani no está disponible en este momento" en vez de omitirlo en silencio, y el equipo tiene una métrica.

> ⚠️ **Andreani necesita 2 llamadas** para ofrecer domicilio y sucursal, porque son dos contratos (ver `05` §5.2). Ese paralelismo interno va **dentro** de `AndreaniShippingCarrier.QuoteAsync`, no en el handler. El handler no sabe ni tiene que saber que Andreani modela los productos como contratos.

---

## 13.3 Modelo de datos

Todas las tablas llevan `tenant_id` con **RLS activa**, en línea con el resto de Tiendafy.

### Configuración por tenant

```sql
-- Un carrier habilitado para un tenant.
CREATE TABLE tenant_carriers (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    carrier_code        text NOT NULL,              -- 'andreani' | 'zipnova'
    enabled             boolean NOT NULL DEFAULT false,
    environment         text NOT NULL,              -- 'sandbox' | 'production'
    display_name        text,
    priority            int  NOT NULL DEFAULT 100,  -- orden en el checkout
    settings            jsonb NOT NULL DEFAULT '{}',-- config no sensible
    credentials_ref     text NOT NULL,              -- ★ REFERENCIA al secreto, NUNCA el secreto
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ux_tenant_carrier UNIQUE (tenant_id, carrier_code)
);
ALTER TABLE tenant_carriers ENABLE ROW LEVEL SECURITY;

-- ★ La tabla que evita el error de diseño más caro.
-- Andreani: N contratos por tenant, tipados por canal y modalidad.
CREATE TABLE tenant_carrier_services (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    tenant_carrier_id   uuid NOT NULL REFERENCES tenant_carriers(id) ON DELETE CASCADE,
    service_code        text NOT NULL,              -- Andreani: nº de contrato ("300006611")
    delivery_mode       text NOT NULL,              -- 'doorstep' | 'pickup_point'
    channel             text,                       -- 'B2C' | 'B2B'
    origin_branch_code  text,                       -- centro de imposición / sucursalOrigen
    display_name        text NOT NULL,              -- "Envío a domicilio"
    enabled             boolean NOT NULL DEFAULT true,
    metadata            jsonb NOT NULL DEFAULT '{}',
    CONSTRAINT ux_tenant_service UNIQUE (tenant_id, tenant_carrier_id, service_code, delivery_mode)
);
ALTER TABLE tenant_carrier_services ENABLE ROW LEVEL SECURITY;
CREATE INDEX ix_services_lookup
  ON tenant_carrier_services (tenant_id, tenant_carrier_id, delivery_mode) WHERE enabled;
```

> **`credentials_ref` guarda una referencia, no el secreto.** Ver §13.5. Las credenciales de Andreani permiten generar envíos facturables: en la base de la aplicación no van ni cifradas.

### Cotizaciones cacheadas

```sql
-- Redis es la cache caliente. Esta tabla es el registro de auditoría
-- de las cotizaciones que se le MOSTRARON al comprador.
CREATE TABLE shipping_quotes (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    cart_id             uuid,
    order_id            uuid,
    carrier_code        text NOT NULL,
    service_code        text NOT NULL,
    delivery_mode       text NOT NULL,
    destination_zip     text NOT NULL,
    parcels_hash        text NOT NULL,
    price_with_tax      numeric(14,2) NOT NULL,
    price_without_tax   numeric(14,2) NOT NULL,
    insurance_with_tax  numeric(14,2),
    chargeable_weight   numeric(12,3),
    raw_response        jsonb NOT NULL,             -- ★ para explicar diferencias de facturación
    quoted_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE shipping_quotes ENABLE ROW LEVEL SECURITY;
CREATE INDEX ix_quotes_order ON shipping_quotes (tenant_id, order_id);
CREATE INDEX ix_quotes_lookup ON shipping_quotes (tenant_id, carrier_code, destination_zip, quoted_at DESC);
```

`raw_response` en `jsonb` no es opcional: cuando llegue la factura de Andreani con un importe distinto al cotizado, ese campo es la única forma de reconstruir qué se cotizó y con qué peso aforado.

### Envíos y bultos

```sql
CREATE TABLE shipments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    order_id            uuid NOT NULL,
    carrier_code        text NOT NULL,
    service_code        text NOT NULL,
    delivery_mode       text NOT NULL,
    external_reference  text NOT NULL,              -- ★ "TF-{tenant}-{order}". Clave de idempotencia
    carrier_reference   text,                       -- Andreani: numeroDeEnvio del primer bulto
    status              text NOT NULL,              -- estado NEUTRAL agregado
    status_updated_at   timestamptz,
    origin_address      jsonb NOT NULL,
    destination_address jsonb NOT NULL,
    pickup_point_id     text,
    declared_value      numeric(14,2) NOT NULL,
    quoted_price        numeric(14,2),              -- precio congelado al confirmar
    estimated_delivery  timestamptz,
    carrier_metadata    jsonb NOT NULL DEFAULT '{}',
    last_error          jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

-- ★ Garantía anti-duplicados. Es lo que hace idempotente al worker.
CREATE UNIQUE INDEX ux_shipment_extref
  ON shipments (tenant_id, carrier_code, external_reference);

CREATE INDEX ix_shipments_order  ON shipments (tenant_id, order_id);
CREATE INDEX ix_shipments_status ON shipments (tenant_id, status, updated_at);
-- Bandeja de excepciones: índice parcial, solo lo que requiere atención.
CREATE INDEX ix_shipments_attention
  ON shipments (tenant_id, updated_at)
  WHERE status IN ('CREATION_UNCERTAIN','VALIDATION_ERROR','EXCEPTION','LOST_OR_DAMAGED');

CREATE TABLE parcels (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    shipment_id         uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    tracking_number     text NOT NULL,              -- ★ Andreani: numeroDeEnvio. PK natural
    sequence            text,                       -- "1/2"
    weight_kg           numeric(12,3) NOT NULL,
    volume_cm3          numeric(12,3) NOT NULL,
    length_cm           numeric(10,2),
    height_cm           numeric(10,2),
    width_cm            numeric(10,2),
    declared_value      numeric(14,2),
    label_url           text,
    label_storage_key   text,                       -- PDF cacheado en object storage
    label_fetched_at    timestamptz,
    status              text NOT NULL,
    status_updated_at   timestamptz,
    next_poll_at        timestamptz,                -- ★ polling con frecuencia adaptativa
    created_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;

-- El numeroDeEnvio de Andreani es único dentro del carrier.
CREATE UNIQUE INDEX ux_parcel_tracking ON parcels (tenant_id, tracking_number);

-- ★ Índice parcial: los envíos terminales salen solos del polling.
CREATE INDEX ix_parcels_polling
  ON parcels (next_poll_at)
  WHERE status NOT IN ('DELIVERED','RETURNED_TO_SENDER','LOST_OR_DAMAGED','CANCELLED');
```

### Eventos de tracking

```sql
-- Bitácora cruda. Se escribe SIEMPRE, antes de interpretar nada.
CREATE TABLE tracking_events_raw (
    id                  bigserial PRIMARY KEY,
    tenant_id           uuid NOT NULL,
    carrier_code        text NOT NULL,
    dedup_key           text NOT NULL,             -- ★ idTraza (webhook) | hash tupla (polling)
    source              text NOT NULL,             -- 'webhook' | 'polling'
    tracking_number     text,
    external_reference  text,
    payload             jsonb NOT NULL,            -- ★ crudo íntegro, para reprocesar
    received_at         timestamptz NOT NULL DEFAULT now(),
    processed_at        timestamptz
);
ALTER TABLE tracking_events_raw ENABLE ROW LEVEL SECURITY;

-- ★ Idempotencia del webhook y del polling, en un solo lugar.
CREATE UNIQUE INDEX ux_tracking_raw_dedup ON tracking_events_raw (carrier_code, dedup_key);
CREATE INDEX ix_tracking_raw_unprocessed ON tracking_events_raw (received_at) WHERE processed_at IS NULL;

-- Eventos interpretados, para mostrar al comprador y al operador.
CREATE TABLE tracking_events (
    id                  bigserial PRIMARY KEY,
    tenant_id           uuid NOT NULL,
    parcel_id           uuid NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
    occurred_at         timestamptz NOT NULL,
    neutral_status      text NOT NULL,             -- estado del dominio
    raw_status_code     text,                      -- ★ EstadoId crudo
    raw_status_name     text,
    raw_reason_code     text,                      -- ★ MotivoId crudo
    raw_reason_name     text,
    location            text,
    notified_customer   boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX ix_tracking_parcel ON tracking_events (tenant_id, parcel_id, occurred_at DESC);

-- Catálogo de estados: se puebla desde Andreani y crece con lo que aparece en producción.
CREATE TABLE carrier_status_map (
    carrier_code        text NOT NULL,
    raw_status_code     text NOT NULL,
    raw_reason_code     text NOT NULL DEFAULT '',
    neutral_status      text NOT NULL,
    notify_customer     boolean NOT NULL DEFAULT false,
    requires_action     boolean NOT NULL DEFAULT false,
    customer_message_key text,
    is_terminal         boolean NOT NULL DEFAULT false,
    PRIMARY KEY (carrier_code, raw_status_code, raw_reason_code)
);
-- Sin RLS: es catálogo global de la plataforma, no dato de tenant.

-- Catálogo de errores: se construye con lo que Andreani no documenta.
CREATE TABLE carrier_error_catalog (
    carrier_code        text NOT NULL,
    http_status         int  NOT NULL,
    error_code          text NOT NULL DEFAULT '',
    classification      text NOT NULL,             -- validation | auth | rate_limit | unavailable | no_coverage
    retryable           boolean NOT NULL,
    operator_message    text,
    customer_message_key text,
    first_seen_at       timestamptz NOT NULL DEFAULT now(),
    occurrences         bigint NOT NULL DEFAULT 1,
    PRIMARY KEY (carrier_code, http_status, error_code)
);
```

### Datos maestros

```sql
CREATE TABLE carrier_localities (
    carrier_code        text NOT NULL,
    external_id         text NOT NULL,             -- Andreani: idDeProvLocalidad
    locality            text NOT NULL,             -- ★ string EXACTO del catálogo
    locality_normalized text NOT NULL,             -- sin acentos, minúsculas: para buscar
    province            text NOT NULL,
    postal_codes        text[] NOT NULL,
    synced_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (carrier_code, external_id)
);
CREATE INDEX ix_localities_zip  ON carrier_localities USING gin (postal_codes);
CREATE INDEX ix_localities_norm ON carrier_localities (carrier_code, locality_normalized);

CREATE TABLE carrier_pickup_points (
    carrier_code        text NOT NULL,
    external_id         text NOT NULL,
    alternate_id        text,                      -- ★ Andreani: id vs numero. Guardar los dos
    code                text,
    name                text NOT NULL,
    channel             text,
    address             jsonb NOT NULL,
    coordinates         jsonb,
    opening_hours       text,
    accepts_shipments   boolean,
    delivers_shipments  boolean,
    customer_service    boolean,                   -- ★ seHaceAtencionAlCliente
    served_postal_codes text[],
    synced_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (carrier_code, external_id)
);
CREATE INDEX ix_points_zip ON carrier_pickup_points USING gin (served_postal_codes);
```

> **`alternate_id` existe por la ambigüedad documentada en `03` §3.3:** `/sucursales` devuelve `id: "48"` y `/puntos-de-tercero` devuelve `id: 10048, numero: "48"` para el mismo punto físico. Hasta saber cuál va en `destino.sucursal.id`, guardar los dos y decidir en el mapper, en un solo lugar.

### Consideraciones de RLS

- Todas las tablas con `tenant_id` usan la misma política que el resto de Tiendafy (`current_setting('app.tenant_id')`).
- `carrier_status_map`, `carrier_error_catalog`, `carrier_localities` y `carrier_pickup_points` son **catálogos globales sin RLS**. Los datos maestros de Andreani son los mismos para todos los tenants; duplicarlos por tenant es desperdicio y complica el refresco.
- Los **workers** (polling, creación) corren fuera de un request HTTP: tienen que **setear `app.tenant_id` explícitamente** al procesar cada mensaje. Un worker que no lo setea o ve todo o no ve nada — ambos casos son bugs graves. Encapsularlo en un `ITenantScope` que se abre al recibir el mensaje y se cierra al terminarlo.

---

## 13.4 Backlog por fases

Cada ítem tiene criterio de aceptación. Las fases están ordenadas por dependencias.

### Fase 0 — Desbloqueo (arranca el día 1, en paralelo con todo)

| # | Ítem | Criterio de aceptación |
|---|---|---|
| 0.1 | **Iniciar el alta comercial con Andreani** | Ejecutivo asignado y solicitud de credenciales de QA enviada. **Es la dependencia bloqueante del proyecto** |
| 0.2 | Enviar el cuestionario de GAPs (`01` §1.7) | Respuestas recibidas por escrito, especialmente **GAP-01** (parámetros de tarifas) y **GAP-02** (catálogo de estados) |
| 0.3 | **Validar `/documentacion` a mano en un navegador** | Confirmados a mano el path y la tabla de parámetros de la cotización, y la sección de etiquetas |
| 0.4 | Resolver IP de salida estática | NAT gateway con IP fija para backend y CI, e IPs informadas a Andreani |
| 0.5 | Confirmar horario y restricciones de QA | Documentado. Suite de tests de integración configurada en consecuencia |

> **0.1 y 0.2 no dependen de nadie del equipo técnico y tienen el lead time más largo. Arrancan primero.**

### Fase 1 — Cotización (desbloquea el checkout)

| # | Ítem | Criterio de aceptación |
|---|---|---|
| 1.1 | Definir `IShippingCarrier`, DTOs neutrales y `CarrierCapabilities` | Interfaz revisada y aprobada. Compilando con implementaciones vacías |
| 1.2 | **Refactorizar Zipnova para cumplir el contrato** | Tests existentes de Zipnova en verde contra la nueva interfaz. Sin regresiones |
| 1.3 | Modelo de datos: `tenant_carriers`, `tenant_carrier_services`, catálogos | Migraciones aplicadas, RLS verificada con dos tenants |
| 1.4 | Gestión de secretos por tenant | Credenciales en Key Vault / Secrets Manager. **Nada sensible en PostgreSQL**. Rotación probada |
| 1.5 | `HttpClientFactory` + Polly + `AndreaniAuthHandler` | Login, cache del token en Redis, 401 → re-login + reintento único. Test de contrato en verde |
| 1.6 | Sincronización de `/localidades` | Job semanal. Catálogo completo en PostgreSQL. Normalización con y sin acentos |
| 1.7 | Validador de direcciones argentinas | CP, localidad, CUIT, longitudes. Tests unitarios de los casos de `11` §11.5 |
| 1.8 | `AndreaniShippingCarrier.QuoteAsync` | Cotiza domicilio y sucursal **en paralelo**. Parseo con `InvariantCulture`. Test contra mock |
| 1.9 | Cache de cotizaciones en Redis | Clave con hash normalizado. TTL 30 min. Hit rate medido en QA > 60% |
| 1.10 | `QuoteShippingOptionsHandler` multi-carrier | Cotiza N carriers en paralelo con presupuesto de 3 s. Un carrier caído no rompe la respuesta |
| 1.11 | UI de checkout con opciones de envío | Muestra opciones ordenadas por precio, con degradación si un carrier falla |
| 1.12 | Panel admin: configuración de Andreani por tienda | El comercio carga credenciales, contratos y origen. Validación con un login de prueba |
| 1.13 | Observabilidad de cotización | Métricas de latencia p50/p95, tasa de error y hit rate por carrier. Alertas configuradas |

**Criterio de salida de Fase 1:** un comercio configura Andreani en su panel y el comprador ve la opción de envío con precio real en el checkout.

### Fase 2 — Generación y etiquetas

| # | Ítem | Criterio de aceptación |
|---|---|---|
| 2.1 | Modelo `shipments` + `parcels` con índice único de `external_reference` | Migraciones aplicadas. Test que prueba que un insert duplicado falla |
| 2.2 | Cálculo de bultos (estrategia bulto único) | Peso y volumen calculados. Defaults por tenant. Alerta de productos sin peso |
| 2.3 | `AndreaniShippingCarrier.CreateShipmentAsync` | Mapeo completo. **Test específico del enum de `telefonos.tipo` por rol** |
| 2.4 | Worker de creación consumiendo `PagoAcreditado` | Idempotente. Test: dos mensajes idénticos → un solo envío |
| 2.5 | Manejo de `CREACION_INCIERTA` | Timeout de lectura no reintenta. Alerta al operador. Acción manual en el panel |
| 2.6 | Clasificación de errores a excepciones de dominio | Tabla de `11` §11.3 implementada. Parser tolerante a los dos esquemas |
| 2.7 | Descarga y cacheo de etiquetas | PDF desde `linking`. Cacheado en object storage. Reimpresión sin re-descargar |
| 2.8 | Impresión masiva desde el panel | N envíos → un PDF concatenado. Concurrencia limitada |
| 2.9 | Bandeja de envíos en el panel admin | Filtros por estado, acceso a etiqueta y detalle, acciones de excepción |
| 2.10 | Marca local de cancelación | `CANCELACION_SOLICITADA` + instrucciones al operador. Botón oculto si ya hay trazas |
| 2.11 | **Prueba física de impresión** | Etiqueta impresa y **escaneada con lector** en la impresora del comercio |

**Criterio de salida de Fase 2:** se cobra un pedido, se genera la orden en Andreani, se imprime la etiqueta y el paquete se despacha.

### Fase 3 — Tracking

| # | Ítem | Criterio de aceptación |
|---|---|---|
| 3.1 | Modelo `tracking_events_raw` + `tracking_events` + `carrier_status_map` | Migraciones. Índice único de `dedup_key` probado |
| 3.2 | **Obtener el catálogo de estados de Andreani** | Tabla completa cargada en `carrier_status_map`. Vía: proceso de alta del webhook |
| 3.3 | Mapeo de estados con `UNKNOWN` + alerta | Test: estado desconocido → `UNKNOWN`, sin excepción, con alerta, sin notificar al comprador |
| 3.4 | Job de polling con frecuencia adaptativa | Índice parcial usado. Round-robin por tenant. Terminales excluidos |
| 3.5 | Deduplicación de eventos de polling | Test: dos ciclos consecutivos → cero eventos duplicados |
| 3.6 | Procesamiento vía RabbitMQ | Consumidor idempotente, con DLQ y reintentos. Sin retroceso de estados |
| 3.7 | Notificaciones al comprador | Solo estados notificables. Copy en español, sin jerga de Andreani |
| 3.8 | Página de tracking del comprador | Historial legible, estado actual, plazo si existe |
| 3.9 | Alertas de envíos trabados | Sin movimiento > 7 días, > 2 intentos fallidos. Visible en el panel |

**Criterio de salida de Fase 3:** el comprador ve el estado de su envío actualizado y recibe notificaciones en los hitos.

### Fase 4 — Webhook y operación fina

| # | Ítem | Criterio de aceptación |
|---|---|---|
| 4.1 | Endpoint receptor de webhook | Basic Auth con secreto rotable (dos válidos a la vez). Responde < 200 ms |
| 4.2 | Alta del webhook con Andreani | Eventos recibidos en QA y verificados |
| 4.3 | Idempotencia por `idTraza` | Test: mismo `idTraza` dos veces → un solo procesamiento, 200 en ambas |
| 4.4 | Polling degradado a diario | Con webhook activo, frecuencia reducida. Sigue funcionando como red de seguridad |
| 4.5 | **Alerta de silencio de webhook** | Sin eventos > 2 h en horario hábil → alerta |
| 4.6 | Bandeja de excepciones | Agrupada por acción requerida. Registro de gestión |
| 4.7 | Armado automático de evidencia para reclamos | Un click genera el paquete con trazas, valor declarado y constancias |
| 4.8 | Conciliación de facturación | Comparación de tarifa cotizada vs facturada. Reporte de desvíos |

### Fase 5 — Opcional, según respuestas de Andreani

| # | Ítem | Condición |
|---|---|---|
| 5.1 | Devoluciones / logística inversa | Si se confirma que se hace con un contrato de retorno |
| 5.2 | Etiquetas ZPL | Si Andreani confirma el formato |
| 5.3 | Bin packing de bultos | Si el ahorro lo justifica |
| 5.4 | Matriz de plazos de entrega | Si Andreani la entrega |
| 5.5 | Pre-numeración | Si se confirma. Resolvería la idempotencia de raíz |

---

## 13.5 Notas .NET

> Bloques específicos de .NET 8/10. Todo lo anterior es agnóstico.

### HttpClientFactory + Polly

```csharp
services.AddHttpClient<AndreaniHttpClient>((sp, client) =>
    {
        // La base URL es POR TENANT (sandbox vs producción): se resuelve en el handler,
        // no acá. Acá solo van los defaults compartidos.
        client.Timeout = Timeout.InfiniteTimeSpan;   // el timeout real lo pone Polly, por operación
        client.DefaultRequestHeaders.Accept.Add(new("application/json"));
    })
    .AddHttpMessageHandler<TenantBaseAddressHandler>()   // resuelve host por tenant
    .AddHttpMessageHandler<AndreaniAuthHandler>()        // token + 401 → re-login
    .AddResilienceHandler("andreani", (builder, ctx) =>
    {
        builder.AddTimeout(new HttpTimeoutStrategyOptions
        {
            // Timeout por operación, leído del contexto de la request.
            TimeoutGenerator = args => ValueTask.FromResult(
                args.Context.Properties.GetValue(OperationTimeoutKey, TimeSpan.FromSeconds(10)))
        });

        builder.AddRetry(new HttpRetryStrategyOptions
        {
            MaxRetryAttempts   = 3,
            BackoffType        = DelayBackoffType.Exponential,
            UseJitter          = true,                    // ★ obligatorio
            Delay              = TimeSpan.FromMilliseconds(300),
            ShouldHandle       = args => ValueTask.FromResult(
                                    IsTransient(args.Outcome)),
            OnRetry = args =>
            {
                // Respetar Retry-After en 429.
                var retryAfter = args.Outcome.Result?.Headers.RetryAfter?.Delta;
                if (retryAfter is not null)
                    args.Context.Properties.Set(RetryAfterKey, retryAfter.Value);
                return default;
            }
        });

        builder.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
        {
            FailureRatio     = 0.5,
            MinimumThroughput = 5,
            SamplingDuration = TimeSpan.FromSeconds(30),
            BreakDuration    = TimeSpan.FromSeconds(30)
        });

        // Bulkhead: un tenant ruidoso no agota el pool de los demás.
        builder.AddConcurrencyLimiter(permitLimit: 20, queueLimit: 40);
    });
```

> ⚠️ **La creación de órdenes NO usa la misma política de reintentos que la cotización.** Un reintento sobre `POST /ordenes-de-envio` puede duplicar un envío irreversible. Registrar un **pipeline separado** para las escrituras, con `MaxRetryAttempts = 0` sobre timeouts de lectura, y dejar que el worker maneje `CREACION_INCIERTA`. Ver `06` §6.5.

### Renovación de token con cache en Redis

```csharp
public sealed class AndreaniAuthHandler : DelegatingHandler
{
    private const string TokenHeader = "x-authorization-token";

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken ct)
    {
        var ctx   = _tenantContext.Current;
        var token = await GetOrCreateTokenAsync(ctx, forceRefresh: false, ct);

        request.Headers.Remove(TokenHeader);
        request.Headers.Add(TokenHeader, token);

        var response = await base.SendAsync(request, ct);

        if (response.StatusCode is not HttpStatusCode.Unauthorized)
            return response;

        // 401: el token venció. Re-login y UN solo reintento.
        response.Dispose();
        token = await GetOrCreateTokenAsync(ctx, forceRefresh: true, ct);

        var retry = await CloneAsync(request, ct);     // el body ya se consumió: hay que clonar
        retry.Headers.Remove(TokenHeader);
        retry.Headers.Add(TokenHeader, token);
        return await base.SendAsync(retry, ct);
    }

    private async Task<string> GetOrCreateTokenAsync(
        CarrierContext ctx, bool forceRefresh, CancellationToken ct)
    {
        var key = $"token:andreani:{ctx.TenantId}:{ctx.Environment}";

        if (!forceRefresh && await _cache.GetStringAsync(key, ct) is { } cached)
            return cached;

        // ★ Lock distribuido: 50 requests con 401 simultáneo → 1 solo login.
        await using var @lock = await _locks.AcquireAsync(
            $"lock:{key}", TimeSpan.FromSeconds(10), ct);

        // Doble verificación: otro hilo pudo haberlo renovado mientras esperábamos.
        if (!forceRefresh && await _cache.GetStringAsync(key, ct) is { } fresh)
            return fresh;

        var creds = await _credentials.GetAsync(ctx.TenantId, "andreani", ct);
        var token = await LoginAsync(creds, ctx.Environment, ct);

        // TTL conservador: el real no está documentado (GAP-09).
        await _cache.SetStringAsync(key, token,
            new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(20) }, ct);

        return token;
    }

    private static async Task<string> ReadTokenAsync(HttpResponseMessage r)
        // ★ El token viene en un HEADER, no en el body.
        => r.Headers.TryGetValues("x-authorization-token", out var v)
            ? v.First()
            : throw new CarrierAuthException("Andreani no devolvió x-authorization-token");
}
```

**Tres detalles que se pasan por alto y rompen en producción:**

1. **El token está en un header de respuesta.** Leer el body buscando `access_token` devuelve nada.
2. **Clonar la request antes de reintentar.** Un `HttpRequestMessage` no se puede reenviar: el `Content` ya se consumió.
3. **Lock distribuido + doble verificación.** Sin el lock, un pico de 401 dispara N logins simultáneos y probablemente un rate limit en `/login`.

### Gestión de secretos por tenant

```csharp
public interface ICarrierCredentialProvider
{
    Task<CarrierCredentials> GetAsync(Guid tenantId, string carrierCode, CancellationToken ct);
    Task StoreAsync(Guid tenantId, string carrierCode, CarrierCredentials creds, CancellationToken ct);
}
```

Reglas:

- **Las credenciales nunca van en PostgreSQL**, ni cifradas. `tenant_carriers.credentials_ref` guarda el nombre del secreto (`tenants/{tenantId}/carriers/andreani`), no el secreto.
- Backend: Azure Key Vault / AWS Secrets Manager / HashiCorp Vault, según el stack de Tiendafy.
- Cache en memoria con TTL corto (5 min) para no golpear el vault en cada request. **Nunca en Redis** — Redis es cache compartida, no bóveda.
- **Logging:** un `ILogger` con scope que redacte automáticamente `password`, `x-authorization-token` y `Authorization`. Un token de Andreani en un log es una credencial expuesta.
- Rotación: soportar dos credenciales válidas a la vez durante la ventana de cambio.

### Mapeo de errores a excepciones de dominio

```csharp
internal static class AndreaniErrorMapper
{
    public static Exception Map(HttpStatusCode status, string? body, string? contentType)
    {
        var errors = TryParse(body);   // tolera array, ProblemDetails, texto plano y vacío

        return status switch
        {
            HttpStatusCode.BadRequest       => new CarrierValidationException("andreani", errors),
            HttpStatusCode.Unauthorized     => new CarrierAuthException("andreani", errors),
            HttpStatusCode.Forbidden        => new CarrierAuthException("andreani", errors,
                                                  hint: "Posible restricción por IP o endpoint no habilitado"),
            HttpStatusCode.NotFound         => new CarrierNotFoundException("andreani", errors),
            HttpStatusCode.TooManyRequests  => new CarrierRateLimitException("andreani", errors),
            >= HttpStatusCode.InternalServerError => new CarrierUnavailableException("andreani", errors),
            _                               => new CarrierUnknownException("andreani", status, errors)
        };
    }

    private static IReadOnlyList<CarrierError> TryParse(string? body)
    {
        if (string.IsNullOrWhiteSpace(body)) return [];
        try
        {
            var trimmed = body.TrimStart();
            if (trimmed.StartsWith('['))                       // esquema A: [{code, property, message}]
                return JsonSerializer.Deserialize<AndreaniError[]>(body)!.Select(Map).ToList();
            if (trimmed.Contains("\"errors\"") || trimmed.Contains("\"title\""))
                return ParseProblemDetails(body);              // esquema B
        }
        catch (JsonException) { /* cae al fallback */ }

        return [new CarrierError(Code: "", Property: null, Message: Truncate(body, 500))];
    }
}
```

**El `catch (JsonException)` no es defensivo de más:** el `Content-Type` declarado de las respuestas de error incluye `text/plain`, y un 502 de gateway devuelve HTML.

### Procesamiento de eventos vía RabbitMQ

```
Exchange: shipping.events (topic)

  shipping.payment.accepted   → q.shipping.create        → ShipmentCreationWorker
  shipping.tracking.received  → q.shipping.tracking      → TrackingEventWorker
  shipping.shipment.created   → q.notifications.shipping → NotificationWorker
  shipping.exception.raised   → q.shipping.exceptions    → ExceptionWorker

Cada cola con su DLQ: q.shipping.<x>.dlq
```

Reglas de los consumidores:

- **Idempotencia siempre**, por constraint de base, no por chequeo previo (que tiene race condition).
- **Prefetch bajo** (5–10) en el worker de creación: cada mensaje hace una llamada externa lenta.
- **`ITenantScope` explícito** al recibir el mensaje: setea `app.tenant_id` para RLS y lo limpia al terminar. Sin esto, los workers rompen el aislamiento multi-tenant.
- **DLQ con alerta.** Un mensaje en DLQ es un pedido que no se despachó.
- **No reintentar errores de validación.** Un 400 no mejora con reintentos: consume recursos y retrasa lo que sí se puede procesar.

### Job de polling

```csharp
public sealed class TrackingPollingJob : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(15));
        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                // Round-robin por tenant: ninguno monopoliza el ciclo.
                foreach (var tenantId in await _tenants.GetActiveWithCarrierAsync("andreani", ct))
                {
                    using var scope = _tenantScope.Begin(tenantId);

                    var due = await _parcels.GetDueForPollingAsync(tenantId, limit: 200, ct);
                    if (due.Count == 0) continue;

                    await Parallel.ForEachAsync(due,
                        new ParallelOptions { MaxDegreeOfParallelism = 5, CancellationToken = ct },
                        async (parcel, token) => await PollAsync(parcel, token));
                }
            }
            catch (Exception ex)
            {
                // Un ciclo que falla no puede matar el servicio.
                _logger.LogError(ex, "Ciclo de polling de tracking falló");
            }
        }
    }
}
```

Usar Quartz.NET o Hangfire si hace falta persistencia del schedule y coordinación entre instancias. Con un `BackgroundService` simple hay que garantizar que **solo una instancia** ejecute el job (leader election o lock distribuido), o el trabajo se duplica.

---

## 13.6 Checklist de go-live

### Homologación técnica
- [ ] Checklist completo de `12-testing-y-homologacion.md` §12.6 ejecutado en QA, con evidencia
- [ ] Catálogo de estados cargado en `carrier_status_map`
- [ ] Catálogo de errores poblado con lo observado en QA
- [ ] Endpoint de trazas habilitado por Andreani para el usuario

### Credenciales y accesos
- [ ] Credenciales productivas recibidas y cargadas en el vault (no en la base)
- [ ] IPs de salida informadas a Andreani y whitelisting confirmado
- [ ] Contratos productivos verificados (WS, no `.com`) y cargados por tenant
- [ ] Código de cliente verificado (10 dígitos, sin `CL`)
- [ ] Un login de prueba exitoso contra producción por cada tenant piloto

### Prueba física
- [ ] **Etiqueta impresa en la impresora real del comercio**
- [ ] **Código de barras escaneado con lector** y verificado
- [ ] Un envío real de punta a punta: cotizar → pagar → generar → imprimir → despachar → trackear → entregar
- [ ] Constancia de entrega verificada en `multimedia`

### Monitoreo y alertas
- [ ] Dashboard con tasa de error, latencia p95 y estado del circuito por endpoint
- [ ] Alerta: circuito abierto
- [ ] Alerta: envíos en `CREACION_INCIERTA` > 0
- [ ] Alerta: envíos sin movimiento > 7 días
- [ ] Alerta: silencio de webhook > 2 h en horario hábil
- [ ] Alerta: estados `UNKNOWN` detectados
- [ ] Alerta: fallos de login por tenant

### Logging y privacidad
- [ ] **Redacción automática** de `password`, `x-authorization-token` y `Authorization` en todos los logs
- [ ] **No loguear payloads completos con datos personales.** El body de una orden tiene nombre, documento, dirección, email y teléfono del comprador
- [ ] Loguear identificadores (`numeroDeEnvio`, `external_reference`, `traceId`), no contenidos
- [ ] Retención de `tracking_events_raw` definida (sugerido: 12 meses) y política de purga implementada
- [ ] `raw_response` de cotizaciones sin datos personales (la cotización no los lleva: verificar)
- [ ] Revisión de que la información del comprador expuesta en la página pública de tracking sea la mínima

### Operación
- [ ] Runbook: qué hacer si Andreani está caído
- [ ] Runbook: cómo anular un envío (proceso manual documentado)
- [ ] Runbook: cómo abrir un reclamo, con la evidencia que genera el sistema
- [ ] Contactos de escalamiento de Andreani documentados (ejecutivo comercial + soporte técnico)
- [ ] Panel admin con la bandeja de excepciones operativa
- [ ] Capacitación al equipo de soporte de Tiendafy sobre los estados y las excepciones
- [ ] Proceso de conciliación tarifa cotizada vs facturada definido

### Rollout
- [ ] Feature flag por tenant para habilitar Andreani
- [ ] Piloto con 1–2 comercios de volumen bajo durante al menos 2 semanas
- [ ] Métricas del piloto revisadas antes de habilitarlo masivamente
- [ ] Plan de rollback: deshabilitar el carrier sin afectar envíos ya generados
