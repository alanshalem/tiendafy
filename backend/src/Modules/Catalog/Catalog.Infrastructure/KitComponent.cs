namespace Catalog.Infrastructure;

/// <summary>
/// BOM liviano: la variante-kit (un producto vendible normal, ej. "Kit barra +
/// discos") descuenta stock de sus COMPONENTES al venderse. El stock del kit
/// sigue siendo propio (kits pre-armados); esto sincroniza el de las piezas.
/// </summary>
public sealed class KitComponent
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    /// <summary>Variante que se vende como kit.</summary>
    public Guid KitVariantId { get; private set; }

    /// <summary>Variante componente (de cualquier producto del catálogo).</summary>
    public Guid ComponentVariantId { get; private set; }

    /// <summary>Unidades del componente por cada kit vendido.</summary>
    public int Quantity { get; private set; }

    private KitComponent() { } // EF Core

    public KitComponent(Guid tenantId, Guid kitVariantId, Guid componentVariantId, int quantity)
    {
        Id = Guid.NewGuid();
        TenantId = tenantId;
        KitVariantId = kitVariantId;
        ComponentVariantId = componentVariantId;
        Quantity = quantity;
    }
}
