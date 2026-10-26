using SharedKernel.Common;

namespace Api.Ai.Questions;

/// <summary>
/// Encierra el texto que escribió un comprador entre etiquetas para que el modelo lo trate como
/// dato y no como instrucción. El comprador no puede abrir ni cerrar etiquetas: sus '&lt;' y '&gt;' se reemplazan.
/// </summary>
public static class UntrustedText
{
    public const int MaxChars = 1_500;

    public static string Wrap(string tag, string text) =>
        $"<{tag}>\n{Defang(Text.Clip(text, MaxChars) ?? "")}\n</{tag}>";

    /// <summary>Reemplaza los '&lt;' y '&gt;' para que el texto no pueda abrir ni cerrar etiquetas.</summary>
    public static string Defang(string text) => text
        .Replace('<', '‹')
        .Replace('＜', '‹')
        .Replace('>', '›')
        .Replace('＞', '›');
}
