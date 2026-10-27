using Discounts.Infrastructure;

namespace UnitTests.Discounts;

/// <summary>
/// Reglas de los cupones. El caso "envío gratis" es el que más caro sale
/// equivocarse: no descuenta del producto (devuelve descuento 0) y avisa por
/// separado que el envío no se cobra — quien lo lea como "descuento 0 = cupón
/// que no hace nada" le termina cobrando el envío a un comprador al que le
/// prometió que era gratis.
/// </summary>
public class CouponTests
{
    private static readonly DateTime Now = new(2026, 8, 19, 12, 0, 0, DateTimeKind.Utc);

    private static Coupon Create(
        CouponType type, long value, long minPurchase = 0,
        DateTime? startsAt = null, DateTime? endsAt = null, int? maxUses = null, bool active = true) =>
        Coupon.Create(Guid.NewGuid(), "PROMO10", type, value, minPurchase, startsAt, endsAt, maxUses, active).Value;

    [Fact]
    public void Porcentaje_descuenta_sobre_el_subtotal()
    {
        var ev = Create(CouponType.Percentage, 10).Evaluate(50_000, Now);
        Assert.True(ev.Valid);
        Assert.Equal(5_000, ev.Discount);
        Assert.False(ev.FreeShipping);
    }

    [Fact]
    public void MontoFijo_nunca_descuenta_mas_que_la_compra()
    {
        var ev = Create(CouponType.FixedAmount, 80_000).Evaluate(50_000, Now);
        Assert.Equal(50_000, ev.Discount);
    }

    [Fact]
    public void EnvioGratis_no_toca_el_precio_pero_marca_el_envio()
    {
        var ev = Create(CouponType.FreeShipping, 0).Evaluate(50_000, Now);
        Assert.True(ev.Valid);
        Assert.Equal(0, ev.Discount);
        Assert.True(ev.FreeShipping);
    }

    [Fact]
    public void CompraMinima_rechaza_por_debajo_del_piso()
    {
        var ev = Create(CouponType.Percentage, 10, minPurchase: 60_000).Evaluate(50_000, Now);
        Assert.False(ev.Valid);
        Assert.Contains("mínima", ev.Error);
    }

    [Fact]
    public void CompraMinima_muestra_el_monto_con_punto_de_miles_aun_con_cultura_invariante()
    {
        var previous = System.Globalization.CultureInfo.CurrentCulture;
        System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.InvariantCulture;
        try
        {
            var ev = Create(CouponType.Percentage, 10, minPurchase: 1_500_000_00).Evaluate(50_000, Now);
            Assert.Equal("Compra mínima de $1.500.000 para usar este cupón.", ev.Error);
        }
        finally
        {
            System.Globalization.CultureInfo.CurrentCulture = previous;
        }
    }

    [Fact]
    public void Vencido_no_se_puede_usar()
    {
        var ev = Create(CouponType.Percentage, 10, endsAt: Now.AddDays(-1)).Evaluate(50_000, Now);
        Assert.False(ev.Valid);
    }

    [Fact]
    public void Todavia_no_vigente_no_se_puede_usar()
    {
        var ev = Create(CouponType.Percentage, 10, startsAt: Now.AddDays(1)).Evaluate(50_000, Now);
        Assert.False(ev.Valid);
    }

    [Fact]
    public void Inactivo_no_se_puede_usar()
    {
        var ev = Create(CouponType.Percentage, 10, active: false).Evaluate(50_000, Now);
        Assert.False(ev.Valid);
    }

    [Fact]
    public void El_limite_de_usos_corta_cuando_se_alcanza()
    {
        var coupon = Create(CouponType.Percentage, 10, maxUses: 2);
        Assert.True(coupon.Evaluate(50_000, Now).Valid);

        SetUsedCount(coupon, 1);
        Assert.True(coupon.Evaluate(50_000, Now).Valid);

        SetUsedCount(coupon, 2);
        var ev = coupon.Evaluate(50_000, Now);
        Assert.False(ev.Valid);
        Assert.True(ev.LimitReached);
        Assert.Contains("límite", ev.Error);
    }

    /// <summary>
    /// La compra que ya tomó el último uso no se lo choca a sí misma: su doble
    /// clic se evalúa sin el límite (el uso que lo llena es el suyo).
    /// </summary>
    [Fact]
    public void El_uso_ya_tomado_por_la_compra_no_cuenta_contra_ella()
    {
        var coupon = Create(CouponType.Percentage, 10, maxUses: 1);
        SetUsedCount(coupon, 1);

        Assert.False(coupon.Evaluate(50_000, Now).Valid);
        var mine = coupon.Evaluate(50_000, Now, useAlreadyTaken: true);
        Assert.True(mine.Valid);
        Assert.Equal(5_000, mine.Discount);
    }

    // Los usos los suma la base (CouponRedemptions, con un UPDATE condicional),
    // no la entidad: acá se fija el contador como lo dejaría ella.
    private static void SetUsedCount(Coupon coupon, int used) =>
        typeof(Coupon).GetProperty(nameof(Coupon.UsedCount))!.SetValue(coupon, used);
}
