using Api.Notifications;

namespace UnitTests.Notifications;

/// <summary>Normalización de teléfonos argentinos a E.164 (Cloud API).</summary>
public class WhatsAppPhoneTests
{
    [Theory]
    [InlineData("1123456789", "5491123456789")]        // CABA 10 dígitos
    [InlineData("11 2345-6789", "5491123456789")]      // con formato
    [InlineData("011 2345 6789", "5491123456789")]     // con 0 inicial
    [InlineData("5491123456789", "5491123456789")]     // ya E.164
    [InlineData("+54 9 11 2345-6789", "5491123456789")]
    [InlineData("54 11 23456789", "5491123456789")]    // 54 sin 9
    [InlineData("3512345678", "5493512345678")]        // Córdoba
    [InlineData("0351 15 234-5678", "5493512345678")]  // interior con 15
    public void Normalize_ValidArgentinePhones(string raw, string expected) =>
        Assert.Equal(expected, WhatsAppSender.NormalizeArPhone(raw));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("123")]          // muy corto
    [InlineData("abcdefghij")]   // sin dígitos suficientes
    [InlineData("19998887777")]  // no argentino (empieza con 1)
    public void Normalize_Invalid_ReturnsNull(string? raw) =>
        Assert.Null(WhatsAppSender.NormalizeArPhone(raw));
}
