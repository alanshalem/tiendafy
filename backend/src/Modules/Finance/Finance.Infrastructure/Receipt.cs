using SharedKernel.Common;

namespace Finance.Infrastructure;

public enum ReceiptKind
{
    Collection = 0, // recibo de cobro a un cliente
    Payment = 1,    // orden de pago a un proveedor
}

/// <summary>
/// Un cobro o un pago, con dos caras que tienen que cerrar:
///   · De dónde salió o a dónde entró la plata: una o varias cuentas
///     (<see cref="ReceiptPayment"/>). Por eso se puede cobrar mitad en
///     efectivo y mitad por transferencia en una sola operación.
///   · Contra qué se aplica: los comprobantes que cancela
///     (<see cref="ReceiptAllocation"/>). Puede quedar sin imputar —un pago a
///     cuenta— y eso también es válido: baja el saldo igual.
///
/// Nunca se edita. Si estaba mal, se anula y se hace de nuevo: los movimientos
/// de caja y las imputaciones se revierten juntos, o no se revierte nada.
/// </summary>
public sealed class Receipt
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    public ReceiptKind Kind { get; private set; }

    /// <summary>Número correlativo por tienda y tipo: REC-0001, OP-0001.</summary>
    public string Number { get; private set; } = string.Empty;

    public PartyKind PartyKind { get; private set; }
    public Guid PartyId { get; private set; }

    /// <summary>Nombre al momento del recibo: si después le cambian el nombre, el recibo no miente.</summary>
    public string PartyName { get; private set; } = string.Empty;

    public DateTime OccurredAtUtc { get; private set; }
    public string Currency { get; private set; } = "ARS";
    public long TotalMinor { get; private set; }
    public string? Notes { get; private set; }

    public bool Voided { get; private set; }
    public DateTime? VoidedAtUtc { get; private set; }
    public string? VoidReason { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    private readonly List<ReceiptPayment> _payments = [];
    public IReadOnlyList<ReceiptPayment> Payments => _payments.AsReadOnly();

    private readonly List<ReceiptAllocation> _allocations = [];
    public IReadOnlyList<ReceiptAllocation> Allocations => _allocations.AsReadOnly();

    private Receipt() { } // EF Core

    public static Result<Receipt> Create(
        Guid tenantId, ReceiptKind kind, string number, PartyKind partyKind, Guid partyId, string? partyName,
        string currency, DateTime? occurredAtUtc, string? notes,
        IReadOnlyList<(Guid AccountId, long AmountMinor)> payments,
        IReadOnlyList<(Guid LedgerEntryId, long AmountMinor)> allocations)
    {
        if (payments.Count == 0)
            return Result.Failure<Receipt>(Error.Validation(
                "Finance.ReceiptNoPayments", "Indicá de qué caja o banco sale (o entra) la plata."));

        if (payments.Any(p => p.AmountMinor <= 0))
            return Result.Failure<Receipt>(Error.Validation(
                "Finance.ReceiptAmount", "Cada importe tiene que ser mayor a cero."));

        var total = payments.Sum(p => p.AmountMinor);

        var allocated = allocations.Sum(a => a.AmountMinor);
        if (allocations.Any(a => a.AmountMinor <= 0))
            return Result.Failure<Receipt>(Error.Validation(
                "Finance.AllocationAmount", "Cada imputación tiene que ser mayor a cero."));

        // Imputar más de lo que se cobra dejaría comprobantes cancelados con
        // plata que nunca entró. Imputar de menos es válido: el resto queda a cuenta.
        if (allocated > total)
            return Result.Failure<Receipt>(Error.Validation(
                "Finance.AllocationExceedsTotal",
                "Estás imputando más de lo que se cobra. Lo que sobra queda a cuenta, pero no puede superar el total."));

        var receipt = new Receipt
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Kind = kind,
            Number = number,
            PartyKind = partyKind,
            PartyId = partyId,
            PartyName = (partyName ?? string.Empty).Trim(),
            OccurredAtUtc = occurredAtUtc ?? DateTime.UtcNow,
            Currency = currency.Trim().ToUpperInvariant(),
            TotalMinor = total,
            Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
        };

        foreach (var (accountId, amount) in payments)
            receipt._payments.Add(new ReceiptPayment(accountId, amount));
        foreach (var (entryId, amount) in allocations)
            receipt._allocations.Add(new ReceiptAllocation(entryId, amount));

        return Result.Success(receipt);
    }

    public Result Void(string? reason)
    {
        if (Voided) return Result.Failure(Error.Validation("Finance.AlreadyVoided", "Este recibo ya está anulado."));
        Voided = true;
        VoidedAtUtc = DateTime.UtcNow;
        VoidReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        return Result.Success();
    }

    /// <summary>Lo que entró o salió y no se imputó a ningún comprobante.</summary>
    public long UnallocatedMinor => TotalMinor - _allocations.Sum(a => a.AmountMinor);
}

/// <summary>De qué cuenta salió (o a cuál entró) una parte del recibo.</summary>
public sealed class ReceiptPayment
{
    public Guid Id { get; private set; }
    public Guid AccountId { get; private set; }
    public long AmountMinor { get; private set; }

    private ReceiptPayment() { } // EF Core

    internal ReceiptPayment(Guid accountId, long amountMinor)
    {
        Id = Guid.NewGuid();
        AccountId = accountId;
        AmountMinor = amountMinor;
    }
}

/// <summary>Qué comprobante de la cuenta corriente cancela, y por cuánto.</summary>
public sealed class ReceiptAllocation
{
    public Guid Id { get; private set; }
    public Guid LedgerEntryId { get; private set; }
    public long AmountMinor { get; private set; }

    private ReceiptAllocation() { } // EF Core

    internal ReceiptAllocation(Guid ledgerEntryId, long amountMinor)
    {
        Id = Guid.NewGuid();
        LedgerEntryId = ledgerEntryId;
        AmountMinor = amountMinor;
    }
}
