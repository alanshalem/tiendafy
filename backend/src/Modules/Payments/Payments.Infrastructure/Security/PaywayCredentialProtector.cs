using Microsoft.AspNetCore.DataProtection;
using Payments.Core.Abstractions;

namespace Payments.Infrastructure.Security;

/// <summary>
/// Cifra la clave privada de Payway.
///
/// Tiene su propio propósito de Data Protection, separado del de Mercado Pago:
/// un texto cifrado para un propósito no se puede descifrar con otro, así que
/// un error de cableado entre integraciones falla en el acto en vez de leer el
/// secreto de la otra.
/// </summary>
public sealed class PaywayCredentialProtector(IDataProtectionProvider provider) : IPaywayCredentialProtector
{
    private readonly IDataProtector _protector = provider.CreateProtector("Tiendafy.Payments.PaywayCredentials.v1");

    public string Protect(string plaintext) => _protector.Protect(plaintext);
    public string Unprotect(string ciphertext) => _protector.Unprotect(ciphertext);
}
