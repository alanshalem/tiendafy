namespace Catalog.Contracts;

/// <summary>
/// Snapshot de variante para armar un checkout: precio del momento. Cost es el
/// costo del merchant y NUNCA llega al browser: este DTO solo circula entre
/// módulos del backend (checkout → orden) para el snapshot de rentabilidad.
/// </summary>
public sealed record CheckoutVariantDto(
    Guid VariantId,
    Guid ProductId,
    string ProductName,
    string VariantDescription,
    string Sku,
    MoneyDto Price,
    bool ProductIsActive,
    MoneyDto? Cost = null,
    // Paquete de una unidad para cotizar el envío (null = el correo usa su default).
    int? WeightGrams = null,
    int? LengthCm = null,
    int? WidthCm = null,
    int? HeightCm = null);

/// <summary>
/// Consulta que Checkout hace sobre el catálogo. Implementada en
/// Catalog.Infrastructure — Checkout solo conoce este contrato.
/// </summary>
public interface ICatalogCheckoutQuery
{
    Task<IReadOnlyList<CheckoutVariantDto>> GetVariantsAsync(
        Guid tenantId, IReadOnlyCollection<Guid> variantIds, CancellationToken ct = default);
}
