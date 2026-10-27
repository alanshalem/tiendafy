using Microsoft.EntityFrameworkCore;

namespace Discounts.Infrastructure;

/// <summary>Cómo terminó el pedido de tomar un uso del cupón para una compra.</summary>
public enum CouponReservation
{
    /// <summary>Se tomó ahora: si la venta no llega a nacer, hay que devolverlo.</summary>
    Taken,
    /// <summary>Esa compra ya lo tenía (doble clic, reintento): no se volvió a sumar.</summary>
    AlreadyHeld,
    /// <summary>El cupón llegó a su límite de usos.</summary>
    Exhausted,
}

/// <summary>
/// Los usos de los cupones, contados sin carreras. El límite "máximo N usos"
/// se cumple con un UPDATE condicional (sumar solo si todavía hay lugar), no
/// leyendo el contador y sumando después: dos compras que llegan juntas sobre
/// el último uso no pueden tomarlo las dos. Cada uso queda atado a la compra
/// que lo tomó (<see cref="CouponRedemption"/>), así devolverlo o confirmarlo
/// es idempotente.
/// </summary>
public sealed class CouponRedemptions(DiscountsDbContext db)
{
    /// <summary>Si esa compra ya tiene tomado un uso de ese cupón.</summary>
    public Task<bool> IsHeldAsync(Guid tenantId, Guid couponId, Guid checkoutSessionId, CancellationToken ct) =>
        db.CouponRedemptions.AsNoTracking().AnyAsync(r =>
            r.TenantId == tenantId && r.CouponId == couponId && r.CheckoutSessionId == checkoutSessionId, ct);

    /// <summary>
    /// Toma un uso del cupón para la compra, si queda alguno. Suma y deja la
    /// constancia en la misma transacción: o pasan las dos cosas o ninguna.
    /// </summary>
    public async Task<CouponReservation> ReserveAsync(
        Guid tenantId, Guid couponId, Guid checkoutSessionId, CancellationToken ct)
    {
        if (await HeldBySessionAsync(tenantId, checkoutSessionId, ct)) return CouponReservation.AlreadyHeld;

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Postgres reevalúa el WHERE sobre la fila ya actualizada por quien
        // tenía el lock: la segunda compra sobre el último uso ve el contador
        // nuevo y no suma.
        var taken = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE coupons SET used_count = used_count + 1
            WHERE id = {couponId} AND tenant_id = {tenantId}
              AND (max_uses IS NULL OR used_count < max_uses)
            """, ct);
        if (taken == 0)
        {
            await tx.RollbackAsync(ct);
            // Agotado… salvo que el uso que falta sea el de esta misma compra,
            // tomado por otro pedido suyo en el mismo instante.
            return await HeldBySessionAsync(tenantId, checkoutSessionId, ct)
                ? CouponReservation.AlreadyHeld
                : CouponReservation.Exhausted;
        }

        var recorded = await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO coupon_redemptions (id, tenant_id, coupon_id, checkout_session_id, created_at_utc)
            VALUES ({Guid.NewGuid()}, {tenantId}, {couponId}, {checkoutSessionId}, {DateTime.UtcNow})
            ON CONFLICT (tenant_id, checkout_session_id) DO NOTHING
            """, ct);
        if (recorded == 0)
        {
            // Otro pedido de la misma compra lo tomó primero: se deshace la suma.
            await tx.RollbackAsync(ct);
            return CouponReservation.AlreadyHeld;
        }

        await tx.CommitAsync(ct);
        return CouponReservation.Taken;
    }

    /// <summary>
    /// Devuelve el uso que tenía tomado la compra (la venta se canceló, venció
    /// o se rechazó sin cobrarse). Sin uso tomado no hace nada: devolver dos
    /// veces, o devolver el de una venta vieja que nunca lo tomó, no resta.
    /// </summary>
    public Task<int> ReleaseAsync(Guid tenantId, Guid checkoutSessionId, CancellationToken ct) =>
        db.Database.ExecuteSqlInterpolatedAsync($"""
            WITH released AS (
                DELETE FROM coupon_redemptions
                WHERE tenant_id = {tenantId} AND checkout_session_id = {checkoutSessionId}
                RETURNING coupon_id)
            UPDATE coupons c SET used_count = GREATEST(c.used_count - 1, 0)
            FROM released r
            WHERE c.id = r.coupon_id AND c.tenant_id = {tenantId}
            """, ct);

    /// <summary>
    /// La venta se cobró: su uso tiene que estar contado, una sola vez. Lo
    /// normal es que ya lo esté (se tomó al crearla); suma solo si no lo
    /// estaba — una venta creada antes de que el uso se tomara al crearla, o
    /// una rechazada que devolvió el uso y después entró un pago aprobado. Ya
    /// cobrada, se cuenta aunque pase el límite: la plata entró.
    /// </summary>
    public Task<int> CountPaidAsync(Guid tenantId, string couponCode, Guid checkoutSessionId, CancellationToken ct)
    {
        var code = couponCode.Trim().ToUpperInvariant();
        return db.Database.ExecuteSqlInterpolatedAsync($"""
            WITH counted AS (
                INSERT INTO coupon_redemptions (id, tenant_id, coupon_id, checkout_session_id, created_at_utc)
                SELECT {Guid.NewGuid()}, c.tenant_id, c.id, {checkoutSessionId}, {DateTime.UtcNow}
                FROM coupons c WHERE c.tenant_id = {tenantId} AND c.code = {code}
                ON CONFLICT (tenant_id, checkout_session_id) DO NOTHING
                RETURNING coupon_id)
            UPDATE coupons c SET used_count = c.used_count + 1
            FROM counted n
            WHERE c.id = n.coupon_id
            """, ct);
    }

    private Task<bool> HeldBySessionAsync(Guid tenantId, Guid checkoutSessionId, CancellationToken ct) =>
        db.CouponRedemptions.AsNoTracking().AnyAsync(r =>
            r.TenantId == tenantId && r.CheckoutSessionId == checkoutSessionId, ct);
}
