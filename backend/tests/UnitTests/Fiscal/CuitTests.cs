using Fiscal.Core.Domain;

namespace UnitTests.Fiscal;

public class CuitTests
{
    [Theory]
    // Dígitos verificadores calculados con el algoritmo módulo 11 de AFIP.
    [InlineData("20123456786", "20123456786")]
    [InlineData("27123456780", "27123456780")]
    [InlineData("20-12345678-6", "20123456786")]   // con guiones
    [InlineData(" 27 12345678 0 ", "27123456780")] // con espacios
    public void Create_Valid_Normalizes(string raw, string expected)
    {
        var result = Cuit.Create(raw);
        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : null);
        Assert.Equal(expected, result.Value.Value);
    }

    [Theory]
    [InlineData("20123456780")]  // dígito verificador incorrecto (debería ser 6)
    [InlineData("27123456781")]  // idem (debería ser 0)
    public void Create_BadCheckDigit_Fails(string raw)
    {
        var result = Cuit.Create(raw);
        Assert.True(result.IsFailure);
        Assert.Equal("Cuit.CheckDigit", result.Error.Code);
    }

    [Theory]
    [InlineData("123", "Cuit.Length")]
    [InlineData("201234567861", "Cuit.Length")]
    [InlineData("", "Cuit.Empty")]
    [InlineData(null, "Cuit.Empty")]
    [InlineData("abcdefghijk", "Cuit.Length")] // sin dígitos → longitud 0
    public void Create_Invalid_Fails(string? raw, string expectedCode)
    {
        var result = Cuit.Create(raw);
        Assert.True(result.IsFailure);
        Assert.Equal(expectedCode, result.Error.Code);
    }

    [Fact]
    public void Formatting_And_Long()
    {
        var cuit = Cuit.Create("20123456786").Value;
        Assert.Equal("20-12345678-6", cuit.Formatted);
        Assert.Equal(20123456786L, cuit.AsLong);
    }
}
