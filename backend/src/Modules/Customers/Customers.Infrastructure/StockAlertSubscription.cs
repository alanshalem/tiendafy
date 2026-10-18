namespace Customers.Infrastructure;

/// <summary>
/// "Avisame cuando ingrese": alguien dejó su email en una variante agotada.
///
/// <para>
/// Como el newsletter, no hace falta cuenta ni compra: es la demanda que el
/// botón muerto de "Sin stock" perdía. Se avisa UNA vez (cuando vuelve a haber
/// stock) y la fila queda como registro de la demanda que hubo; la tienda ve
/// en el panel cuánta gente espera cada producto.
/// </para>
/// </summary>
public sealed class StockAlertSubscription
{
    /// <summary>Tope de avisos pendientes por email y tienda: frena que un script llene la tabla.</summary>
    public const int MaxPendingPerEmail = 30;

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid ProductId { get; private set; }
    public Guid VariantId { get; private set; }

    /// <summary>Siempre en minúsculas: es la clave contra la que se deduplica.</summary>
    public string Email { get; private set; } = null!;

    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>Cuándo se le avisó. Con valor, la suscripción ya cumplió.</summary>
    public DateTime? NotifiedAtUtc { get; private set; }

    /// <summary>Se dio de baja desde el link del email (o el email está en la lista de bajas).</summary>
    public DateTime? CancelledAtUtc { get; private set; }

    private StockAlertSubscription() { } // EF Core

    public static StockAlertSubscription Create(Guid tenantId, Guid productId, Guid variantId, string email) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        ProductId = productId,
        VariantId = variantId,
        Email = email.Trim().ToLowerInvariant(),
        CreatedAtUtc = DateTime.UtcNow,
    };

    public void MarkNotified(DateTime whenUtc) => NotifiedAtUtc ??= whenUtc;

    public void Cancel(DateTime whenUtc) => CancelledAtUtc ??= whenUtc;
}
