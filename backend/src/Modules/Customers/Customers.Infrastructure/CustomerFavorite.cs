namespace Customers.Infrastructure;

/// <summary>
/// Producto marcado como favorito por un comprador logueado.
///
/// Guarda además lo último que vio de ese producto (precio y si estaba sin
/// stock) para poder avisarle cuando algo cambia: el corazón es la señal de
/// intención de compra más fuerte que tiene la tienda, y hasta que existió
/// esto no hacía absolutamente nada.
/// </summary>
public sealed class CustomerFavorite
{
    public Guid Id { get; private set; }
    public Guid CustomerId { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid ProductId { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>Precio de referencia (centavos) contra el que se compara una baja.</summary>
    public long? WatchedPriceMinor { get; private set; }

    /// <summary>La última vez que se miró, el producto no tenía stock.</summary>
    public bool WasOutOfStock { get; private set; }

    /// <summary>Último aviso enviado por este favorito (antispam).</summary>
    public DateTime? LastAlertAtUtc { get; private set; }

    private CustomerFavorite() { } // EF Core

    public static CustomerFavorite Create(Guid customerId, Guid tenantId, Guid productId) => new()
    {
        Id = Guid.NewGuid(),
        CustomerId = customerId,
        TenantId = tenantId,
        ProductId = productId,
        CreatedAtUtc = DateTime.UtcNow,
    };

    /// <summary>Deja registrado lo que se ve hoy, sin avisar (la primera pasada y después de cada aviso).</summary>
    public void Watch(long priceMinor, bool outOfStock)
    {
        WatchedPriceMinor = priceMinor;
        WasOutOfStock = outOfStock;
    }

    public void MarkAlerted(DateTime whenUtc) => LastAlertAtUtc = whenUtc;

    /// <summary>
    /// ¿Corresponde avisar que bajó? Se pide una baja de al menos 5 % para no
    /// escribirle a alguien por un redondeo, y un día entre avisos para que una
    /// promo que sube y baja no se transforme en una cadena de mails.
    /// </summary>
    public bool ShouldAlertPriceDrop(long currentMinor, DateTime nowUtc) =>
        WatchedPriceMinor is { } watched
        && watched > 0
        && currentMinor > 0
        && currentMinor <= (long)(watched * 0.95m)
        && NotAlertedRecently(nowUtc);

    /// <summary>¿Corresponde avisar que volvió? Solo si la vez anterior estaba agotado.</summary>
    public bool ShouldAlertBackInStock(bool available, DateTime nowUtc) =>
        WasOutOfStock && available && NotAlertedRecently(nowUtc);

    private bool NotAlertedRecently(DateTime nowUtc) =>
        LastAlertAtUtc is not { } last || last <= nowUtc.AddDays(-1);
}
