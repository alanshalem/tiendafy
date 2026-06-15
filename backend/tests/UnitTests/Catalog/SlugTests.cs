using Catalog.Core.Domain;

namespace UnitTests.Catalog;

public class SlugTests
{
    [Theory]
    [InlineData("Remera Oversize", "remera-oversize")]
    [InlineData("Café de Especialidad", "cafe-de-especialidad")]
    [InlineData("Ñandú & Cía.", "nandu-cia")]
    [InlineData("  Espacios   múltiples  ", "espacios-multiples")]
    [InlineData("UPPERCASE", "uppercase")]
    [InlineData("ya-es-slug", "ya-es-slug")]
    [InlineData("100% Algodón", "100-algodon")]
    public void Create_SlugifiesFreeText(string input, string expected)
    {
        var result = Slug.Create(input);

        Assert.True(result.IsSuccess);
        Assert.Equal(expected, result.Value.Value);
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("!!!")]
    [InlineData("---")]
    public void Create_WithNoUsableChars_Fails(string? input)
    {
        var result = Slug.Create(input);

        Assert.True(result.IsFailure);
        Assert.Equal("Slug.Invalid", result.Error.Code);
    }

    [Fact]
    public void Create_TruncatesAt120Chars()
    {
        var result = Slug.Create(new string('a', 200));

        Assert.True(result.IsSuccess);
        Assert.Equal(120, result.Value.Value.Length);
    }
}
