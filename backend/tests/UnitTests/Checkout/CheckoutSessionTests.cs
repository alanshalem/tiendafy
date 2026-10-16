using Checkout.Core.Domain;
using SharedKernel.Common;
using static UnitTests.TestData;

namespace UnitTests.Checkout;

public class CheckoutSessionTests
{

    private static CheckoutSession CreateSession() =>
        CheckoutSession.Create(Tenant,
        [
            (Guid.NewGuid(), "Bowl", "Chico", "BOWL-CH", Ars(100_000), 2),
            (Guid.NewGuid(), "Taza", "Única", "TAZA-01", Ars(50_000), 1),
        ]).Value;

    [Fact]
    public void Create_ComputesSubtotal()
    {
        var session = CreateSession();

        Assert.Equal(250_000, session.Subtotal.AmountInMinorUnits); // 2×1000 + 1×500
        Assert.Equal(CheckoutStatus.Open, session.Status);
    }

    [Fact]
    public void Create_Empty_Fails()
    {
        var result = CheckoutSession.Create(Tenant, []);

        Assert.Equal("Checkout.Empty", result.Error.Code);
    }

    [Fact]
    public void Create_MixedCurrencies_Fails()
    {
        var result = CheckoutSession.Create(Tenant,
        [
            (Guid.NewGuid(), "A", "U", "A1", Ars(100), 1),
            (Guid.NewGuid(), "B", "U", "B1", new Money(100, "USD"), 1),
        ]);

        Assert.Equal("Checkout.MixedCurrencies", result.Error.Code);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(100)]
    public void Create_InvalidQuantity_Fails(int quantity)
    {
        var result = CheckoutSession.Create(Tenant,
            [(Guid.NewGuid(), "A", "U", "A1", Ars(100), quantity)]);

        Assert.Equal("Checkout.InvalidQuantity", result.Error.Code);
    }

    [Fact]
    public void MarkSubmitted_AttachesReservationsPerItem()
    {
        var session = CreateSession();
        var reservations = session.Items.ToDictionary(i => i.VariantId, _ => Guid.NewGuid());

        var result = session.MarkSubmitted("ana@mail.com", reservations, DateTime.UtcNow);

        Assert.True(result.IsSuccess);
        Assert.Equal(CheckoutStatus.Submitted, session.Status);
        Assert.All(session.Items, i => Assert.NotNull(i.ReservationId));
    }

    [Fact]
    public void MarkSubmitted_Expired_Fails()
    {
        var session = CreateSession();
        var reservations = session.Items.ToDictionary(i => i.VariantId, _ => Guid.NewGuid());

        var result = session.MarkSubmitted("ana@mail.com", reservations, DateTime.UtcNow.AddHours(1));

        Assert.Equal("Checkout.Expired", result.Error.Code);
    }

    [Fact]
    public void MarkSubmitted_InvalidEmail_Fails()
    {
        var session = CreateSession();
        var reservations = session.Items.ToDictionary(i => i.VariantId, _ => Guid.NewGuid());

        var result = session.MarkSubmitted("nope", reservations, DateTime.UtcNow);

        Assert.Equal("Checkout.InvalidEmail", result.Error.Code);
    }

    private static CheckoutSession Submitted(DateTime nowUtc)
    {
        var session = CreateSession();
        var reservations = session.Items.ToDictionary(i => i.VariantId, _ => Guid.NewGuid());
        Assert.True(session.MarkSubmitted("ana@mail.com", reservations, nowUtc).IsSuccess);
        return session;
    }

    /// <summary>
    /// Enviada, la sesión vive lo que viven sus reservas: el plazo arranca de
    /// nuevo al enviarla, no desde que se armó el carrito.
    /// </summary>
    [Fact]
    public void MarkSubmitted_ElPlazoArrancaAlEnviar()
    {
        var session = CreateSession();
        var later = session.CreatedAtUtc.AddMinutes(20);
        var reservations = session.Items.ToDictionary(i => i.VariantId, _ => Guid.NewGuid());

        session.MarkSubmitted("ana@mail.com", reservations, later);

        Assert.Equal(later + CheckoutSession.Ttl, session.ExpiresAtUtc);
        Assert.False(session.IsExpired(session.CreatedAtUtc.AddMinutes(31)));
    }

    [Fact]
    public void Expire_AbiertaConElPlazoCumplido_QuedaVencida()
    {
        var session = CreateSession();
        var due = session.ExpiresAtUtc;

        Assert.True(session.Expire(due).IsSuccess);
        Assert.Equal(CheckoutStatus.Expired, session.Status);
        // Vencida es vencida a cualquier hora: no "revive" mirando el reloj.
        Assert.True(session.IsExpired(session.CreatedAtUtc));
    }

    [Fact]
    public void Expire_EnviadaConElPlazoCumplido_QuedaVencida()
    {
        var session = Submitted(DateTime.UtcNow);

        Assert.True(session.Expire(session.ExpiresAtUtc.AddSeconds(1)).IsSuccess);
        Assert.Equal(CheckoutStatus.Expired, session.Status);
    }

    [Fact]
    public void Expire_AntesDelPlazo_NoHaceNada()
    {
        var session = CreateSession();

        var result = session.Expire(session.ExpiresAtUtc.AddSeconds(-1));

        Assert.Equal("Checkout.NotDue", result.Error.Code);
        Assert.Equal(CheckoutStatus.Open, session.Status);
    }

    [Fact]
    public void Expire_UnaCompraTerminada_NoCambia()
    {
        var session = Submitted(DateTime.UtcNow);
        Assert.True(session.Complete().IsSuccess);

        var result = session.Expire(session.ExpiresAtUtc.AddHours(1));

        Assert.Equal("Checkout.NotPending", result.Error.Code);
        Assert.Equal(CheckoutStatus.Completed, session.Status);
        Assert.False(session.IsExpired(session.ExpiresAtUtc.AddHours(1)));
    }

    [Fact]
    public void Complete_SoloDesdeEnviada()
    {
        Assert.Equal("Checkout.NotSubmitted", CreateSession().Complete().Error.Code);

        var expired = CreateSession();
        expired.Expire(expired.ExpiresAtUtc);
        Assert.True(expired.Complete().IsFailure);
        Assert.Equal(CheckoutStatus.Expired, expired.Status);
    }

    [Fact]
    public void MarkSubmitted_UnaVencida_PideEmpezarDeNuevo()
    {
        var session = CreateSession();
        session.Expire(session.ExpiresAtUtc);
        var reservations = session.Items.ToDictionary(i => i.VariantId, _ => Guid.NewGuid());

        var result = session.MarkSubmitted("ana@mail.com", reservations, session.CreatedAtUtc);

        Assert.True(result.IsFailure);
        Assert.Equal(CheckoutStatus.Expired, session.Status);
    }
}
