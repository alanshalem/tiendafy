using Checkout.Core.Domain;
using SharedKernel.Common;

namespace UnitTests.Checkout;

public class CheckoutSessionTests
{
    private static readonly TenantId Tenant = TenantId.New();
    private static Money Ars(long cents) => new(cents, "ARS");

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
}
