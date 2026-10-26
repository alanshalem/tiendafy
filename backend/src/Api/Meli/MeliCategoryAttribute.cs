namespace Api.Meli;

/// <summary>El tipo de valor de un atributo de categoría de Mercado Libre (<c>value_type</c>).</summary>
public enum MeliAttributeKind { Text, Number, NumberUnit, List, Boolean, Other }

/// <summary>Un valor permitido de un atributo de lista (<c>values[]</c> de ML).</summary>
public sealed record MeliAttributeValue(string Id, string Name);

/// <summary>
/// Un atributo que pide una categoría de Mercado Libre, ya leído y reducido a lo que usan el gate,
/// los prompts y la revisión. <c>Required</c> es "ML lo exige"; <c>Relevant</c> es "mejora la
/// publicación"; <c>IsIdentifier</c> marca GTIN, modelo y número de parte, que nunca se inventan.
/// </summary>
public sealed record MeliCategoryAttribute(
    string Id,
    string Name,
    MeliAttributeKind Kind,
    IReadOnlyList<MeliAttributeValue> Values,
    IReadOnlyList<string> AllowedUnits,
    string? DefaultUnit,
    int? MaxLength,
    bool Required,
    bool Relevant,
    bool IsIdentifier);
