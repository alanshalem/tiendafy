using Fiscal.Contracts;
using Microsoft.AspNetCore.DataProtection;

namespace Fiscal.Infrastructure.Security;

/// <summary>Cifra secretos fiscales (clave privada, cert, TA) con DataProtection,
/// mismo esquema que los tokens de MercadoPago. Requiere keyring persistente en
/// prod (ya exigido en Program.cs).</summary>
public sealed class FiscalSecretProtector(IDataProtectionProvider provider) : IFiscalSecretProtector
{
    private readonly IDataProtector _protector = provider.CreateProtector("Tiendafy.Fiscal.Secrets.v1");

    public string Protect(string plaintext) => _protector.Protect(plaintext);
    public string Unprotect(string ciphertext) => _protector.Unprotect(ciphertext);
}
