# 12 — Plan de implementación

---

## 1. Diseño de la capa de integración (agnóstico)

El objetivo es que **Payway entre como una implementación más al lado de Mercado Pago**, sin que el vocabulario de Payway se filtre al dominio. Patrón: **Strategy** + resolución por tenant.

### 1.1 Principio rector

> El dominio de Tiendafy no debe saber qué es un `site_transaction_id`, un `bin`, un `payment_method_id` ni un `reason.id`.
> El dominio conoce **órdenes, intentos de pago, montos y resultados**.

Todo lo que sea vocabulario de Payway vive en `Infrastructure.Payments.Payway` y no sale de ahí.

### 1.2 Contrato: `IPaymentGateway`

```
Application/Abstractions/Payments/IPaymentGateway.cs

public interface IPaymentGateway
{
    // Identidad del proveedor — para el registry y para logging
    PaymentProvider Provider { get; }

    // Capacidades declaradas — el dominio pregunta antes de ofrecer
    PaymentGatewayCapabilities Capabilities { get; }

    // Autorización + captura en un paso (el caso normal)
    Task<PaymentResult> ChargeAsync(
        ChargeRequest request,
        CancellationToken ct);

    // Continuación de un flujo que requirió acción del comprador (3DS)
    Task<PaymentResult> ContinueAsync(
        ContinuationRequest request,
        CancellationToken ct);

    // Consulta de estado — la operación más importante para la reconciliación
    Task<PaymentResult> GetPaymentAsync(
        PaymentLookup lookup,
        CancellationToken ct);

    // Devolución total o parcial
    Task<RefundResult> RefundAsync(
        RefundRequest request,
        CancellationToken ct);

    // Reversión de una devolución
    Task<RefundResult> CancelRefundAsync(
        CancelRefundRequest request,
        CancellationToken ct);

    // Historial de devoluciones — obligatorio consultarlo antes de devolver
    Task<IReadOnlyList<RefundResult>> GetRefundsAsync(
        PaymentLookup lookup,
        CancellationToken ct);
}
```

**Nota de diseño sobre `ChargeAsync` vs. `AuthorizeAsync`/`CaptureAsync`:** deliberadamente **no** se expone autorización y captura por separado en el MVP, porque el contrato de pre-autorización de Payway es un GAP (**GAP-16**). Se agregan cuando esté confirmado. Exponer una operación que no sabemos implementar en un proveedor es peor que no exponerla.

### 1.3 Capacidades declaradas

Esto resuelve el problema de "Mercado Pago puede X pero Payway no" sin `if (provider == "payway")` desparramados por el dominio:

```
public sealed record PaymentGatewayCapabilities
{
    bool SupportsPartialRefund          { get; init; }
    bool SupportsRefundCancellation     { get; init; }
    bool SupportsThreeDSecure           { get; init; }
    bool SupportsWebhooks               { get; init; }   // Payway: false
    bool SupportsIdempotencyKey         { get; init; }   // Payway: false
    bool SupportsInstallmentPlansLookup { get; init; }   // Payway: false (GAP-09)
    bool SupportsBinLookup              { get; init; }   // Payway: false (GAP-10)
    bool SupportsPreAuthorization       { get; init; }   // Payway: unknown → false
    bool SupportsSplitPayments          { get; init; }   // Payway: true (distributed)
    bool RequiresPolling                { get; init; }   // Payway: true
}
```

El caso de uso pregunta `gateway.Capabilities.SupportsPartialRefund` antes de ofrecer la opción en el panel admin. Cuando aparezca un tercer proveedor, no hay que tocar el dominio.

### 1.4 DTOs neutrales

Vocabulario del dominio, **no** de Payway.

```
public sealed record ChargeRequest
{
    TenantId          TenantId;
    OrderId           OrderId;
    string            IdempotencyReference;  // nuestro, determinístico por intento
    Money             Amount;                // Value Object: Amount(decimal) + Currency
    int               Installments;          // lo que se le muestra al comprador
    string?           ProviderInstallmentCode; // fee_to_send de Payway; opaco al dominio
    PaymentInstrument Instrument;
    BuyerInfo         Buyer;
    string?           StatementDescriptor;   // → establishment_name
    string?           Description;
    BrowserContext?   BrowserContext;        // para 3DS
    FraudSignals?     FraudSignals;          // para antifraude
    IReadOnlyList<SplitItem>? Splits;        // para pago distribuido
}

public sealed record PaymentInstrument
{
    PaymentInstrumentKind Kind;   // CardToken | SavedCard | OfflineVoucher
    string  Token;                // token de un solo uso
    string? Bin;                  // Payway lo exige; MP no
    string? LastFourDigits;
    string? Brand;                // marca detectada
    string? ProviderMethodCode;   // payment_method_id, opaco al dominio
    string? SecurityCode;         // solo para tarjeta guardada — NUNCA persistir
}

public sealed record PaymentResult
{
    PaymentStatus     Status;          // enum NEUTRO — ver 1.5
    string?           ProviderPaymentId;
    string            IdempotencyReference;
    Money             Amount;
    string?           AuthorizationCode;
    string?           NetworkTransactionId;   // ← el TID de Payway
    string?           TicketNumber;
    PaymentDecline?   Decline;                // poblado si Status == Declined
    PendingAction?    PendingAction;           // poblado si Status == RequiresAction
    ThreeDSecureData? ThreeDSecure;
    DateTimeOffset?   ProcessedAt;
    string            RawProviderStatus;       // para auditoría y debugging
}

public sealed record PaymentDecline
{
    DeclineCategory Category;      // enum neutro — ver 1.6
    string  ProviderCode;          // el reason.id crudo
    string  ProviderDescription;
    bool    IsRetryable;
    string  BuyerMessage;          // ya traducido, listo para mostrar
}

public sealed record PendingAction
{
    PendingActionKind Kind;        // ThreeDSChallenge | ThreeDSFingerprint | Redirect
    string  OpaqueToken;           // el instruction_value de Payway
    string? RedirectUrl;
}

public sealed record ThreeDSecureData
{
    string? AuthenticationValue;          // CAVV — evidencia de liability shift
    string? CommerceIndicator;            // ECI
    string? ProtocolVersion;
    string? DirectoryServerTransactionId;
}
```

### 1.5 Enum neutro de estados

Este es el corazón del desacoplamiento. Payway tiene 20 estados; el dominio necesita **siete**.

```
public enum PaymentStatus
{
    Approved,        // approved
    Declined,        // rejected, group_rejected
    UnderReview,     // review
    RequiresAction,  // challenge pending, fingerprint pending
    Authorized,      // pre_approved (fondos reservados, sin capturar)
    Refunded,        // refunded, refund_approved, annulled, annulment_approved,
                     // approved_with_refund
    Unknown          // undefined, accredited, adhered, reversed, cancelled,
                     // timeout, 5xx, o cualquier estado no mapeado
}
```

**Regla dura del mapper:** el `default` del switch es **`Unknown`**, nunca `Approved` ni `Declined`. Y todo mapeo a `Unknown` de un estado que Payway sí devolvió emite un log `WARNING` con el string crudo, para que ampliemos el mapeo en vez de silenciar el problema. Esto es lo que nos protege de los GAP-04.

### 1.6 Enum neutro de categorías de rechazo

```
public enum DeclineCategory
{
    InsufficientFunds,      // 51, 61
    CardExpired,            // 54
    InvalidCardNumber,      // 14, 39, 46
    InvalidExpiryDate,      // 49
    IncorrectPin,           // 38, 55
    CallIssuer,             // 1, 2, 76, 91
    CardReported,           // 4, 7, 43  → bloquear reintentos con esa tarjeta
    NotAllowed,             // 56, 57
    InstallmentsNotAllowed, // 45, 48, 77
    FraudSuspected,         // decisión red/black de Cybersource
    ProcessingError,        // -1, 12, 28, 96, 97, 10001, 10003
    ConfigurationError,     // 3, 13  → ALERTA INTERNA, no es culpa del comprador
    Duplicate,              // 8
    GenericDecline          // fallback
}
```

La categoría es lo que usa el frontend para decidir la UI (¿ofrezco reintentar? ¿bloqueo la tarjeta? ¿sugiero cambiar cuotas?). El código crudo se guarda para soporte y analítica.

### 1.7 Resolución del gateway por tenant

```
public interface IPaymentGatewayResolver
{
    Task<IPaymentGateway> ResolveAsync(TenantId tenantId, CancellationToken ct);
}
```

Implementación: lee la configuración del tenant (qué proveedor tiene activo), resuelve la implementación del DI y **le inyecta el contexto de credenciales del tenant** vía un `ITenantCredentialProvider` con caché en memoria y TTL corto.

**Anti-patrón a evitar:** un `IPaymentGateway` singleton con las credenciales inyectadas por constructor. En multi-tenant eso obliga a un factory por request o a pasar las credenciales en cada llamada. La opción limpia es un `AsyncLocal`/scoped `ITenantContext` que el gateway consulta, alineado con cómo ya resolvemos el RLS de PostgreSQL.

### 1.8 Estructura de carpetas

```
src/
├── Tiendafy.Domain/
│   └── Payments/
│       ├── PaymentAttempt.cs           (Aggregate Root)
│       ├── Refund.cs                   (Entity)
│       ├── PaymentStatus.cs            (Enum)
│       ├── DeclineCategory.cs          (Enum)
│       ├── Money.cs                    (Value Object)
│       └── Events/
│           ├── PaymentApprovedEvent.cs
│           ├── PaymentDeclinedEvent.cs
│           ├── PaymentUnderReviewEvent.cs
│           └── PaymentRefundedEvent.cs
│
├── Tiendafy.Application/
│   └── Payments/
│       ├── Abstractions/
│       │   ├── IPaymentGateway.cs
│       │   ├── IPaymentGatewayResolver.cs
│       │   └── ITenantCredentialProvider.cs
│       ├── Contracts/                  (los DTOs neutrales de §1.4)
│       ├── Commands/
│       │   ├── ChargeOrderCommand.cs + Handler
│       │   ├── ContinuePaymentCommand.cs + Handler
│       │   ├── RefundPaymentCommand.cs + Handler
│       │   └── ReconcilePaymentCommand.cs + Handler
│       └── Queries/
│           └── GetInstallmentPlansQuery.cs + Handler
│
├── Tiendafy.Infrastructure/
│   └── Payments/
│       ├── Payway/
│       │   ├── PaywayGateway.cs              (implementa IPaymentGateway)
│       │   ├── PaywayHttpClient.cs           (transporte puro)
│       │   ├── PaywayOptions.cs
│       │   ├── Mapping/
│       │   │   ├── PaywayRequestMapper.cs    (ChargeRequest → payload Payway)
│       │   │   ├── PaywayResponseMapper.cs   (payload → PaymentResult)
│       │   │   ├── PaywayStatusMap.cs        (20 estados → 7)
│       │   │   └── PaywayDeclineMap.cs       (reason.id → DeclineCategory + mensaje)
│       │   ├── Models/                       (DTOs crudos de Payway, internal)
│       │   └── Resilience/
│       │       └── PaywayPolicies.cs         (Polly)
│       ├── MercadoPago/
│       │   └── ...  (misma estructura)
│       └── Shared/
│           ├── PaymentGatewayRegistry.cs
│           └── SanitizingLogHandler.cs
│
└── Tiendafy.Api/
    └── Payments/
        ├── PaymentsController.cs
        └── Webhooks/
            └── PaywayWebhookController.cs    (preparado, inactivo — GAP-06)
```

**Clave:** los DTOs crudos de Payway son `internal` al proyecto de Infrastructure. Si algún tipo de `Infrastructure.Payments.Payway.Models` aparece en una firma de Application, la abstracción se rompió.

---

## 2. Modelo de datos

Todas las tablas llevan `tenant_id` y política RLS, consistente con el resto de Tiendafy.

### 2.1 `payment_gateway_credentials`

```sql
CREATE TABLE payment_gateway_credentials (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL REFERENCES tenants(id),
    provider                  text NOT NULL,          -- 'payway' | 'mercadopago'
    environment               text NOT NULL,          -- 'sandbox' | 'production'
    site_id                   text NOT NULL,          -- nro. de comercio Payway
    public_key_ref            text NOT NULL,          -- referencia al secret manager
    private_key_ref           text NOT NULL,
    form_api_key_ref          text NULL,
    x_consumer_username_ref   text NULL,
    base_url_override         text NULL,              -- por GAP-11
    is_active                 boolean NOT NULL DEFAULT true,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_tenant_provider_env
        UNIQUE (tenant_id, provider, environment)
);

CREATE INDEX ix_pgc_tenant_active
    ON payment_gateway_credentials (tenant_id, provider)
    WHERE is_active;

ALTER TABLE payment_gateway_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_gateway_credentials
    USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

> **`*_ref` guarda una referencia al secret manager, no el valor.** Si se opta por cifrado en columna, cambiar a `*_encrypted bytea` + envelope encryption con DEK por tenant. Nunca texto plano.

### 2.2 `payment_attempts`

Aggregate Root. **Un registro por intento**, no por orden.

```sql
CREATE TABLE payment_attempts (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL REFERENCES tenants(id),
    order_id                uuid NOT NULL REFERENCES orders(id),
    attempt_number          int  NOT NULL,

    provider                text NOT NULL,
    -- nuestro id, el que viaja como site_transaction_id
    idempotency_reference   text NOT NULL,
    -- el id numérico de Payway
    provider_payment_id     text NULL,

    status                  text NOT NULL,      -- enum NEUTRO
    raw_provider_status     text NULL,          -- string crudo, para auditoría

    amount_cents            bigint NOT NULL,    -- SIEMPRE en centavos
    currency                char(3) NOT NULL,
    installments            int  NOT NULL,
    provider_installment_code text NULL,        -- fee_to_send
    promotion_rule_id       uuid NULL REFERENCES payment_promotions(id),
    coefficient             numeric(10,6) NULL,

    -- Datos de tarjeta permitidos por PCI
    card_bin                char(6) NULL,
    card_last_four          char(4) NULL,
    card_brand              text NULL,
    provider_method_code    text NULL,          -- payment_method_id

    -- Resultado
    authorization_code      text NULL,
    network_transaction_id  text NULL,          -- ← el TID. CRÍTICO para conciliar
    ticket_number           text NULL,
    decline_category        text NULL,
    decline_provider_code   text NULL,
    decline_description     text NULL,

    -- 3DS (evidencia de liability shift)
    tds_authentication_value  text NULL,
    tds_commerce_indicator    text NULL,
    tds_protocol_version      text NULL,
    tds_ds_transaction_id     text NULL,

    -- Reconciliación
    reconcile_attempts      int  NOT NULL DEFAULT 0,
    next_reconcile_at       timestamptz NULL,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    processed_at            timestamptz NULL,

    CONSTRAINT uq_idempotency
        UNIQUE (tenant_id, provider, idempotency_reference),
    CONSTRAINT uq_order_attempt
        UNIQUE (tenant_id, order_id, attempt_number),
    CONSTRAINT ck_amount_positive
        CHECK (amount_cents > 0)
);

CREATE INDEX ix_pa_order          ON payment_attempts (tenant_id, order_id);
CREATE INDEX ix_pa_provider_id    ON payment_attempts (provider, provider_payment_id)
                                     WHERE provider_payment_id IS NOT NULL;
CREATE INDEX ix_pa_tid            ON payment_attempts (network_transaction_id)
                                     WHERE network_transaction_id IS NOT NULL;
-- Índice parcial para el worker de reconciliación: solo estados no terminales
CREATE INDEX ix_pa_pending        ON payment_attempts (next_reconcile_at)
                                     WHERE status IN ('UnderReview','RequiresAction','Unknown');
CREATE INDEX ix_pa_created        ON payment_attempts (tenant_id, created_at DESC);

ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_attempts
    USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

**Decisiones de diseño a destacar:**
- `amount_cents bigint` — **nunca `decimal` ni `float`** para montos que van a la API. Elimina toda una clase de bugs de redondeo.
- `uq_idempotency` es la garantía a nivel base. Si dos requests concurrentes pasan el lock de Redis, la base los frena.
- `ix_pa_pending` es un **índice parcial**: el worker de reconciliación escanea solo lo pendiente, que es una fracción minúscula de la tabla.
- `raw_provider_status` permite hacer forense sobre estados que mapeamos a `Unknown`.

### 2.3 `payment_refunds`

```sql
CREATE TABLE payment_refunds (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL REFERENCES tenants(id),
    payment_attempt_id      uuid NOT NULL REFERENCES payment_attempts(id),

    provider_refund_id      text NULL,   -- necesario para poder anularla
    kind                    text NOT NULL,  -- 'Full' | 'Partial'
    amount_cents            bigint NOT NULL,
    status                  text NOT NULL,
    raw_provider_status     text NULL,
    network_transaction_id  text NULL,

    requested_by_user_id    uuid NULL,
    reason                  text NULL,

    created_at              timestamptz NOT NULL DEFAULT now(),
    processed_at            timestamptz NULL,

    CONSTRAINT ck_refund_amount CHECK (amount_cents > 0)
);

CREATE INDEX ix_pr_attempt ON payment_refunds (tenant_id, payment_attempt_id);
ALTER TABLE payment_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_refunds
    USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### 2.4 `payment_promotions` y `payment_installment_plans`

Como no hay API de promociones (**GAP-09**), las administramos nosotros. Modelo tomado del plugin oficial de WooCommerce.

```sql
CREATE TABLE payment_promotions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id),
    provider          text NOT NULL,
    rule_name         text NOT NULL,
    card_brand        text NULL,        -- NULL = todas
    bank_code         text NULL,        -- NULL = todos
    provider_method_code text NULL,     -- payment_method_id específico
    valid_from        timestamptz NOT NULL,
    valid_to          timestamptz NOT NULL,
    applicable_days   smallint[] NULL,  -- 0=domingo .. 6=sábado. NULL = todos
    priority          int NOT NULL DEFAULT 0,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_valid_range CHECK (valid_to > valid_from)
);

CREATE INDEX ix_promo_lookup
    ON payment_promotions (tenant_id, provider, card_brand, bank_code, priority DESC)
    WHERE is_active;

CREATE TABLE payment_installment_plans (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL REFERENCES tenants(id),
    promotion_id          uuid NOT NULL REFERENCES payment_promotions(id) ON DELETE CASCADE,

    display_installments  int NOT NULL,          -- fee_period
    provider_code         text NOT NULL,         -- fee_to_send
    coefficient           numeric(10,6) NOT NULL DEFAULT 1.0,
    tea                   numeric(10,4) NULL,    -- obligatorio si coefficient > 1
    cft                   numeric(10,4) NULL,    -- obligatorio si coefficient > 1
    merchant_absorbs_cost boolean NOT NULL DEFAULT false,

    CONSTRAINT ck_coefficient  CHECK (coefficient >= 1.0),
    CONSTRAINT ck_installments CHECK (display_installments BETWEEN 1 AND 99),
    -- Regla de exhibición obligatoria (BCRA)
    CONSTRAINT ck_rates_when_interest
        CHECK (coefficient = 1.0 OR (tea IS NOT NULL AND cft IS NOT NULL)),
    CONSTRAINT uq_plan UNIQUE (promotion_id, display_installments)
);

ALTER TABLE payment_promotions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_installment_plans ENABLE ROW LEVEL SECURITY;
```

> El `CHECK ck_rates_when_interest` hace que sea **imposible** cargar un plan con interés sin TEA y CFT. La obligación normativa queda garantizada por la base, no por la buena voluntad del operador del panel.

### 2.5 `payment_provider_method_map`

Absorbe **GAP-12** (el conflicto de `payment_method_id`) sin necesidad de deploy:

```sql
CREATE TABLE payment_provider_method_map (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NULL REFERENCES tenants(id),  -- NULL = default global
    provider      text NOT NULL,
    card_brand    text NOT NULL,        -- 'visa','mastercard','amex',...
    card_kind     text NOT NULL,        -- 'credit' | 'debit'
    provider_code text NOT NULL,        -- payment_method_id
    is_active     boolean NOT NULL DEFAULT true,

    CONSTRAINT uq_method_map UNIQUE (tenant_id, provider, card_brand, card_kind)
);
```

Resolución: buscar primero la fila del tenant; si no existe, caer al default global (`tenant_id IS NULL`). Si mañana Payway confirma que Mastercard es 104 y no 15, es un `UPDATE`.

### 2.6 `payment_webhook_events` (preparada, inactiva)

```sql
CREATE TABLE payment_webhook_events (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenants(id),
    provider           text NOT NULL,
    provider_event_id  text NULL,
    payload_hash       char(64) NOT NULL,   -- SHA-256, para dedupe si no hay event_id
    raw_payload        jsonb NOT NULL,
    signature_valid    boolean NULL,
    processed_at       timestamptz NULL,
    received_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_webhook_dedupe UNIQUE (tenant_id, provider, payload_hash)
);
```

Se crea desde el día uno aunque Payway no tenga webhooks (**GAP-06**): Mercado Pago sí los tiene, y si Payway los agrega, la tabla ya está.

### 2.7 `payment_reconciliation_runs`

```sql
CREATE TABLE payment_reconciliation_runs (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id),
    provider             text NOT NULL,
    business_date        date NOT NULL,
    local_count          int NOT NULL,
    provider_count       int NOT NULL,
    discrepancies        jsonb NOT NULL DEFAULT '[]'::jsonb,
    status               text NOT NULL,   -- 'Clean' | 'Discrepancies' | 'Failed'
    executed_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_recon_run UNIQUE (tenant_id, provider, business_date)
);
```

---

## 3. Backlog por fases

### Fase 0 — Descubrimiento y desbloqueo (1 semana) 🔴 **BLOQUEANTE**

| # | Tarea | Criterio de aceptación |
|---|---|---|
| 0.1 | Obtener credenciales de sandbox propias | Un `POST /tokens` y un `POST /payments` responden `201` con nuestras keys |
| 0.2 | Enviar la lista de preguntas de `01-resumen-ejecutivo.md` a soporte | Ticket abierto con las 12 preguntas |
| 0.3 | **Determinar el TTL real y el single-use del token** | Test empírico documentado: cuánto vive el token y qué pasa al reutilizarlo |
| 0.4 | **Resolver GAP-11** (host de producción) | Confirmación escrita de Payway |
| 0.5 | **Resolver GAP-12** (`payment_method_id` vigentes) | Tabla confirmada para nuestro `site_id` |
| 0.6 | **Resolver GAP-06** (¿webhooks?) | Sí/No por escrito |
| 0.7 | **Resolver GAP-09** (¿API de promociones?) | Sí/No por escrito |
| 0.8 | Grabar respuestas reales del sandbox para los fixtures | JSONs de: approved, rejected, review, 400, 401, 402, 5xx |

> **Nada de las fases siguientes debería empezar sin 0.1 y 0.3.** El resto puede avanzar en paralelo aceptando el riesgo.

### Fase 1 — Núcleo del cobro (2–3 semanas)

| # | Tarea | Depende de | Criterio de aceptación |
|---|---|---|---|
| 1.1 | `IPaymentGateway` + DTOs neutrales + enums | — | Compila. Cero referencias a tipos de Payway en `Application` (verificado por test de arquitectura) |
| 1.2 | Migración de las tablas `payment_*` con RLS | — | Migración aplicada. Test que verifica que un tenant no ve datos de otro |
| 1.3 | `ITenantCredentialProvider` con secret manager | 1.2 | Resuelve credenciales por tenant. Caché con TTL. Test de aislamiento |
| 1.4 | `PaywayHttpClient` + `HttpClientFactory` + `SanitizingLogHandler` | 1.3 | Los logs no contienen `apikey`, `card_number`, `security_code` ni el token completo. Test que lo verifica |
| 1.5 | `PaywayRequestMapper` + `PaywayResponseMapper` | 1.1 | Tests unitarios con los fixtures de 0.8. Cubre `402` |
| 1.6 | `PaywayStatusMap` (20 → 7 estados) | 1.1 | Todos los estados del enum de Payway mapeados. `default` = `Unknown` + log WARNING |
| 1.7 | `PaywayDeclineMap` (reason.id → categoría + mensaje) | 1.6 | Todos los códigos de `10-errores-y-codigos.md`. Fallback obligatorio |
| 1.8 | `PaywayGateway.ChargeAsync` | 1.4–1.7 | Pago aprobado y pago rechazado end-to-end contra sandbox |
| 1.9 | `PaywayPolicies` (Polly) | 1.4 | **Test de no-regresión: `POST /payments` no se reintenta ante 5xx** |
| 1.10 | `ChargeOrderCommandHandler` + lock de idempotencia en Redis | 1.8 | 10 requests concurrentes con el mismo `orderId` → un solo pago |
| 1.11 | `PaywayGateway.GetPaymentAsync` (por id y por `siteOperationId`) | 1.4 | Recupera un pago por ambas vías |
| 1.12 | Recuperación ante timeout | 1.10, 1.11 | Timeout artificial → consulta por `siteOperationId` → adopta el resultado. **Nunca duplica** |
| 1.13 | Formulario de tarjeta en Next.js + tokenización | 1.8 | El PAN nunca llega al backend. Verificado con captura de red |
| 1.14 | Publicación de eventos de dominio vía Outbox + RabbitMQ | 1.10 | `PaymentApprovedEvent` publicado en la misma transacción que el cambio de estado |

**Hito de fase 1:** un comprador puede pagar con tarjeta en 1 cuota en una tienda, y la orden queda pagada. Con recuperación correcta ante timeout.

### Fase 2 — Cuotas, promociones y post-venta (2–3 semanas)

| # | Tarea | Depende de | Criterio de aceptación |
|---|---|---|---|
| 2.1 | CRUD de promociones y planes en el panel admin | 1.2 | Un operador carga una promoción con planes, TEA y CFT. La base rechaza planes con interés sin TEA/CFT |
| 2.2 | `GetInstallmentPlansQuery` | 2.1 | Devuelve los planes vigentes por (tenant, marca, banco, fecha), respetando `priority` |
| 2.3 | Grilla de cuotas en el checkout | 2.2 | Muestra `N x $X (total $Y)` + TEA y CFT cuando hay interés |
| 2.4 | **Recálculo server-side del total con coeficiente** | 2.2 | Un total manipulado desde el browser es rechazado. Test de seguridad explícito |
| 2.5 | Detección de marca por BIN + `payment_provider_method_map` | 1.13 | Resuelve el `payment_method_id` correcto por tenant |
| 2.6 | `RefundAsync` (total y parcial) | 1.8 | Devolución total y parcial contra sandbox |
| 2.7 | Bloqueo de devolución parcial en Visa Débito | 2.6 | La UI no ofrece la opción para `payment_method_id = 31` |
| 2.8 | `GetRefundsAsync` + validación previa a devolver | 2.6 | Nunca devuelve más que el total. Consulta el historial antes |
| 2.9 | `CancelRefundAsync` | 2.6 | Anula una devolución previa |
| 2.10 | Pantalla de devoluciones en el panel admin | 2.6–2.9 | El operador devuelve total o parcialmente, con auditoría de quién y por qué |
| 2.11 | Emisión de nota de crédito ARCA por evento | 2.6 | `PaymentRefundedEvent` dispara la nota de crédito. Si falla, reintenta desde la cola sin revertir el refund |

### Fase 3 — Reconciliación y observabilidad (1–2 semanas)

| # | Tarea | Criterio de aceptación |
|---|---|---|
| 3.1 | Exchange `payments.reconcile` con delayed messages | Mensajes con delay variable |
| 3.2 | `ReconcilePaymentCommandHandler` idempotente | 5 mensajes duplicados → un solo cambio de estado (UPDATE condicional) |
| 3.3 | Backoff y escalamiento a `PaymentUnknown` | Tras N intentos, alerta a operaciones |
| 3.4 | Job diario de conciliación | Genera `payment_reconciliation_runs` con las 3 categorías de discrepancia |
| 3.5 | Dashboard de métricas | Tasa de aprobación, latencia p95, distribución de `reason.id`, cola de reconciliación |
| 3.6 | Alertas | `PaymentUnknown` > 0, tasa de aprobación caída > 15%, error rate > 1%, discrepancias > 0 |
| 3.7 | Circuit breaker por tenant | Un tenant con keys inválidas no afecta a los demás. Test explícito |

### Fase 4 — Opcionales (según prioridad de negocio)

| # | Tarea | Habilitador |
|---|---|---|
| 4.1 | 3D Secure completo | GAP: flujo del browser confirmado |
| 4.2 | Antifraude Cybersource | GAP: device fingerprint confirmado |
| 4.3 | Tarjetas guardadas | — |
| 4.4 | Pagos offline (Rapipago, Pago Fácil) | Requiere reserva de stock con expiración |
| 4.5 | Pago distribuido | GAP-08 confirmado + sites habilitados |
| 4.6 | Webhooks | GAP-06 confirmado positivamente |

---

## 4. Notas .NET

> Bloques específicos de implementación en .NET 8/10. El resto de la spec es agnóstico.

### 4.1 `HttpClientFactory` + Polly

```
Registración:

services.AddHttpClient<PaywayHttpClient>(c =>
{
    c.Timeout = Timeout.InfiniteTimeSpan;   // el timeout lo maneja Polly
    c.DefaultRequestHeaders.Add("Cache-Control", "no-cache");
})
.AddHttpMessageHandler<TenantCredentialHandler>()   // inyecta el header apikey
.AddHttpMessageHandler<SanitizingLogHandler>()      // loguea sin PCI
.AddPolicyHandler(PaywayPolicies.Select);           // selector por método HTTP
```

**El selector es la parte crítica:**

```
public static IAsyncPolicy<HttpResponseMessage> Select(HttpRequestMessage req)
{
    // Solo los GET son seguros de reintentar.
    var isSafeToRetry = req.Method == HttpMethod.Get;

    var timeout = Policy.TimeoutAsync<HttpResponseMessage>(
        TimeSpan.FromSeconds(35), TimeoutStrategy.Optimistic);

    var breaker = PaywayPolicies.GetBreakerForTenant(req);   // por tenant, no global

    if (!isSafeToRetry)
        return Policy.WrapAsync(breaker, timeout);           // SIN retry

    var retry = HttpPolicyExtensions
        .HandleTransientHttpError()
        .WaitAndRetryAsync(3, attempt =>
            TimeSpan.FromSeconds(Math.Pow(2, attempt))
            + TimeSpan.FromMilliseconds(Random.Shared.Next(0, 500)));

    return Policy.WrapAsync(breaker, retry, timeout);
}
```

> ⚠️ **La razón por la que esto no es un `AddPolicyHandler` genérico:** un retry aplicado a `POST /payments` es la causa número uno de cobros duplicados en integraciones con gateways sin idempotencia. La restricción a GET debe estar en el código y protegida por un test.

**El circuit breaker debe ser por tenant.** Un tenant con credenciales mal configuradas genera `401` en cadena; si el breaker es global, tumba los pagos de todas las tiendas. Usar un `ConcurrentDictionary<TenantId, IAsyncPolicy>` con los breakers.

### 4.2 Manejo de secretos por tenant

```
public interface ITenantCredentialProvider
{
    ValueTask<PaywayCredentials> GetAsync(TenantId tenantId, CancellationToken ct);
}
```

Implementación:
1. `IMemoryCache` con TTL de 5 minutos (nunca Redis en claro).
2. Miss → leer las `*_ref` de `payment_gateway_credentials` → resolver contra Azure Key Vault / AWS Secrets Manager.
3. Emitir un evento de auditoría en cada resolución (quién, qué tenant, cuándo).
4. Invalidación explícita de caché cuando el operador cambia las credenciales.

`PaywayCredentials` debe ser un tipo con `ToString()` sobreescrito para devolver `"PaywayCredentials[REDACTED]"`, de modo que un log accidental no filtre nada.

### 4.3 Mapeo de errores a excepciones de dominio

```
Jerarquía:

PaymentGatewayException (abstract)
├── PaymentConfigurationException   ← 401, 403, reason.id 3 y 13
│     → NO reintentable. ALERTA CRÍTICA. Es culpa nuestra.
├── PaymentValidationException      ← 400
│     → NO reintentable. Bug nuestro.
├── PaymentProviderUnavailableException ← 5xx, timeout
│     → Estado Unknown. Disparar reconciliación.
└── PaymentNotFoundException        ← 404
```

**Un rechazo (`402`) NO lanza excepción.** Devuelve un `PaymentResult` con `Status = Declined` y el `Decline` poblado. Es un resultado de negocio válido, no un error.

```
// En PaywayGateway.ChargeAsync
var response = await _http.PostAsync("payments", payload, ct);

// 402 es un resultado, no un fallo
if (response.StatusCode == HttpStatusCode.PaymentRequired)
    return _responseMapper.MapDeclined(await ReadBodyAsync(response, ct));

if (!response.IsSuccessStatusCode)
    throw MapToDomainException(response);

return _responseMapper.MapSuccess(await ReadBodyAsync(response, ct));
```

### 4.4 Idempotencia con Redis

```
public sealed class RedisIdempotencyGuard
{
    // SET key value NX EX ttl → devuelve el token de liberación, o null
    public async Task<IdempotencyLease?> TryAcquireAsync(
        TenantId tenantId, OrderId orderId, string payloadHash, CancellationToken ct)
    {
        var key   = $"idem:{tenantId}:{orderId}:{payloadHash}";
        var token = Guid.NewGuid().ToString("N");

        var acquired = await _db.StringSetAsync(
            key, token, TimeSpan.FromSeconds(120), When.NotExists);

        return acquired ? new IdempotencyLease(key, token, this) : null;
    }
}
```

- **La liberación debe hacerse con un script Lua** que compare el token antes de borrar (evita que un proceso libere el lock de otro tras un timeout).
- **TTL de 120 s**, por encima del timeout de 35 s de la llamada, con margen.
- **El lock de Redis es la primera línea, no la única.** La constraint `uq_idempotency` de PostgreSQL es la garantía real. Redis solo evita el trabajo inútil.

### 4.5 Procesamiento asíncrono vía RabbitMQ

**Patrón Outbox, obligatorio.** El caso "actualicé la orden pero el evento no salió" no debe poder existir.

```
1. En la misma transacción de EF Core:
     - UPDATE payment_attempts
     - UPDATE orders
     - INSERT INTO outbox_messages (evento serializado)
2. Un BackgroundService lee outbox_messages y publica en RabbitMQ.
3. Marca como publicado. At-least-once.
4. Los consumidores son idempotentes (ver §4.6).
```

**Colas:**

| Exchange / Cola | Tipo | Uso |
|---|---|---|
| `payments.events` | topic | `payment.approved`, `payment.declined`, `payment.refunded` |
| `payments.reconcile` | **x-delayed-message** | Comandos de reconciliación con backoff |
| `payments.reconcile.dlq` | dead-letter | Los que agotaron reintentos → alerta |

**Nota de operación:** el exchange delayed requiere el plugin `rabbitmq_delayed_message_exchange`. Si no se puede instalar, la alternativa es una cola con TTL + DLX encadenadas por nivel de backoff, o un `BackgroundService` que consulte `ix_pa_pending` cada 30 s. La segunda opción es más simple y probablemente suficiente para nuestro volumen — **evaluarla antes de agregar una dependencia de plugin**.

### 4.6 Consumidor idempotente

```
UPDATE payment_attempts
   SET status = @newStatus,
       raw_provider_status = @raw,
       processed_at = now(),
       updated_at = now()
 WHERE id = @id
   AND status NOT IN ('Approved','Declined','Refunded');
```
Si `rowsAffected == 0`, el mensaje llegó tarde o duplicado → **ack y descartar sin error**. No lanzar excepción, no ir a la DLQ.

### 4.7 Test de arquitectura (que la abstracción no se rompa)

```
[Fact]
public void Application_no_debe_depender_de_tipos_de_Payway()
{
    var result = Types.InAssembly(typeof(IPaymentGateway).Assembly)
        .Should()
        .NotHaveDependencyOn("Tiendafy.Infrastructure.Payments.Payway")
        .GetResult();

    result.IsSuccessful.Should().BeTrue(
        "el vocabulario de Payway no debe filtrarse al Application layer");
}
```

Este test vale más que toda la documentación de este archivo: es lo que hace que la abstracción siga siendo real dentro de seis meses.

---

## 5. Checklist de go-live

### 5.1 Certificación con Payway
- [ ] Batería de transacciones de prueba ejecutada y documentada (ver `11-testing.md` §6.3)
- [ ] `site_transaction_id` e `id` de Payway de cada prueba, enviados a Payway
- [ ] Aprobación escrita de certificación
- [ ] **GAP-11 resuelto**: host de producción confirmado por escrito
- [ ] **GAP-12 resuelto**: tabla de `payment_method_id` vigente para nuestro site

### 5.2 Credenciales productivas
- [ ] Keys de producción recibidas por canal seguro (nunca por mail sin cifrar)
- [ ] Cargadas en el secret manager, **nunca en repositorio ni en variables de entorno del contenedor**
- [ ] Verificado que las keys de sandbox no están en ningún ambiente productivo
- [ ] Procedimiento de rotación documentado (aunque Payway no lo ofrezca por API: pedirlas nuevas, cargarlas, verificar, desactivar las viejas)
- [ ] Acceso a las credenciales auditado y restringido

### 5.3 Seguridad y PCI
- [ ] CSP estricta en la ruta del checkout
- [ ] SRI en el `<script>` de `decidir.js`
- [ ] Inventario de todos los scripts que corren en el checkout. **Cero analytics/chat/tag managers de terceros en esa ruta**
- [ ] TLS 1.2+ y HSTS
- [ ] Escaneo ASV contratado (SAQ A-EP)
- [ ] SAQ A-EP completado
- [ ] Verificado por test automatizado que los logs no contienen PAN, CVV ni `apikey`
- [ ] Verificado que los mensajes de RabbitMQ no contienen datos de tarjeta
- [ ] Verificado que las trazas de APM (si hay) no capturan bodies de requests a Payway

### 5.4 Observabilidad
- [ ] Métricas: tasa de aprobación por tenant, latencia p50/p95/p99, error rate, distribución de `reason.id`
- [ ] Alertas configuradas y probadas:
  - [ ] `PaymentUnknown` > 0 → **inmediata, on-call**
  - [ ] Tasa de aprobación caída > 15% vs. media móvil de 7 días
  - [ ] Error rate 5xx > 1% en 5 min
  - [ ] Circuit breaker abierto para cualquier tenant
  - [ ] Profundidad de la cola de reconciliación creciente > 15 min
  - [ ] Discrepancias de conciliación diaria > 0
- [ ] Dashboard operativo con las métricas anteriores
- [ ] Runbook de incidentes escrito: qué hacer ante `PaymentUnknown`, ante caída de Payway, ante 401 masivos

### 5.5 Operación
- [ ] Job diario de conciliación andando y verificado por 7 días en staging
- [ ] Panel admin de devoluciones con auditoría de quién devolvió y por qué
- [ ] Procedimiento de contracargo documentado (qué evidencia se junta: TID, datos 3DS, IP, dirección de envío)
- [ ] Onboarding de una tienda nueva documentado paso a paso
- [ ] Contacto de soporte de Payway y SLA documentados
- [ ] Plan de rollback: cómo se desactiva Payway para un tenant y se vuelve a Mercado Pago sin deploy (flag en `payment_gateway_credentials.is_active`)

### 5.6 Legal y normativo
- [ ] TEA y CFT visibles en la grilla de cuotas cuando hay interés
- [ ] Términos y condiciones actualizados con la información del procesador de pagos
- [ ] Política de reembolsos publicada
- [ ] Verificado que no reintentamos transacciones denegadas (política mandatoria de Payway)
