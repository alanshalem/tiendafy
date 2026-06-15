using Microsoft.AspNetCore.DataProtection;
using Payments.Core.Abstractions;

namespace Payments.Infrastructure.Security;

/// <summary>Cifra tokens del seller con ASP.NET Data Protection (claves rotables).</summary>
public sealed class DataProtectionTokenProtector(IDataProtectionProvider provider) : ITokenProtector
{
    private readonly IDataProtector _protector = provider.CreateProtector("Tiendafy.Payments.MercadoPagoTokens.v1");

    public string Protect(string plaintext) => _protector.Protect(plaintext);
    public string Unprotect(string ciphertext) => _protector.Unprotect(ciphertext);
}
