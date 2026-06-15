namespace Catalog.Core.Domain;

/// <summary>
/// Opción de producto: "Talle" → [S, M, L]. Las variantes combinan un valor
/// de cada opción (modelo Shopify-style: Product → Options → Variants).
/// </summary>
public sealed class ProductOption
{
    public Guid Id { get; private set; }
    public string Name { get; private set; } = null!;

    private readonly List<string> _values = [];
    public IReadOnlyList<string> Values => _values.AsReadOnly();

    private ProductOption() { } // EF Core

    internal ProductOption(string name, IEnumerable<string> values)
    {
        Id = Guid.NewGuid();
        Name = name;
        _values.AddRange(values);
    }

    public bool HasValue(string value) =>
        _values.Contains(value, StringComparer.OrdinalIgnoreCase);
}
