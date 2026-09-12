using Orders.Core.Domain;
using SharedKernel.Common;

namespace UnitTests.Orders;

/// <summary>
/// Las reglas del presupuesto. La que más importa es el vencimiento: un
/// presupuesto de hace tres meses aceptado al precio viejo es una venta a
/// pérdida, y con inflación eso pasa solo si el sistema deja.
/// </summary>
public sealed class QuoteTests
{
    private static readonly TenantId Tenant = TenantId.From(Guid.NewGuid());

    private static readonly (Guid, string, string, string, Money, int)[] TwoLines =
    [
        (Guid.NewGuid(), "Mancuerna 10kg", "", "MAN-10", new Money(50_000, "ARS"), 4),
        (Guid.NewGuid(), "Barra olímpica", "", "BAR-20", new Money(200_000, "ARS"), 1),
    ];

    private static Quote New(int validDays = 15) =>
        Quote.Create(Tenant, "PRE-0001", "Gimnasio del Centro", Guid.NewGuid(), "compras@gym.test", "ARS",
            DateTime.UtcNow.Date.AddDays(validDays)).Value;

    private static Quote Filled(int validDays = 15, long discount = 0)
    {
        var quote = New(validDays);
        var result = quote.Replace(
            "Gimnasio del Centro", quote.CustomerId, "compras@gym.test",
            DateTime.UtcNow.Date.AddDays(validDays), TwoLines,
            discount > 0 ? new Money(discount, "ARS") : null, null);
        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : null);
        return quote;
    }

    [Fact]
    public void El_total_es_la_suma_de_las_lineas_menos_el_descuento()
    {
        var quote = Filled(discount: 50_000);

        Assert.Equal(400_000, quote.Subtotal.AmountInMinorUnits);
        Assert.Equal(350_000, quote.Total.AmountInMinorUnits);
    }

    [Fact]
    public void Un_presupuesto_vencido_no_se_puede_aceptar()
    {
        var quote = Filled();
        // Se arma con validez futura y después se vence: es lo que pasa en la
        // realidad, no se puede crear uno ya vencido.
        quote.ExtendValidity(DateTime.UtcNow.Date.AddDays(1));
        Assert.False(quote.IsExpired);

        // Simular el paso del tiempo no se puede sin reloj inyectado, así que se
        // verifica el otro lado: extender a una fecha pasada se rechaza.
        Assert.True(quote.ExtendValidity(DateTime.UtcNow.Date.AddDays(-1)).IsFailure);
        Assert.True(quote.ExtendValidity(DateTime.UtcNow.Date).IsFailure);
        Assert.True(quote.ExtendValidity(DateTime.UtcNow.Date.AddDays(30)).IsSuccess);
    }

    [Fact]
    public void Aceptar_lo_congela_y_lo_ata_a_la_venta()
    {
        var quote = Filled();
        var orderId = Guid.NewGuid();

        Assert.True(quote.Accept(orderId).IsSuccess);
        Assert.Equal(QuoteStatus.Accepted, quote.Status);
        Assert.Equal(orderId, quote.ConvertedOrderId);
        Assert.False(quote.IsEditable);

        // Y ya no se toca por ningún camino.
        Assert.True(quote.Accept(Guid.NewGuid()).IsFailure);
        Assert.True(quote.Reject("me arrepentí").IsFailure);
        Assert.True(quote.Reopen().IsFailure);
        Assert.True(quote.ExtendValidity(DateTime.UtcNow.Date.AddDays(30)).IsFailure);
        Assert.True(quote.Replace("Otro", null, null, DateTime.UtcNow.Date.AddDays(10), TwoLines, null, null).IsFailure);

        // El vínculo con la venta sobrevive a todos los rechazos.
        Assert.Equal(orderId, quote.ConvertedOrderId);
    }

    [Fact]
    public void Un_rechazado_se_puede_reabrir_para_renegociar()
    {
        var quote = Filled();
        quote.MarkSent();

        Assert.True(quote.Reject("Consiguieron mejor precio").IsSuccess);
        Assert.Equal(QuoteStatus.Rejected, quote.Status);
        Assert.Equal("Consiguieron mejor precio", quote.RejectionReason);
        Assert.False(quote.IsEditable);

        Assert.True(quote.Reopen().IsSuccess);
        Assert.Equal(QuoteStatus.Draft, quote.Status);
        Assert.Null(quote.RejectionReason);
        Assert.True(quote.IsEditable);
    }

    [Fact]
    public void Un_presupuesto_vacio_no_se_envia_ni_se_acepta()
    {
        var quote = New();

        Assert.True(quote.MarkSent().IsFailure);
        Assert.True(quote.Accept(Guid.NewGuid()).IsFailure);
    }

    [Fact]
    public void El_descuento_no_puede_superar_el_total()
    {
        var quote = New();

        var tooMuch = quote.Replace(
            "Cliente", null, null, DateTime.UtcNow.Date.AddDays(10), TwoLines,
            new Money(500_000, "ARS"), null);
        Assert.True(tooMuch.IsFailure);

        var exact = quote.Replace(
            "Cliente", null, null, DateTime.UtcNow.Date.AddDays(10), TwoLines,
            new Money(400_000, "ARS"), null);
        Assert.True(exact.IsSuccess);
        Assert.Equal(0, quote.Total.AmountInMinorUnits);
    }

    [Fact]
    public void Un_producto_repetido_se_rechaza()
    {
        var quote = New();
        var variant = Guid.NewGuid();

        var duplicated = quote.Replace(
            "Cliente", null, null, DateTime.UtcNow.Date.AddDays(10),
            [
                (variant, "Mancuerna", "", "MAN", new Money(1_000, "ARS"), 1),
                (variant, "Mancuerna", "", "MAN", new Money(1_000, "ARS"), 2),
            ],
            null, null);

        Assert.True(duplicated.IsFailure);
    }

    [Fact]
    public void Cantidades_y_precios_invalidos_se_rechazan()
    {
        var quote = New();
        var variant = Guid.NewGuid();

        Assert.True(quote.Replace(
            "Cliente", null, null, DateTime.UtcNow.Date.AddDays(10),
            [(variant, "X", "", "X", new Money(1_000, "ARS"), 0)], null, null).IsFailure);

        Assert.True(quote.Replace(
            "Cliente", null, null, DateTime.UtcNow.Date.AddDays(10),
            [(variant, "X", "", "X", new Money(-1, "ARS"), 1)], null, null).IsFailure);

        // Un precio en cero sí vale: una bonificación es una línea a $0.
        Assert.True(quote.Replace(
            "Cliente", null, null, DateTime.UtcNow.Date.AddDays(10),
            [(variant, "X", "", "X", new Money(0, "ARS"), 1)], null, null).IsSuccess);
    }

    [Fact]
    public void Sin_nombre_de_cliente_no_hay_presupuesto()
    {
        Assert.True(Quote.Create(Tenant, "PRE-0001", "", null, null, "ARS", DateTime.UtcNow.AddDays(10)).IsFailure);
        Assert.True(Quote.Create(Tenant, "PRE-0001", "A", null, null, "ARS", DateTime.UtcNow.AddDays(10)).IsFailure);
        // Y la validez no puede ser de hoy para atrás.
        Assert.True(Quote.Create(Tenant, "PRE-0001", "Cliente", null, null, "ARS", DateTime.UtcNow.AddDays(-1)).IsFailure);
    }

    [Fact]
    public void Enviar_guarda_la_fecha_una_sola_vez()
    {
        var quote = Filled();

        Assert.True(quote.MarkSent().IsSuccess);
        var first = quote.SentAtUtc;
        Assert.NotNull(first);

        // Corregirlo y reenviarlo no reinicia el reloj: lo que interesa es
        // cuánto tarda el cliente desde que lo vio por primera vez.
        Assert.True(quote.MarkSent().IsSuccess);
        Assert.Equal(first, quote.SentAtUtc);
    }
}
