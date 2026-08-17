namespace Media.Infrastructure;

/// <summary>
/// Verificación de "magic bytes": que el contenido real del archivo coincida
/// con el content-type declarado (anti spoofing). Antes vivía en MediaStorage.
/// </summary>
internal static class MagicBytes
{
    internal static async Task<int> ReadHeaderAsync(Stream content, byte[] buffer, CancellationToken ct)
    {
        var total = 0;
        while (total < buffer.Length)
        {
            var n = await content.ReadAsync(buffer.AsMemory(total, buffer.Length - total), ct);
            if (n == 0) break;
            total += n;
        }
        return total;
    }

    /// <summary>¿Los bytes iniciales corresponden al tipo declarado? (anti content-type spoofing)</summary>
    internal static bool MatchesMagic(string type, byte[] h, int len)
    {
        if (len < 12) return false;

        bool Eq(int off, params byte[] sig)
        {
            if (off + sig.Length > len) return false;
            for (var i = 0; i < sig.Length; i++)
                if (h[off + i] != sig[i]) return false;
            return true;
        }
        bool Ascii(int off, string s)
        {
            if (off + s.Length > len) return false;
            for (var i = 0; i < s.Length; i++)
                if (h[off + i] != (byte)s[i]) return false;
            return true;
        }
        bool IsoFtyp() => Ascii(4, "ftyp"); // ISO-BMFF: mp4/avif comparten "ftyp" en offset 4

        return type switch
        {
            "image/jpeg" => Eq(0, 0xFF, 0xD8, 0xFF),
            "image/png" => Eq(0, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A),
            "image/webp" => Ascii(0, "RIFF") && Ascii(8, "WEBP"),
            "image/avif" => IsoFtyp(),
            "video/mp4" => IsoFtyp(),
            "video/webm" => Eq(0, 0x1A, 0x45, 0xDF, 0xA3),
            _ => false,
        };
    }

    /// <summary>Verifica los magic bytes del contenido real contra el tipo declarado (rebobina el stream).</summary>
    internal static async Task<bool> VerifyAsync(Stream content, string type, CancellationToken ct)
    {
        var header = new byte[16];
        var read = await ReadHeaderAsync(content, header, ct);
        content.Seek(0, SeekOrigin.Begin);
        return type == "application/pdf"
            ? read >= 4 && header[0] == 0x25 && header[1] == 0x50 && header[2] == 0x44 && header[3] == 0x46 // %PDF
            : MatchesMagic(type, header, read);
    }
}
