using SharedKernel.Common;

namespace Finance.Infrastructure;

public enum AccountMovementKind
{
    In = 0,  // entró plata
    Out = 1, // salió plata
}

/// <summary>
/// Un movimiento de caja o de banco. Es la única fuente del saldo.
///
/// Puede nacer de tres lados: cargado a mano (un gasto, un aporte), de una
/// transferencia entre cuentas propias (dos movimientos hermanos con el mismo
/// <see cref="TransferGroupId"/>), o de un recibo de cobro o pago.
/// </summary>
public sealed class AccountMovement
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid AccountId { get; private set; }

    public DateTime OccurredAtUtc { get; private set; }
    public AccountMovementKind Kind { get; private set; }

    /// <summary>Siempre positivo: el signo lo da <see cref="Kind"/>.</summary>
    public long AmountMinor { get; private set; }
    public string Currency { get; private set; } = "ARS";

    public string Concept { get; private set; } = string.Empty;
    public string? Reference { get; private set; }

    /// <summary>Une las dos patas de una transferencia entre cuentas propias.</summary>
    public Guid? TransferGroupId { get; private set; }

    /// <summary>Recibo que lo generó, si vino de uno.</summary>
    public Guid? ReceiptId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    private AccountMovement() { } // EF Core

    public static Result<AccountMovement> Create(
        Guid tenantId, Guid accountId, AccountMovementKind kind, long amountMinor, string currency,
        string? concept, DateTime? occurredAtUtc = null, string? reference = null,
        Guid? transferGroupId = null, Guid? receiptId = null)
    {
        if (amountMinor <= 0)
            return Result.Failure<AccountMovement>(Error.Validation(
                "Finance.MovementAmount", "El importe tiene que ser mayor a cero."));

        var text = (concept ?? string.Empty).Trim();
        if (text.Length is < 2 or > 200)
            return Result.Failure<AccountMovement>(Error.Validation(
                "Finance.MovementConcept", "El concepto tiene entre 2 y 200 caracteres."));

        return Result.Success(new AccountMovement
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AccountId = accountId,
            OccurredAtUtc = occurredAtUtc ?? DateTime.UtcNow,
            Kind = kind,
            AmountMinor = amountMinor,
            Currency = currency.Trim().ToUpperInvariant(),
            Concept = text,
            Reference = string.IsNullOrWhiteSpace(reference) ? null : reference.Trim(),
            TransferGroupId = transferGroupId,
            ReceiptId = receiptId,
            CreatedAtUtc = DateTime.UtcNow,
        });
    }

    /// <summary>Cuánto suma al saldo de la cuenta: positivo si entró, negativo si salió.</summary>
    public long SignedAmountMinor => Kind == AccountMovementKind.In ? AmountMinor : -AmountMinor;
}
