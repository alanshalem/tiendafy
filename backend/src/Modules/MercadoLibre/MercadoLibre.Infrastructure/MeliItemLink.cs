using SharedKernel.Common;

namespace MercadoLibre.Infrastructure;

/// <summary>
/// Vínculo entre una publicación de Mercado Libre (item + variación opcional)
/// y una variante del catálogo Tiendafy. Es la base del stock unificado:
/// una venta en ML descuenta stock local, y el worker empuja el stock local
/// a ML cuando cambia (LastPushedQty evita PUTs redundantes).
/// </summary>
public sealed class MeliItemLink
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    /// <summary>Id de la publicación en ML (ej: MLA123456789).</summary>
    public string MeliItemId { get; private set; } = string.Empty;

    /// <summary>Variación de la publicación (null = publicación sin variaciones).</summary>
    public long? MeliVariationId { get; private set; }

    public Guid ProductId { get; private set; }
    public Guid VariantId { get; private set; }

    /// <summary>Snapshot del título para listar sin ir a la API.</summary>
    public string MeliTitle { get; private set; } = string.Empty;

    public bool SyncStock { get; private set; } = true;

    /// <summary>Empujar el precio local a esta publicación (con el recargo de la conexión).</summary>
    public bool SyncPrice { get; private set; } = true;

    /// <summary>Último stock empujado a ML (null = nunca se empujó).</summary>
    public int? LastPushedQty { get; private set; }

    /// <summary>Último precio empujado (centavos): evita PUTear lo que ya está publicado.</summary>
    public long? LastPushedPriceMinor { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    private MeliItemLink() { } // EF Core

    public static Result<MeliItemLink> Create(
        Guid tenantId, string meliItemId, long? meliVariationId,
        Guid productId, Guid variantId, string meliTitle)
    {
        if (string.IsNullOrWhiteSpace(meliItemId))
            return Result.Failure<MeliItemLink>(Error.Validation("Meli.Item", "Id de publicación requerido."));
        if (productId == Guid.Empty || variantId == Guid.Empty)
            return Result.Failure<MeliItemLink>(Error.Validation("Meli.Variant", "Producto y variante requeridos."));

        return Result.Success<MeliItemLink>(new MeliItemLink
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            MeliItemId = meliItemId.Trim().ToUpperInvariant(),
            MeliVariationId = meliVariationId,
            ProductId = productId,
            VariantId = variantId,
            MeliTitle = meliTitle.Length > 200 ? meliTitle[..200] : meliTitle,
            CreatedAtUtc = DateTime.UtcNow,
        });
    }

    public void SetSyncStock(bool enabled) => SyncStock = enabled;

    public void SetSyncPrice(bool enabled) => SyncPrice = enabled;

    public void MarkPushed(int qty) => LastPushedQty = qty;

    public void MarkPricePushed(long priceMinor) => LastPushedPriceMinor = priceMinor;
}
