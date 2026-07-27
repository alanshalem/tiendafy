namespace Fiscal.Core.Domain;

/// <summary>
/// Configuración de facturación de una tienda (una por tenant). Guarda quién
/// emite (CUIT + condición IVA), el ambiente, y las preferencias de emisión.
/// El certificado y los puntos de venta viven en sus propias entidades.
/// </summary>
public sealed class FiscalConfig
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    /// <summary>CUIT del emisor, normalizado (11 dígitos).</summary>
    public string Cuit { get; private set; } = null!;
    public string BusinessName { get; private set; } = null!;
    public FiscalCondition Condition { get; private set; }
    public FiscalEnvironment Environment { get; private set; }

    public bool AutoInvoiceEnabled { get; private set; }
    public EmissionTrigger Trigger { get; private set; }
    /// <summary>Punto de venta usado para las ventas online automáticas.</summary>
    public Guid? DefaultPointOfSaleId { get; private set; }
    /// <summary>Umbral de consumidor final (RG): sobre este monto hay que identificar al comprador. Configurable, nunca hardcodeado.</summary>
    public long ConsumerFinalThresholdMinorUnits { get; private set; }

    public bool Enabled { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private FiscalConfig() { } // EF Core

    public static FiscalConfig Create(Guid tenantId, Cuit cuit, string businessName, FiscalCondition condition, FiscalEnvironment environment)
    {
        var now = DateTime.UtcNow;
        return new FiscalConfig
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Cuit = cuit.Value,
            BusinessName = businessName.Trim(),
            Condition = condition,
            Environment = environment,
            AutoInvoiceEnabled = false,
            Trigger = EmissionTrigger.OnPayment,
            ConsumerFinalThresholdMinorUnits = 10_000_000_00, // $10.000.000 (RG 5.700/2025), editable
            Enabled = false,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };
    }

    public void UpdateIdentity(Cuit cuit, string businessName, FiscalCondition condition, FiscalEnvironment environment)
    {
        Cuit = cuit.Value;
        BusinessName = businessName.Trim();
        Condition = condition;
        Environment = environment;
        Touch();
    }

    public void SetEmissionPreferences(bool autoInvoice, EmissionTrigger trigger, Guid? defaultPointOfSaleId, long consumerFinalThreshold)
    {
        AutoInvoiceEnabled = autoInvoice;
        Trigger = trigger;
        DefaultPointOfSaleId = defaultPointOfSaleId;
        if (consumerFinalThreshold > 0) ConsumerFinalThresholdMinorUnits = consumerFinalThreshold;
        Touch();
    }

    public void Enable() { Enabled = true; Touch(); }
    public void Disable() { Enabled = false; Touch(); }

    private void Touch() => UpdatedAtUtc = DateTime.UtcNow;
}

/// <summary>Punto de venta de ARCA (varios por tienda, ej. uno por canal).</summary>
public sealed class FiscalPointOfSale
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    /// <summary>Número de punto de venta habilitado en ARCA (ej. 1, 11).</summary>
    public int Number { get; private set; }
    /// <summary>Etiqueta interna (ej. "Web", "MercadoLibre", "Mostrador").</summary>
    public string Label { get; private set; } = null!;
    public bool Active { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private FiscalPointOfSale() { } // EF Core

    public static FiscalPointOfSale Create(Guid tenantId, int number, string label) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        Number = number,
        Label = label.Trim(),
        Active = true,
        CreatedAtUtc = DateTime.UtcNow,
    };

    public void Update(int number, string label, bool active)
    {
        Number = number;
        Label = label.Trim();
        Active = active;
    }
}
