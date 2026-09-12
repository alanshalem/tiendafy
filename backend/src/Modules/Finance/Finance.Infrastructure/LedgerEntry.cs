using SharedKernel.Common;

namespace Finance.Infrastructure;

public enum PartyKind
{
    Customer = 0,
    Supplier = 1,
}

public enum LedgerEntryKind
{
    Debit = 0,  // Debe
    Credit = 1, // Haber
}

public enum LedgerDocType
{
    OpeningBalance = 0, // saldo con el que arranca la cuenta al cargarla
    Sale = 1,           // venta a cuenta corriente
    CreditNote = 2,     // nota de crédito / devolución
    Receipt = 3,        // cobro de un cliente
    Purchase = 4,       // factura de un proveedor
    Payment = 5,        // pago a un proveedor
    Adjustment = 6,     // ajuste manual, con motivo
}

/// <summary>
/// Un movimiento de cuenta corriente: lo que un cliente nos debe o lo que le
/// debemos a un proveedor.
///
/// EL SIGNO SE LEE SIEMPRE DESDE NUESTRO LADO. Saldo = Σ Debe − Σ Haber:
///   · Cliente: una venta suma al Debe (nos debe) y un cobro suma al Haber.
///     Saldo positivo = nos debe plata.
///   · Proveedor: su factura suma al Haber (le debemos) y nuestro pago suma al
///     Debe. Saldo negativo = le debemos plata.
///
/// Una sola fórmula para los dos casos. La alternativa —invertir el signo según
/// con quién estemos— es la fuente clásica de saldos al revés.
///
/// Las entradas NO se editan ni se borran: un error se corrige con un ajuste
/// que deja rastro. Una cuenta corriente que se puede reescribir no sirve para
/// discutir con un cliente.
/// </summary>
public sealed class LedgerEntry
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    public PartyKind PartyKind { get; private set; }

    /// <summary>Id del cliente o del proveedor. Sin clave foránea: viven en otros módulos.</summary>
    public Guid PartyId { get; private set; }

    public DateTime OccurredAtUtc { get; private set; }
    public LedgerEntryKind Kind { get; private set; }

    /// <summary>Siempre positivo: el signo lo da <see cref="Kind"/>.</summary>
    public long AmountMinor { get; private set; }
    public string Currency { get; private set; } = "ARS";

    public LedgerDocType DocType { get; private set; }

    /// <summary>Id del documento que lo originó (venta, recibo, orden de compra).</summary>
    public Guid? DocId { get; private set; }

    /// <summary>Cómo se llama ese documento para una persona: "Venta #1042", "REC-0007".</summary>
    public string DocLabel { get; private set; } = string.Empty;

    public string? Notes { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>
    /// Cuánto de este débito ya se cobró. Solo se usa en las entradas del Debe:
    /// es lo que permite imputar un cobro a una factura puntual y saber qué
    /// queda pendiente, en vez de tener solo un saldo global.
    /// </summary>
    public long SettledMinor { get; private set; }

    private LedgerEntry() { } // EF Core

    public static Result<LedgerEntry> Create(
        Guid tenantId, PartyKind partyKind, Guid partyId, LedgerEntryKind kind, long amountMinor,
        string currency, LedgerDocType docType, string? docLabel, Guid? docId = null,
        DateTime? occurredAtUtc = null, string? notes = null)
    {
        if (amountMinor <= 0)
            return Result.Failure<LedgerEntry>(Error.Validation(
                "Finance.LedgerAmount", "El importe tiene que ser mayor a cero."));

        var label = (docLabel ?? string.Empty).Trim();
        if (label.Length is < 1 or > 120)
            return Result.Failure<LedgerEntry>(Error.Validation(
                "Finance.LedgerLabel", "Falta el nombre del comprobante."));

        return Result.Success(new LedgerEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            PartyKind = partyKind,
            PartyId = partyId,
            OccurredAtUtc = occurredAtUtc ?? DateTime.UtcNow,
            Kind = kind,
            AmountMinor = amountMinor,
            Currency = currency.Trim().ToUpperInvariant(),
            DocType = docType,
            DocId = docId,
            DocLabel = label,
            Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
        });
    }

    /// <summary>Cuánto falta cobrar (o pagar) de este comprobante.</summary>
    public long PendingMinor => Math.Max(0, AmountMinor - SettledMinor);

    /// <summary>Imputa un cobro o pago. Nunca deja el comprobante sobrepagado.</summary>
    public Result Settle(long amountMinor)
    {
        if (amountMinor <= 0)
            return Result.Failure(Error.Validation("Finance.Settle", "El importe imputado tiene que ser positivo."));
        if (amountMinor > PendingMinor)
            return Result.Failure(Error.Validation(
                "Finance.SettleTooMuch", $"No se puede imputar más de lo que queda pendiente en {DocLabel}."));

        SettledMinor += amountMinor;
        return Result.Success();
    }

    /// <summary>Deshace una imputación (cuando se anula el recibo que la generó).</summary>
    public void Unsettle(long amountMinor) => SettledMinor = Math.Max(0, SettledMinor - amountMinor);

    /// <summary>Cuánto suma al saldo, leído desde nuestro lado.</summary>
    public long SignedAmountMinor => Kind == LedgerEntryKind.Debit ? AmountMinor : -AmountMinor;
}
