namespace Discounts.Infrastructure;

/// <summary>
/// Un uso de cupón tomado por una compra. La fila es la constancia de que esa
/// compra (su sesión de checkout, que produce como mucho una venta) ya sumó al
/// <see cref="Coupon.UsedCount"/>: devolver el uso es borrarla y restar, y
/// cobrar la venta es asegurarse de que exista sin volver a sumar. Sin la fila
/// no se podría distinguir una venta que tomó el uso de una vieja, creada
/// cuando el uso se contaba recién al pagar.
/// </summary>
public sealed class CouponRedemption
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid CouponId { get; private set; }
    public Guid CheckoutSessionId { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private CouponRedemption() { } // EF Core
}
