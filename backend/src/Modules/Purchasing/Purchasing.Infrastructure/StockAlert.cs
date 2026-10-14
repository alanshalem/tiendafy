namespace Purchasing.Infrastructure;

/// <summary>Cuándo avisa la tienda que algo cruzó su punto de reposición.</summary>
public static class StockAlertMode
{
    /// <summary>Sin avisos (lo de fábrica: como todo email automático, se prende a propósito).</summary>
    public const string Off = "off";

    /// <summary>Un email apenas se detecta el cruce (el worker mira cada 5 minutos).</summary>
    public const string Immediate = "inmediato";

    /// <summary>Un solo email por día, a la hora elegida, con todo lo que cruzó desde el anterior.</summary>
    public const string Daily = "diario";

    public static bool IsValid(string? mode) => mode is Off or Immediate or Daily;
}

/// <summary>
/// Configuración de las alertas de stock bajo de una tienda, y el turno del
/// worker: <see cref="NextRunAtUtc"/> es a la vez cuándo toca la próxima
/// pasada y el lease que la reclama (UPDATE condicional), así dos instancias
/// de la Api no evalúan la misma tienda a la vez.
/// </summary>
public sealed class StockAlertSettings
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Mode { get; private set; } = StockAlertMode.Off;

    /// <summary>Hora de Argentina (0–23) del resumen diario.</summary>
    public int DigestHourLocal { get; private set; } = 9;

    public DateTime NextRunAtUtc { get; private set; }
    public DateTime? LastDigestAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private StockAlertSettings() { } // EF Core

    public static StockAlertSettings Create(Guid tenantId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        NextRunAtUtc = DateTime.UtcNow,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    public void Configure(string mode, int digestHourLocal)
    {
        Mode = StockAlertMode.IsValid(mode) ? mode : StockAlertMode.Off;
        DigestHourLocal = Math.Clamp(digestHourLocal, 0, 23);
        // Que la próxima pasada sea ya: al prender los avisos no hay que esperar.
        NextRunAtUtc = DateTime.UtcNow;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void DigestSent(DateTime nowUtc) => LastDigestAtUtc = nowUtc;
}

/// <summary>
/// Lo que la tienda decidió para una variante: un mínimo propio (avisar con
/// N unidades o menos, aunque no se venda: lo que la señal de reposición no
/// ve porque no tiene ventas) o silenciarla (un producto que se discontinúa
/// no tiene que avisar nunca).
/// </summary>
public sealed class StockAlertRule
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid VariantId { get; private set; }
    public int? MinUnits { get; private set; }
    public bool Muted { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private StockAlertRule() { } // EF Core

    public static StockAlertRule Create(Guid tenantId, Guid variantId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        VariantId = variantId,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    public void Set(int? minUnits, bool muted)
    {
        MinUnits = minUnits is { } m ? Math.Clamp(m, 0, 1_000_000) : null;
        Muted = muted;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Sin mínimo y sin silenciar es la regla de fábrica: la fila sobra.</summary>
    public bool IsDefault => MinUnits is null && !Muted;
}

/// <summary>
/// Dónde está cada variante respecto de su punto de reposición. Es lo que
/// hace que se avise UNA vez por cruce: el aviso sale cuando pasa de "bien" a
/// "bajo" (<see cref="CrossedAtUtc"/>), se marca enviado
/// (<see cref="NotifiedAtUtc"/>, reclamado con un UPDATE condicional) y no se
/// repite mientras siga bajo. Cuando se repone vuelve a "bien", y el próximo
/// cruce es otro aviso.
/// </summary>
public sealed class StockAlertState
{
    public const string ReasonReorder = "reposicion";
    public const string ReasonMinimum = "minimo";

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid VariantId { get; private set; }
    public bool IsLow { get; private set; }
    public DateTime? CrossedAtUtc { get; private set; }
    public DateTime? NotifiedAtUtc { get; private set; }
    public DateTime? RecoveredAtUtc { get; private set; }

    /// <summary>Por qué está bajo: <see cref="ReasonReorder"/> o <see cref="ReasonMinimum"/>.</summary>
    public string? Reason { get; private set; }

    /// <summary>Disponible cuando se lo vio por última vez (para el email).</summary>
    public int Available { get; private set; }

    public int SuggestedQty { get; private set; }

    private StockAlertState() { } // EF Core

    public static StockAlertState Create(Guid tenantId, Guid variantId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        VariantId = variantId,
    };

    /// <summary>Se lo vio bajo. True si recién cruzó (estaba bien o no se lo conocía).</summary>
    public bool ObserveLow(string reason, int available, int suggestedQty, DateTime nowUtc)
    {
        var crossed = !IsLow;
        if (crossed)
        {
            IsLow = true;
            CrossedAtUtc = nowUtc;
            NotifiedAtUtc = null;
        }
        Reason = reason;
        Available = available;
        SuggestedQty = Math.Max(0, suggestedQty);
        return crossed;
    }

    /// <summary>Se lo vio bien: se repuso (o se silenció). El próximo cruce vuelve a avisar.</summary>
    public void ObserveRecovered(DateTime nowUtc)
    {
        if (!IsLow) return;
        IsLow = false;
        RecoveredAtUtc = nowUtc;
    }

    public bool PendingNotification => IsLow && NotifiedAtUtc is null;
}

/// <summary>Alguien del equipo que no quiere recibir estos emails (los sigue viendo en el panel).</summary>
public sealed class StockAlertOptOut
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid UserId { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private StockAlertOptOut() { } // EF Core

    public static StockAlertOptOut Create(Guid tenantId, Guid userId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        UserId = userId,
        CreatedAtUtc = DateTime.UtcNow,
    };
}
