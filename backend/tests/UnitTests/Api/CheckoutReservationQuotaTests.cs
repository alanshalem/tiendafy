using System.Net;
using Api.Shop;
using Microsoft.AspNetCore.Http;

namespace UnitTests.Api;

/// <summary>
/// El tope de compras con stock reservado a la vez por cliente. Sin él, un
/// script con pocas IP reservaba todo el stock de una variante (hasta 99
/// unidades por línea, media hora cada compra) sin pagar nunca.
/// </summary>
public sealed class CheckoutReservationQuotaTests
{
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = new(2026, 10, 27, 12, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private static readonly IReadOnlyList<IPNetwork> Internal = [IPNetwork.Parse("172.16.0.0/12")];

    [Fact]
    public void La_sexta_compra_con_reserva_viva_no_entra_hasta_que_vence_una()
    {
        var clock = new Clock();
        var quota = new CheckoutReservationQuota(5, Internal, clock);
        var until = clock.Now.UtcDateTime.AddMinutes(30);

        for (var i = 0; i < 5; i++)
            Assert.True(quota.TryTake("200.45.10.1", Guid.NewGuid(), until.AddMinutes(i), out _));

        Assert.False(quota.TryTake("200.45.10.1", Guid.NewGuid(), until, out var retryAfter));
        Assert.Equal(TimeSpan.FromMinutes(30), retryAfter); // cuando vence la primera

        // Otro cliente tiene su propio tope.
        Assert.True(quota.TryTake("181.1.2.3", Guid.NewGuid(), until, out _));

        // Vence la primera: hay lugar para una más, no para dos.
        clock.Now = clock.Now.AddMinutes(30);
        Assert.True(quota.TryTake("200.45.10.1", Guid.NewGuid(), until.AddMinutes(60), out _));
        Assert.False(quota.TryTake("200.45.10.1", Guid.NewGuid(), until.AddMinutes(60), out _));
    }

    [Fact]
    public void La_misma_compra_no_ocupa_dos_lugares_y_la_que_no_reservo_lo_devuelve()
    {
        var clock = new Clock();
        var quota = new CheckoutReservationQuota(2, Internal, clock);
        var until = clock.Now.UtcDateTime.AddMinutes(30);
        var compra = Guid.NewGuid();

        Assert.True(quota.TryTake("c", compra, until, out _));
        Assert.True(quota.TryTake("c", compra, until, out _)); // reintento: la misma
        var otra = Guid.NewGuid();
        Assert.True(quota.TryTake("c", otra, until, out _));
        Assert.False(quota.TryTake("c", Guid.NewGuid(), until, out _));

        quota.Release("c", otra); // no llegó a reservar
        Assert.True(quota.TryTake("c", Guid.NewGuid(), until, out _));
    }

    [Theory]
    [InlineData("172.18.0.5", null)]                    // el storefront por la red interna
    [InlineData("200.45.10.1", "200.45.10.1")]
    [InlineData("2001:db8:1:2::7", "2001:db8:1:2::/64")] // IPv6: su /64
    public void Se_cuenta_por_cliente_y_la_red_interna_no_tiene_tope(string ip, string? expected)
    {
        var http = new DefaultHttpContext();
        http.Connection.RemoteIpAddress = IPAddress.Parse(ip);
        Assert.Equal(expected, new CheckoutReservationQuota(5, Internal, new Clock()).ClientOf(http));
    }
}
