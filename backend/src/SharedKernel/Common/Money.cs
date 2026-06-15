namespace SharedKernel.Common;

/// <summary>
/// Dinero como entero en unidad mínima (centavos) + código ISO 4217.
/// Nunca float/double: un double en pagos es un incidente esperando fecha.
/// Operaciones entre monedas distintas lanzan excepción.
/// </summary>
public readonly record struct Money(long AmountInMinorUnits, string Currency)
{
    public static Money Zero(string currency) => new(0, currency);

    public static Money FromDecimal(decimal amount, string currency) =>
        new((long)Math.Round(amount * 100, MidpointRounding.ToEven), currency);

    public decimal ToDecimal() => AmountInMinorUnits / 100m;

    public bool IsZero => AmountInMinorUnits == 0;
    public bool IsNegative => AmountInMinorUnits < 0;

    public static Money operator +(Money left, Money right)
    {
        EnsureSameCurrency(left, right);
        return left with { AmountInMinorUnits = checked(left.AmountInMinorUnits + right.AmountInMinorUnits) };
    }

    public static Money operator -(Money left, Money right)
    {
        EnsureSameCurrency(left, right);
        return left with { AmountInMinorUnits = checked(left.AmountInMinorUnits - right.AmountInMinorUnits) };
    }

    public static Money operator *(Money money, int factor) =>
        money with { AmountInMinorUnits = checked(money.AmountInMinorUnits * factor) };

    public static bool operator <(Money left, Money right)
    {
        EnsureSameCurrency(left, right);
        return left.AmountInMinorUnits < right.AmountInMinorUnits;
    }

    public static bool operator >(Money left, Money right)
    {
        EnsureSameCurrency(left, right);
        return left.AmountInMinorUnits > right.AmountInMinorUnits;
    }

    public static bool operator <=(Money left, Money right) => !(left > right);
    public static bool operator >=(Money left, Money right) => !(left < right);

    private static void EnsureSameCurrency(Money left, Money right)
    {
        if (!string.Equals(left.Currency, right.Currency, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException(
                $"Cannot operate on different currencies: {left.Currency} vs {right.Currency}.");
    }

    public override string ToString() => $"{ToDecimal():0.00} {Currency}";
}
