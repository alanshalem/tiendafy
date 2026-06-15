namespace Catalog.Contracts;

/// <summary>Snapshot de variante para armar un checkout: precio del momento.</summary>
public sealed record CheckoutVariantDto(
    Guid VariantId,
    Guid ProductId,
    string ProductName,
    string VariantDescription,
    string Sku,
    MoneyDto Price,
    bool ProductIsActive);

/// <summary>
/// Consulta que Checkout hace sobre el catálogo. Implementada en
/// Catalog.Infrastructure — Checkout solo conoce este contrato.
/// </summary>
public interface ICatalogCheckoutQuery
{
    Task<IReadOnlyList<CheckoutVariantDto>> GetVariantsAsync(
        Guid tenantId, IReadOnlyCollection<Guid> variantIds, CancellationToken ct = default);
}
