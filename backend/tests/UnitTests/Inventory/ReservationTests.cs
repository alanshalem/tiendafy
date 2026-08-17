using Inventory.Core.Domain;
using SharedKernel.Common;
using static UnitTests.TestData;

namespace UnitTests.Inventory;

public class ReservationTests
{

    private static Reservation Create(TimeSpan? ttl = null) =>
        new(Tenant, Guid.NewGuid(), 2, ttl);

    [Fact]
    public void New_IsActiveWithDefaultTtl()
    {
        var reservation = Create();

        Assert.Equal(ReservationStatus.Active, reservation.Status);
        Assert.True(reservation.ExpiresAtUtc > DateTime.UtcNow.AddMinutes(25));
    }

    [Fact]
    public void Confirm_BeforeExpiry_Succeeds()
    {
        var reservation = Create();

        var result = reservation.Confirm(DateTime.UtcNow);

        Assert.True(result.IsSuccess);
        Assert.Equal(ReservationStatus.Confirmed, reservation.Status);
    }

    [Fact]
    public void Confirm_AfterExpiry_Fails()
    {
        var reservation = Create(TimeSpan.FromMinutes(1));

        var result = reservation.Confirm(DateTime.UtcNow.AddMinutes(5));

        Assert.Equal("Reservation.Expired", result.Error.Code);
        Assert.Equal(ReservationStatus.Active, reservation.Status);
    }

    [Fact]
    public void Confirm_Twice_Fails()
    {
        var reservation = Create();
        reservation.Confirm(DateTime.UtcNow);

        var result = reservation.Confirm(DateTime.UtcNow);

        Assert.Equal("Reservation.NotActive", result.Error.Code);
    }

    [Fact]
    public void Release_Active_Succeeds()
    {
        var reservation = Create();

        Assert.True(reservation.Release().IsSuccess);
        Assert.Equal(ReservationStatus.Released, reservation.Status);
    }

    [Fact]
    public void Release_Confirmed_Fails()
    {
        var reservation = Create();
        reservation.Confirm(DateTime.UtcNow);

        var result = reservation.Release();

        Assert.Equal("Reservation.NotActive", result.Error.Code);
    }

    [Fact]
    public void IsExpired_RespectsStatusAndClock()
    {
        var reservation = Create(TimeSpan.FromMinutes(1));

        Assert.False(reservation.IsExpired(DateTime.UtcNow));
        Assert.True(reservation.IsExpired(DateTime.UtcNow.AddMinutes(2)));

        reservation.Release();
        Assert.False(reservation.IsExpired(DateTime.UtcNow.AddMinutes(2))); // liberada ya no expira
    }
}
