namespace Api.Ai.Catalog;

/// <summary>
/// El valor propuesto para un atributo de Mercado Libre. <paramref name="Missing"/> es <c>falta_dato</c>:
/// el modelo (o el gate) no tiene de dónde sacarlo y una persona lo completa en la revisión.
/// </summary>
public sealed record AiCatalogAttributeProposal(string Id, string? ValueId, string? ValueName, string? Unit, bool Missing);

public sealed record AiCatalogProposal(
    string Description,
    string SeoTitle,
    string SeoDescription,
    IReadOnlyList<AiCatalogAttributeProposal> Attributes);

/// <summary>
/// Lo que dejó el gate: la propuesta limpia (con los atributos fuera de la categoría sacados y los valores
/// normalizados), las <paramref name="Violations"/> (se usan como crítica para reintentar) y las
/// <paramref name="Notes"/> (avisos que no reintentan, como un identificador que quedó para completar).
/// </summary>
public sealed record AiCatalogGateResult(
    AiCatalogProposal Cleaned,
    IReadOnlyList<string> Violations,
    IReadOnlyList<string> Notes)
{
    public bool Ok => Violations.Count == 0;
}
