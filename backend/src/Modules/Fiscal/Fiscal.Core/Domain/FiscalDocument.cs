namespace Fiscal.Core.Domain;

/// <summary>Resultado de ARCA al autorizar. 'A' con observaciones sigue siendo
/// válido (H13): las Obs no son errores.</summary>
public enum FiscalResult
{
    Pending = 0,     // encolado / en proceso, sin respuesta aún
    Authorized = 1,  // 'A' — CAE otorgado (puede traer Observaciones)
    Rejected = 2,    // 'R' — rechazado (Errores)
    Partial = 3,     // 'P' — parcial (lotes)
}

/// <summary>
/// Comprobante fiscal emitido (o intento). Guarda el CAE, el resultado, las
/// observaciones/errores por separado (H13) y el request/response crudos para
/// auditoría. Se referencia a la orden por OrderId (null = emisión manual).
/// </summary>
public sealed class FiscalDocument
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid? OrderId { get; private set; }
    public FiscalEnvironment Environment { get; private set; }

    public int PtoVta { get; private set; }
    public CbteTipo CbteTipo { get; private set; }
    public long Number { get; private set; }

    public DocTipo DocTipo { get; private set; }
    public long DocNro { get; private set; }
    public decimal ImpTotal { get; private set; }
    public decimal ImpNeto { get; private set; }
    public decimal ImpIVA { get; private set; }

    public FiscalResult Result { get; private set; }
    public string? Cae { get; private set; }
    public DateTime? CaeVtoUtc { get; private set; }
    /// <summary>Observaciones de ARCA (JSON). Con CAE presente, NO son error.</summary>
    public string? Observations { get; private set; }
    /// <summary>Errores de ARCA (JSON) si Result = Rejected.</summary>
    public string? Errors { get; private set; }

    /// <summary>Request/response crudos, para auditoría (retención fiscal).</summary>
    public string? RequestPayload { get; private set; }
    public string? ResponsePayload { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private FiscalDocument() { } // EF Core

    public static FiscalDocument Draft(
        Guid tenantId, Guid? orderId, FiscalEnvironment environment,
        int ptoVta, CbteTipo cbteTipo, long number,
        DocTipo docTipo, long docNro, decimal impTotal, decimal impNeto, decimal impIva)
    {
        var now = DateTime.UtcNow;
        return new FiscalDocument
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            OrderId = orderId,
            Environment = environment,
            PtoVta = ptoVta,
            CbteTipo = cbteTipo,
            Number = number,
            DocTipo = docTipo,
            DocNro = docNro,
            ImpTotal = impTotal,
            ImpNeto = impNeto,
            ImpIVA = impIva,
            Result = FiscalResult.Pending,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };
    }

    public void MarkAuthorized(string cae, DateTime caeVto, string? observationsJson, string? request, string? response)
    {
        Result = FiscalResult.Authorized;
        Cae = cae;
        CaeVtoUtc = caeVto;
        Observations = observationsJson;
        RequestPayload = request;
        ResponsePayload = response;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void MarkRejected(string errorsJson, string? request, string? response)
    {
        Result = FiscalResult.Rejected;
        Errors = errorsJson;
        RequestPayload = request;
        ResponsePayload = response;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}

/// <summary>
/// Secuencia local de numeración por (tenant, ptoVta, cbteTipo). Se sincroniza
/// con FECompUltimoAutorizado y se protege con advisory lock al asignar (D2).
/// </summary>
public sealed class FiscalSequence
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public FiscalEnvironment Environment { get; private set; }
    public int PtoVta { get; private set; }
    public CbteTipo CbteTipo { get; private set; }
    public long LastNumber { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private FiscalSequence() { } // EF Core

    public static FiscalSequence Create(Guid tenantId, FiscalEnvironment env, int ptoVta, CbteTipo cbteTipo, long lastNumber) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        Environment = env,
        PtoVta = ptoVta,
        CbteTipo = cbteTipo,
        LastNumber = lastNumber,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    /// <summary>Reconcilia con lo que dice ARCA (nunca retrocede).</summary>
    public void SyncWithAuthority(long authorityLast)
    {
        if (authorityLast > LastNumber) LastNumber = authorityLast;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Reserva el próximo número (bajo advisory lock del caller).</summary>
    public long Next()
    {
        LastNumber += 1;
        UpdatedAtUtc = DateTime.UtcNow;
        return LastNumber;
    }
}
