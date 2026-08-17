namespace SharedKernel.Common;

/// <summary>Helpers de texto compartidos (antes duplicados por módulo).</summary>
public static class Text
{
    /// <summary>
    /// Trimea y recorta a <paramref name="max"/>; vacío o null → null.
    /// (La semántica exacta que compartían Checkout y Zipnova.)
    /// </summary>
    public static string? Clip(string? value, int max)
    {
        var t = value?.Trim();
        return string.IsNullOrEmpty(t) ? null : t[..Math.Min(max, t.Length)];
    }

    /// <summary>Corta a max caracteres, sin trim ni null-handling (a diferencia de Clip).</summary>
    public static string Cap(string s, int max) => s.Length <= max ? s : s[..max];
}
