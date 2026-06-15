using Tenancy.Core.Domain;

namespace UnitTests.Tenancy;

public class SubdomainTests
{
    [Theory]
    [InlineData("mitienda")]
    [InlineData("mi-tienda")]
    [InlineData("tienda123")]
    [InlineData("abc")]
    public void Create_WithValidValue_Succeeds(string value)
    {
        var result = Subdomain.Create(value);

        Assert.True(result.IsSuccess);
        Assert.Equal(value, result.Value.Value);
    }

    [Fact]
    public void Create_NormalizesCaseAndWhitespace()
    {
        var result = Subdomain.Create("  MiTienda  ");

        Assert.True(result.IsSuccess);
        Assert.Equal("mitienda", result.Value.Value);
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("ab")]               // muy corto
    [InlineData("-tienda")]          // guión inicial
    [InlineData("tienda-")]          // guión final
    [InlineData("mi tienda")]        // espacio
    [InlineData("mi.tienda")]        // punto
    [InlineData("ñandu")]            // no-ASCII
    public void Create_WithInvalidValue_Fails(string? value)
    {
        var result = Subdomain.Create(value);

        Assert.True(result.IsFailure);
        Assert.Equal("Subdomain.Invalid", result.Error.Code);
    }

    [Fact]
    public void Create_TooLong_Fails()
    {
        var result = Subdomain.Create(new string('a', 64));

        Assert.True(result.IsFailure);
    }

    [Theory]
    [InlineData("www")]
    [InlineData("admin")]
    [InlineData("api")]
    [InlineData("checkout")]
    public void Create_WithReservedValue_Fails(string value)
    {
        var result = Subdomain.Create(value);

        Assert.True(result.IsFailure);
        Assert.Equal("Subdomain.Reserved", result.Error.Code);
    }
}
