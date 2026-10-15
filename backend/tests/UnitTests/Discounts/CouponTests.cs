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

        coupon.RegisterUse();
        Assert.True(coupon.Evaluate(50_000, Now).Valid);

        coupon.RegisterUse();
        var ev = coupon.Evaluate(50_000, Now);
        Assert.False(ev.Valid);
        Assert.Contains("límite", ev.Error);
    }
}
