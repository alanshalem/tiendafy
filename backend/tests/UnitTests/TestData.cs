using Microsoft.AspNetCore.DataProtection;
using SharedKernel.Common;

namespace UnitTests;

/// <summary>Helpers de datos de prueba compartidos entre suites (antes copiados por archivo).</summary>
public static class TestData
{
    public static Money Ars(long cents) => new(cents, "ARS");

    /// <summary>Tenant fijo de las suites (antes cada archivo hacía su propio TenantId.New()).</summary>
    public static readonly TenantId Tenant = TenantId.New();

    /// <summary>Provider efímero de DataProtection para tests (round-trip en memoria).</summary>
    public static readonly IDataProtectionProvider Dp = new EphemeralDataProtectionProvider();
}
