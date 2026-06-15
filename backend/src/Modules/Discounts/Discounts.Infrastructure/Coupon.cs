using SharedKernel.Common;

namespace Discounts.Infrastructure;

public enum CouponType
{
    Percentage = 0,
    FixedAmount = 1,
    FreeShipping = 2,
}

/// <summary>
/// Cupón de descuento de una tienda. Monto fijo, porcentaje o envío gratis,
/// con vigencia (desde/hasta), compra mínima y límite de usos.
/// </summary>
public sealed class Coupon
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = null!;
    public CouponType Type { get; private set; }
    /// <summary>Porcentaje (1-100) o monto en centavos según el tipo.</summary>
    public long Value { get; private set; }
    /// <summary>Compra mínima en centavos (0 = sin mínimo).</summary>
    public long MinPurchase { get; private set; }
    public DateTime? StartsAtUtc { get; private set; }
    public DateTime? EndsAtUtc { get; private set; }
    public int? MaxUses { get; private set; }
    public int UsedCount { get; private set; }
    public bool Active { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private Coupon() { } // EF Core

    public static Result<Coupon> Create(
        Guid tenantId, string? code, CouponType type, long value, long minPurchase,
        DateTime? startsAt, DateTime? endsAt, int? maxUses, bool active)
    {
        var check = Validate(code, type, value, minPurchase, startsAt, endsAt, maxUses);
        if (check.IsFailure) return Result.Failure<Coupon>(check.Error);

        return new Coupon
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Code = Normalize(code!),
            Type = type,
            Value = value,
            MinPurchase = Math.Max(0, minPurchase),
            StartsAtUtc = startsAt,
            EndsAtUtc = endsAt,
            MaxUses = maxUses,
            UsedCount = 0,
            Active = active,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    public Result Update(
        string? code, CouponType type, long value, long minPurchase,
        DateTime? startsAt, DateTime? endsAt, int? maxUses, bool active)
    {
        var check = Validate(code, type, value, minPurchase, startsAt, endsAt, maxUses);
        if (check.IsFailure) return check;

        Code = Normalize(code!);
        Type = type;
        Value = value;
        MinPurchase = Math.Max(0, minPurchase);
        StartsAtUtc = startsAt;
        EndsAtUtc = endsAt;
        MaxUses = maxUses;
        Active = active;
        return Result.Success();
    }

    public void SetActive(bool active) => Active = active;
    public void RegisterUse() => UsedCount++;

    /// <summary>Evalúa el cupón contra un subtotal y devuelve el descuento o el motivo del rechazo.</summary>
    public CouponEvaluation Evaluate(long subtotal, DateTime now)
    {
        if (!Active) return CouponEvaluation.Invalid("El cupón no está activo.");
        if (StartsAtUtc is { } s && now < s) return CouponEvaluation.Invalid("El cupón todavía no está vigente.");
        if (EndsAtUtc is { } e && now > e) return CouponEvaluation.Invalid("El cupón venció.");
        if (MaxUses is { } m && UsedCount >= m) return CouponEvaluation.Invalid("El cupón alcanzó su límite de usos.");
        if (subtotal < MinPurchase)
            return CouponEvaluation.Invalid($"Compra mínima de ${MinPurchase / 100m:N0} para usar este cupón.");

        var discount = Type switch
        {
            CouponType.Percentage => subtotal * Value / 100,
            CouponType.FixedAmount => Math.Min(Value, subtotal),
            _ => 0L,
        };
        return CouponEvaluation.Ok(discount, Type == CouponType.FreeShipping);
    }

    private static Result Validate(
        string? code, CouponType type, long value, long minPurchase,
        DateTime? startsAt, DateTime? endsAt, int? maxUses)
    {
        var trimmed = code?.Trim() ?? string.Empty;
        if (trimmed.Length is < 1 or > 50)
            return Result.Failure(Error.Validation("Coupon.InvalidCode", "El código debe tener entre 1 y 50 caracteres."));
        if (type == CouponType.Percentage && value is < 1 or > 100)
            return Result.Failure(Error.Validation("Coupon.InvalidPercentage", "El porcentaje debe estar entre 1 y 100."));
        if (type == CouponType.FixedAmount && value <= 0)
            return Result.Failure(Error.Validation("Coupon.InvalidAmount", "El monto del descuento debe ser mayor a 0."));
        if (minPurchase < 0)
            return Result.Failure(Error.Validation("Coupon.InvalidMinPurchase", "La compra mínima no puede ser negativa."));
        if (startsAt is { } s && endsAt is { } e && e < s)
            return Result.Failure(Error.Validation("Coupon.InvalidDates", "La fecha de fin no puede ser anterior a la de inicio."));
        if (maxUses is { } mu && mu <= 0)
            return Result.Failure(Error.Validation("Coupon.InvalidMaxUses", "El límite de usos debe ser mayor a 0."));
        return Result.Success();
    }

    private static string Normalize(string code) => code.Trim().ToUpperInvariant();
}

public sealed record CouponEvaluation(bool Valid, string? Error, long Discount, bool FreeShipping)
{
    public static CouponEvaluation Invalid(string error) => new(false, error, 0, false);
    public static CouponEvaluation Ok(long discount, bool freeShipping) => new(true, null, discount, freeShipping);
}
