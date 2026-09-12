using SharedKernel.Common;

namespace Finance.Infrastructure;

public enum FinancialAccountKind
{
    Cash = 0, // caja: efectivo en el local o en la oficina
    Bank = 1, // banco: cuenta corriente, caja de ahorro
}

/// <summary>
/// Dónde está la plata: una caja o una cuenta de banco.
///
/// El sistema sabía cobrar (Mercado Pago, Payway, efectivo en una venta manual)
/// pero no dónde quedaba lo cobrado. Sin esto no hay forma de responder "cuánto
/// tengo" sin abrir el homebanking y una planilla aparte.
///
/// El saldo NO se guarda: se calcula sumando los movimientos sobre el saldo
/// inicial. Un saldo guardado y una lista de movimientos siempre terminan
/// discrepando, y entonces no se le cree a ninguno de los dos.
/// </summary>
public sealed class FinancialAccount
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    public string Name { get; private set; } = string.Empty;
    public FinancialAccountKind Kind { get; private set; }

    /// <summary>ISO 4217. Una cuenta es de UNA moneda: mezclarlas esconde la posición real.</summary>
    public string Currency { get; private set; } = "ARS";

    /// <summary>Lo que había el día que se cargó la cuenta, en unidades menores.</summary>
    public long OpeningBalanceMinor { get; private set; }

    /// <summary>Banco, titular o lo que sirva para identificarla. Libre.</summary>
    public string? Detail { get; private set; }

    public bool Active { get; private set; } = true;
    public DateTime CreatedAtUtc { get; private set; }

    private FinancialAccount() { } // EF Core

    public static Result<FinancialAccount> Create(
        Guid tenantId, string? name, FinancialAccountKind kind, string? currency, long openingBalanceMinor, string? detail)
    {
        var clean = (name ?? string.Empty).Trim();
        if (clean.Length is < 2 or > 80)
            return Result.Failure<FinancialAccount>(Error.Validation(
                "Finance.AccountName", "El nombre de la cuenta tiene entre 2 y 80 caracteres."));

        var iso = (currency ?? "ARS").Trim().ToUpperInvariant();
        if (iso.Length != 3)
            return Result.Failure<FinancialAccount>(Error.Validation(
                "Finance.AccountCurrency", "La moneda va en formato ISO de 3 letras (ARS, USD)."));

        return Result.Success(new FinancialAccount
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = clean,
            Kind = kind,
            Currency = iso,
            OpeningBalanceMinor = openingBalanceMinor,
            Detail = string.IsNullOrWhiteSpace(detail) ? null : detail.Trim(),
            Active = true,
            CreatedAtUtc = DateTime.UtcNow,
        });
    }

    public Result Update(string? name, string? detail, bool active)
    {
        var clean = (name ?? string.Empty).Trim();
        if (clean.Length is < 2 or > 80)
            return Result.Failure(Error.Validation(
                "Finance.AccountName", "El nombre de la cuenta tiene entre 2 y 80 caracteres."));

        Name = clean;
        Detail = string.IsNullOrWhiteSpace(detail) ? null : detail.Trim();
        Active = active;
        return Result.Success();
    }
}
