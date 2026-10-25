using Api.Ai;
using Microsoft.AspNetCore.DataProtection;

namespace UnitTests.Api.Ai;

public sealed class AiKeyProtectorTests
{
    [Fact]
    public void AiKeyProtector_usa_el_purpose_fijo()
    {
        // Cambiar este purpose deja ilegibles todas las claves guardadas.
        Assert.Equal("Tiendafy.Ai.Keys.v1", AiKeyProtector.Purpose);

        var protector = new AiKeyProtector(new EphemeralDataProtectionProvider());
        var encrypted = protector.Protect("sk-test-123456a1b2");

        Assert.NotEqual("sk-test-123456a1b2", encrypted);
        Assert.DoesNotContain("sk-test", encrypted, StringComparison.Ordinal);
        Assert.Equal("sk-test-123456a1b2", protector.Unprotect(encrypted));
    }

    [Fact]
    public void Otro_purpose_no_puede_leerla()
    {
        var dp = new EphemeralDataProtectionProvider();
        var encrypted = new AiKeyProtector(dp).Protect("sk-test-x");

        Assert.ThrowsAny<System.Security.Cryptography.CryptographicException>(
            () => dp.CreateProtector("Tiendafy.Ai.Keys.v2").Unprotect(encrypted));
    }
}
