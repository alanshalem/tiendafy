using Api.Auth;
using Microsoft.AspNetCore.DataProtection;

namespace Api.Orders;

/// <summary>A qué pedido de qué tienda abre el link.</summary>
public sealed record OrderTrackingPayload(Guid TenantId, Guid OrderId);

/// <summary>
/// El link de "Seguí tu pedido" que viaja en los mails: abre ESE pedido sin
/// pedir email ni número, porque quien lo tiene ya los tiene (está en su
/// casilla). Vence al año: un pedido viejo se sigue consultando con email y
/// número, y un link reenviado no queda abierto para siempre.
/// </summary>
public static class OrderTrackingToken
{
    // El purpose no se toca: cambiarlo invalida todos los links ya mandados.
    private static readonly SignedToken<OrderTrackingPayload> Token =
        new("Tiendafy.Orders.Tracking.v1", TimeSpan.FromDays(365));

    public static string Protect(IDataProtectionProvider dp, Guid tenantId, Guid orderId) =>
        Token.Protect(dp, new OrderTrackingPayload(tenantId, orderId));

    /// <summary>El pedido del link, solo si es de esta tienda.</summary>
    public static Guid? Unprotect(IDataProtectionProvider dp, string? token, Guid tenantId) =>
        string.IsNullOrWhiteSpace(token)
            ? null
            : Token.Unprotect(dp, token.Trim(), p => p.TenantId == tenantId && p.OrderId != Guid.Empty)?.OrderId;
}
