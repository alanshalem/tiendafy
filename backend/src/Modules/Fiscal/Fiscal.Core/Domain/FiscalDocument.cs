namespace Fiscal.Core.Domain;

/// <summary>Resultado de ARCA al autorizar. 'A' con observaciones sigue siendo
/// válido (H13): las Obs no son errores.</summary>
public enum FiscalResult
{
    /// <summary>
    /// Se le pidió el CAE a ARCA y no sabemos qué contestó (timeout, corte). El
    /// número puede estar usado del otro lado: antes de volver a emitir hay que
    /// preguntarle a ARCA por él (FECompConsultar). Nunca se reintenta a ciegas.
    /// </summary>
    Pending = 0,
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

    /// <summary>
    /// Condición frente al IVA del receptor con la que se emitió (la que viajó
    /// en CondicionIVAReceptorId). Hace falta guardarla porque no se puede
    /// volver a deducir: pudo declararla el comercio o devolverla el padrón, y
    /// la nota de crédito tiene que salir al mismo receptor y con la misma
    /// clase que la factura. Null en comprobantes viejos (ver <see cref="IssuedReceptor"/>).
    /// </summary>
    public CondicionIvaReceptor? ReceptorCondicion { get; private set; }

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

    /// <summary>
    /// Cuándo se le mandó al comprador el email con su factura (plantilla
    /// "factura", si la tienda la prendió). Lo reclama con un
    /// UPDATE condicional quien manda el email: el worker y el botón manual
    /// pueden terminar la misma factura, y el comprador recibe uno solo.
    /// </summary>
    public DateTime? BuyerNotifiedAtUtc { get; private set; }

    private FiscalDocument() { } // EF Core

    /// <summary>
    /// El receptor tal como salió en este comprobante. Una nota de crédito lo
    /// copia: si se recalculara desde el documento de la venta, una factura A a
    /// un RI persona física (declarado a mano o por el padrón) o con el
    /// documento corregido al facturar tendría una NC B o a otro comprador, y
    /// ARCA la rechaza (10123, receptor distinto del comprobante asociado).
    ///
    /// <para>
    /// Los comprobantes de antes de guardar la condición la toman de la clase:
    /// una A solo se emite a un Responsable Inscripto; una B o una C, a efectos
    /// de la nota de crédito, como consumidor final. La migración que agregó la
    /// columna la completó desde el pedido guardado cuando lo había.
    /// </para>
    /// </summary>
    public Receptor IssuedReceptor() => new(DocTipo, DocNro, ReceptorCondicion ?? (
        CbteTipo is CbteTipo.FacturaA or CbteTipo.NotaCreditoA or CbteTipo.NotaDebitoA
            ? CondicionIvaReceptor.ResponsableInscripto
            : CondicionIvaReceptor.ConsumidorFinal));

    public static FiscalDocument Draft(
        Guid tenantId, Guid? orderId, FiscalEnvironment environment,
        int ptoVta, CbteTipo cbteTipo, long number,
        DocTipo docTipo, long docNro, decimal impTotal, decimal impNeto, decimal impIva,
        CondicionIvaReceptor? receptorCondicion = null)
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
            ReceptorCondicion = receptorCondicion,
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

    /// <summary>
    /// ARCA lo rechazó. Se guardan errores Y observaciones: con Resultado "R" las
    /// observaciones son el motivo del rechazo, y guardar solo los errores dejaba
    /// la mitad de los rechazos sin explicación.
    /// </summary>
    public void MarkRejected(string errorsJson, string? request, string? response, string? observationsJson = null)
    {
        Result = FiscalResult.Rejected;
        Errors = errorsJson;
        Observations = observationsJson;
        RequestPayload = request;
        ResponsePayload = response;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Se mandó el pedido de CAE y la respuesta no llegó. Queda Pending con el
    /// número reservado hasta que una reconciliación le pregunte a ARCA.
    /// </summary>
    public void MarkAwaitingReconciliation(string? request, string reason)
    {
        Result = FiscalResult.Pending;
        RequestPayload = request;
        Errors = System.Text.Json.JsonSerializer.Serialize(new[] { new { Code = "Pendiente", Message = reason } });
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// La reconciliación confirmó que ARCA nunca registró este número: el pedido
    /// no llegó. Se cierra como rechazado para que el número quede libre.
    /// </summary>
    public void MarkNeverReachedArca()
    {
        Result = FiscalResult.Rejected;
        Errors = System.Text.Json.JsonSerializer.Serialize(new[]
        {
            new { Code = "NoLlego", Message = "El pedido no llegó a ARCA: el número no se usó y se reintenta con el próximo." },
        });
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// ARCA tiene ese número, pero con OTRO comprobante (otro receptor u otro
    /// importe). No se adopta: sería ponerle a esta venta la factura de otra.
    /// </summary>
    public void MarkNumberTakenByAnother(long arcaDocNro, decimal arcaTotal)
    {
        Result = FiscalResult.Rejected;
        Errors = System.Text.Json.JsonSerializer.Serialize(new[]
        {
            new
            {
                Code = "NumeroAjeno",
                // Con ArgentineNumbers: interpolado con la cultura del proceso,
                // en el contenedor (invariante) salía "total 1500.5".
                Message = $"ARCA tiene el número {Number} con otro comprobante (doc {arcaDocNro}, total ${SharedKernel.Common.ArgentineNumbers.Number(arcaTotal, 2)}). " +
                          "¿Se emite con este punto de venta desde otro sistema?",
            },
        });
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

    /// <summary>
    /// Se pisa con lo que dice ARCA, en las dos direcciones. ARCA acepta
    /// exactamente último+1 (si no, rechaza con 10016), así que lo local no puede
    /// mandar nunca: si quedó adelante es porque se avanzó un número que ARCA no
    /// autorizó, y "no retroceder" dejaba todas las emisiones siguientes
    /// rechazadas para siempre.
    /// </summary>
    /// <returns>true si lo local estaba desfasado (vale la pena loguearlo).</returns>
    public bool SyncWithAuthority(long authorityLast)
    {
        var drifted = LastNumber != authorityLast;
        LastNumber = authorityLast;
        UpdatedAtUtc = DateTime.UtcNow;
        return drifted;
    }

    /// <summary>Reserva el próximo número (bajo advisory lock del caller).</summary>
    public long Next()
    {
        LastNumber += 1;
        UpdatedAtUtc = DateTime.UtcNow;
        return LastNumber;
    }
}
