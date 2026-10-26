using SharedKernel.Common;

namespace Api.Ai.Questions;

/// <summary>
/// Encierra el texto que escribió un comprador entre etiquetas para que el modelo lo trate como
/// dato y no como instrucción. El comprador no puede abrir ni cerrar etiquetas: sus '&lt;' y '&gt;' se reemplazan.
/// </summary>
public static class UntrustedText
{
    public const int MaxChars = 1_500;

    public static string Wrap(string tag, string text)
    {
        var inner = (Text.Clip(text, MaxChars) ?? "")
            .Replace('<', '‹')
            .Replace('>', '›');
        return $"<{tag}>\n{inner}\n</{tag}>";
    }
}
