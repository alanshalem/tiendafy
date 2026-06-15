namespace Catalog.Core.Domain;

public sealed class ProductImage
{
    public Guid Id { get; private set; }
    public string Url { get; private set; } = null!;
    public string? AltText { get; private set; }
    public int Position { get; private set; }

    private ProductImage() { } // EF Core

    internal ProductImage(string url, string? altText, int position)
    {
        Id = Guid.NewGuid();
        Url = url;
        AltText = altText;
        Position = position;
    }

    internal void MoveTo(int position) => Position = position;
}
