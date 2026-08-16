using Microsoft.AspNetCore.DataProtection;
using SharedKernel.Common;

namespace UnitTests;

/// <summary>Helpers de datos de prueba compartidos entre suites (antes copiados por archivo).</summary>
public static class TestData
{
    public static Money Ars(long cents) => new(cents, "ARS");

    /// <summary>Provider efímero de DataProtection para tests (round-trip en memoria).</summary>
    public static readonly IDataProtectionProvider Dp = new EphemeralDataProtectionProvider();
}
