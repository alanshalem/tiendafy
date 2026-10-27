using System.Threading.RateLimiting;

namespace Api.Shop;

/// <summary>
/// Tope de mails de la cuenta del comprador por dirección y tienda (activación,
/// "ya tenés cuenta", cambio de contraseña, reenvío y la confirmación del
/// newsletter): 3 por hora de fábrica (<c>RateLimiting:AccountMailsPerEmailPerHour</c>).
///
/// <para>
/// Los cupos por IP no frenan a quien reparte los pedidos entre muchas IPs y
/// usa la tienda para llenarle la casilla a un tercero. Pasado el tope, el
/// endpoint contesta exactamente lo mismo y no manda nada: no dice si la
/// cuenta existe ni que se llegó al tope.
/// </para>
///
/// <para>
/// Vive en memoria (una instancia de la API, como el resto de los cupos): al
/// reiniciar vuelve a cero.
/// </para>
/// </summary>
public sealed class ShopperMailThrottle(IConfiguration configuration) : IDisposable
{
    private readonly PartitionedRateLimiter<string> _limiter = PartitionedRateLimiter.Create<string, string>(key =>
        RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = configuration.GetValue<int?>("RateLimiting:AccountMailsPerEmailPerHour") ?? 3,
            Window = TimeSpan.FromHours(1),
            QueueLimit = 0,
        }));

    /// <summary>¿Se puede mandar otro mail a esta dirección de esta tienda? Si sí, lo cuenta.</summary>
    public bool TryAcquire(Guid tenantId, string? email)
    {
        var normalized = ShopAuth.NormalizeEmail(email);
        if (normalized is null) return false;
        using var lease = _limiter.AttemptAcquire($"{tenantId:N}|{normalized}");
        return lease.IsAcquired;
    }

    public void Dispose() => _limiter.Dispose();
}
