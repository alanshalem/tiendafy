using Microsoft.AspNetCore.DataProtection;

namespace Api.Auth;

/// <summary>
/// Descifrado tolerante para secretos de integraciones: claves de
/// DataProtection rotadas/perdidas → null ("reconectar"), nunca excepción.
/// </summary>
public static class DataProtectorExtensions
{
    public static string? TryUnprotect(this IDataProtector protector, string encrypted)
    {
        try
        {
            return protector.Unprotect(encrypted);
        }
        catch
        {
            return null;
        }
    }
}
