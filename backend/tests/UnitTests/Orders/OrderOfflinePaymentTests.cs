using Checkout.Core.Domain;
using Orders.Core.Domain;
using SharedKernel.Common;
using static UnitTests.TestData;

namespace UnitTests.Orders;

/// <summary>
/// Cómo se combinan el cupón, el descuento por transferencia y el envío, y la
/// regla "envío gratis desde $X" de un medio de envío.
/// </summary>
public class OrderOfflinePaymentTests
{
    private static Order NewOrder(long unitPriceMinor, int quantity = 1, long couponMinor = 0, long shippingMinor = 0)
    {
        var order = Order.Create(
            Tenant, Guid.NewGuid(), "buyer@test.com", "ARS",
            [(Guid.NewGuid(), "Producto", "", "SKU-1", Ars(unitPriceMinor), quantity, null, null)],
            couponMinor > 0 ? Ars(couponMinor) : null).Value;
        order.SetShippingAndBuyer(Ars(shippingMinor), "Moto", "Calle 1", null, null, null, null);
        return order;
    }

    [Fact]
    public void Sin_cupon_el_total_es_el_precio_con_transferencia_mas_el_envio()
    {
        var order = NewOrder(10_000_00, quantity: 2, shippingMinor: 1_500_00);

        Assert.True(order.UseOfflinePayment("transfer", 10, DateTime.UtcNow.AddHours(48)).IsSuccess);

        Assert.Equal(2_000_00, order.PaymentMethodDiscount.AmountInMinorUnits);
        Assert.Equal(19_500_00, order.Total.AmountInMinorUnits); // 18.000 + 1.500 de envío sin descontar
        Assert.Equal(0, order.CouponDiscount.AmountInMinorUnits);
        Assert.True(order.IsOfflinePayment);
    }

    [Fact]
    public void El_descuento_por_transferencia_va_sobre_lo_que_queda_despues_del_cupon()
    {
        var order = NewOrder(20_000_00, couponMinor: 2_000_00);

        order.UseOfflinePayment("transfer", 10, DateTime.UtcNow.AddHours(1));

        Assert.Equal(1_800_00, order.PaymentMethodDiscount.AmountInMinorUnits); // 10% de 18.000, no de 20.000
        Assert.Equal(2_000_00, order.CouponDiscount.AmountInMinorUnits);
        Assert.Equal(16_200_00, order.Total.AmountInMinorUnits);
    }

    [Fact]
    public void Redondea_al_centavo_con_el_medio_para_arriba()
    {
        Assert.Equal(5, Order.PercentOf(45, 10)); // 4,5 → 5
        Assert.Equal(0, Order.PercentOf(0, 10));
        Assert.Equal(0, Order.PercentOf(1000, 0));
    }

    [Fact]
    public void Solo_una_orden_pendiente_cambia_a_pago_fuera_de_pasarela()
    {
        var order = NewOrder(10_000);
        order.MarkPaid("mp-1");

        Assert.True(order.UseOfflinePayment("transfer", 10, DateTime.UtcNow).IsFailure);
        Assert.True(NewOrder(10_000).UseOfflinePayment("bitcoin", 10, DateTime.UtcNow).IsFailure);
    }

    [Fact]
    public void Cancelar_es_solo_para_las_que_no_se_pagaron()
    {
        var pending = NewOrder(10_000);
        Assert.True(pending.CancelUnpaid().IsSuccess);
        Assert.Equal(OrderStatus.Cancelled, pending.Status);
        Assert.True(pending.CancelUnpaid().IsSuccess); // idempotente

        var paid = NewOrder(10_000);
        paid.MarkPaid("manual-transfer");
        Assert.True(paid.CancelUnpaid().IsFailure);
    }

    [Fact]
    public void El_envio_es_gratis_desde_el_umbral_del_medio()
    {
        var method = ShippingMethod.Create(Tenant, "Moto", ShippingKind.Delivery, Ars(2_000_00),
            null, null, 0, freeAbove: Ars(50_000_00)).Value;

        Assert.Equal(2_000_00, method.PriceFor(Ars(49_999_99)).AmountInMinorUnits);
        Assert.Equal(0, method.PriceFor(Ars(50_000_00)).AmountInMinorUnits);
    }

    [Fact]
    public void Un_umbral_vacio_o_en_un_envio_gratis_no_se_guarda()
    {
        var zero = ShippingMethod.Create(Tenant, "Moto", ShippingKind.Delivery, Ars(2_000_00),
            null, null, 0, freeAbove: Ars(0)).Value;
        var free = ShippingMethod.Create(Tenant, "Retiro", ShippingKind.Pickup, Ars(0),
            null, "Local", 0, freeAbove: Ars(10_000_00)).Value;

        Assert.Null(zero.FreeAbove);
        Assert.Null(free.FreeAbove);
        Assert.True(ShippingMethod.Create(Tenant, "Moto", ShippingKind.Delivery, Ars(2_000_00),
            null, null, 0, freeAbove: Ars(-1)).IsFailure);
    }

    [Fact]
    public void El_efectivo_solo_se_ofrece_para_retirar()
    {
        var options = StorePaymentOptions.CreateDefault(Tenant);
        Assert.True(options.Update(new StorePaymentOptions.Input(
            true, 10, "Banco", "Titular", null, null, "MI.ALIAS", null, 48, true, 0, null)).IsSuccess);

        Assert.True(options.Offers(OfflinePaymentMethod.Transfer, isPickup: false));
        Assert.True(options.Offers(OfflinePaymentMethod.Cash, isPickup: true));
        Assert.False(options.Offers(OfflinePaymentMethod.Cash, isPickup: false));
    }
}
