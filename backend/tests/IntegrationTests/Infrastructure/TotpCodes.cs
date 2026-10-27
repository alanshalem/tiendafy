using System.Net;
using System.Security.Cryptography;

namespace IntegrationTests;

/// <summary>
/// Los códigos que mostraría la app de autenticación para la clave que muestra
/// el panel (TOTP, RFC 6238), calculados como los calcula la app.
/// </summary>
public static class TotpCodes
{
    /// <summary>La clave como la muestra el panel ("abcd efgh …"), en base32 pelado.</summary>
    public static string Raw(string sharedKey) => sharedKey.Replace(" ", string.Empty).ToUpperInvariant();

    /// <summary>
    /// El código de ahora (o <paramref name="steps"/> pasos de 30 s más
    /// adelante): HMAC-SHA1 y 6 dígitos. Identity acepta dos pasos para cada
    /// lado; 20 pasos adelante es un código que no sirve.
    /// </summary>
    public static string At(string sharedKey, int steps)
    {
        var key = FromBase32(Raw(sharedKey));
        var timestep = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 30 + steps;
        var counter = BitConverter.GetBytes(IPAddress.HostToNetworkOrder(timestep));
#pragma warning disable CA5350 // TOTP (RFC 6238) es HMAC-SHA1: es lo que calculan las apps de autenticación
        var hash = HMACSHA1.HashData(key, counter);
#pragma warning restore CA5350
        var offset = hash[^1] & 0x0f;
        var binary = ((hash[offset] & 0x7f) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
        return (binary % 1_000_000).ToString("D6", System.Globalization.CultureInfo.InvariantCulture);
    }

    private static byte[] FromBase32(string input)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var bytes = new List<byte>();
        int buffer = 0, bits = 0;
        foreach (var c in input.TrimEnd('='))
        {
            buffer = (buffer << 5) | alphabet.IndexOf(c);
            bits += 5;
            if (bits >= 8)
            {
                bytes.Add((byte)(buffer >> (bits - 8)));
                bits -= 8;
            }
        }
        return [.. bytes];
    }
}
