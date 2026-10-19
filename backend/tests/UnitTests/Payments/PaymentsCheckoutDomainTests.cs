using Checkout.Core.Domain;
using Payments.Core.Domain;
using SharedKernel.Common;
using static UnitTests.TestData;

namespace UnitTests.Payments;

/// <summary>Dominio de pagos y envíos: la conexión MP del merchant (cómo cobra)
/// y los medios de envío (cómo entrega). Y Money, que es donde vive la plata.</summary>
public class PaymentsCheckoutDomainTests
{

    // ---- MercadoPagoConnection ----

    private static MercadoPagoConnection Conexion() =>
        MercadoPagoConnection.Create(Tenant, 123456, "at-cifrado", "rt-cifrado", "PUB-KEY", "offline_access read", DateTime.UtcNow.AddDays(180));

    [Fact]
    public void Conexion_nueva_arranca_en_Pro_sin_fee()
    {
        var c = Conexion();
        Assert.Equal(MercadoPagoCheckoutMode.Pro, c.CheckoutMode);
        Assert.Equal(0m, c.MarketplaceFeePercent);
        Assert.Equal("PUB-KEY", c.PublicKey);
    }

    [Fact]
    public void UpdateTokens_conserva_la_public_key_si_el_refresh_no_trae_una()
    {
        var c = Conexion();
        c.UpdateTokens(123456, "at2", "rt2", publicKey: null, "scope", DateTime.UtcNow.AddDays(180));
        Assert.Equal("PUB-KEY", c.PublicKey); // el refresh de MP no siempre devuelve public_key
        Assert.Equal("at2", c.AccessTokenEncrypted);

        c.UpdateTokens(123456, "at3", "rt3", "PUB-KEY-2", "scope", DateTime.UtcNow.AddDays(180));
        Assert.Equal("PUB-KEY-2", c.PublicKey);
    }

    [Theory]
    [InlineData(-5, 0)]    // negativo → 0
    [InlineData(3.5, 3.5)] // normal
    [InlineData(150, 100)] // techo 100
    public void SetMarketplaceFee_clampa_entre_0_y_100(double input, double expected)
    {
        var c = Conexion();
        c.SetMarketplaceFee((decimal)input);
        Assert.Equal((decimal)expected, c.MarketplaceFeePercent);
    }

    [Fact]
    public void StatementDescriptor_hasta_13_y_vacio_es_null()
    {
        var c = Conexion();
        Assert.True(c.SetStatementDescriptor("  MI MARCA SRL  ").IsSuccess); // 12 con el trim
        Assert.Equal("MI MARCA SRL", c.StatementDescriptor);
        Assert.True(c.SetStatementDescriptor("1234567890123").IsSuccess); // 13: el límite de la guía de Checkout Pro

        // Más largo: error, y queda el que estaba (no se recorta a escondidas).
        var tooLong = c.SetStatementDescriptor("MI TIENDA ONLINE");
        Assert.True(tooLong.IsFailure);
        Assert.Equal("MercadoPago.StatementDescriptorTooLong", tooLong.Error.Code);
        Assert.Equal("1234567890123", c.StatementDescriptor);

        Assert.True(c.SetStatementDescriptor("   ").IsSuccess);
        Assert.Null(c.StatementDescriptor);
        Assert.Null(c.StatementDescriptorToSend);
    }

    [Fact]
    public void Un_descriptor_de_antes_de_22_se_puede_volver_a_guardar_y_se_manda_recortado()
    {
        // Lo que dejó guardado el límite viejo (22), cargado como lo cargaría EF.
        var c = Conexion();
        typeof(MercadoPagoConnection).GetProperty(nameof(MercadoPagoConnection.StatementDescriptor))!
            .SetValue(c, "MI TIENDA DE ROPA SRL");

        // Guardar las preferencias sin tocarlo no falla: el comercio puede
        // cambiar el modo de cobro sin que le exijan acortar el nombre antes.
        Assert.True(c.SetStatementDescriptor("MI TIENDA DE ROPA SRL").IsSuccess);
        // Y a Mercado Pago nunca le llega más de 13 (sin el espacio del corte).
        Assert.Equal("MI TIENDA DE", c.StatementDescriptorToSend);
        Assert.Equal("MI TIENDA DE ROPA SRL", c.StatementDescriptor);
    }

    // ---- ShippingMethod ----

    [Fact]
    public void Envio_valido_se_crea_activo_con_trim()
    {
        var r = ShippingMethod.Create(Tenant, "  Correo a domicilio  ", ShippingKind.Delivery,
            new Money(150000, "ARS"), "Llega en 3-5 días", null, sortOrder: 1);
        Assert.True(r.IsSuccess);
        Assert.Equal("Correo a domicilio", r.Value.Name);
        Assert.True(r.Value.Active);
        Assert.Null(r.Value.PickupAddress);
    }

    [Theory]
    [InlineData("a")]  // muy corto
    [InlineData("")]   // vacío
    public void Envio_con_nombre_invalido_falla(string nombre)
    {
        var r = ShippingMethod.Create(Tenant, nombre, ShippingKind.Pickup, Money.Zero("ARS"), null, "Av. X 123", 0);
        Assert.False(r.IsSuccess);
        Assert.Equal("Shipping.InvalidName", r.Error.Code);
    }

    [Fact]
    public void Envio_con_precio_negativo_falla_y_Update_valida_igual()
    {
        var negativo = ShippingMethod.Create(Tenant, "Envío", ShippingKind.Delivery, new Money(-1, "ARS"), null, null, 0);
        Assert.Equal("Shipping.InvalidPrice", negativo.Error.Code);

        var m = ShippingMethod.Create(Tenant, "Envío", ShippingKind.Delivery, Money.Zero("ARS"), null, null, 0).Value;
        var upd = m.Update("Retiro", ShippingKind.Pickup, Money.Zero("ARS"), "  L a V 9-18  ", "  Av. Corrientes 1234  ", active: false, sortOrder: 2);
        Assert.True(upd.IsSuccess);
        Assert.Equal(ShippingKind.Pickup, m.Kind);
        Assert.Equal("Av. Corrientes 1234", m.PickupAddress);
        Assert.False(m.Active);

        var updMalo = m.Update("x", ShippingKind.Pickup, Money.Zero("ARS"), null, null, true, 0);
        Assert.False(updMalo.IsSuccess);
        Assert.Equal("Retiro", m.Name); // el update inválido no tocó nada
    }

    // ---- Money ----

    [Fact]
    public void Money_FromDecimal_redondea_bancario_y_convierte_ida_y_vuelta()
    {
        Assert.Equal(1050, Money.FromDecimal(10.505m, "ARS").AmountInMinorUnits); // to-even
        Assert.Equal(1052, Money.FromDecimal(10.515m, "ARS").AmountInMinorUnits);
        Assert.Equal(10.50m, new Money(1050, "ARS").ToDecimal());
    }

    [Fact]
    public void Money_opera_y_compara_en_la_misma_moneda()
    {
        var a = new Money(1000, "ARS");
        var b = new Money(250, "ARS");
        Assert.Equal(1250, (a + b).AmountInMinorUnits);
        Assert.Equal(750, (a - b).AmountInMinorUnits);
        Assert.Equal(3000, (a * 3).AmountInMinorUnits);
        Assert.True(b < a);
        Assert.True(a >= b);
        Assert.True(new Money(-1, "ARS").IsNegative);
        Assert.True(Money.Zero("ARS").IsZero);
        Assert.Matches(@"^10[.,]00 ARS$", new Money(1000, "ARS").ToString()); // separador según cultura
    }

    [Fact]
    public void Money_entre_monedas_distintas_explota()
    {
        var pesos = new Money(100, "ARS");
        var dolares = new Money(100, "USD");
        Assert.Throws<InvalidOperationException>(() => pesos + dolares);
        Assert.Throws<InvalidOperationException>(() => pesos < dolares);
    }
}
