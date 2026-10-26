namespace Api.Ai.Assistant;

/// <summary>
/// Respuesta de una herramienta ante argumentos malos: se le devuelve al modelo
/// como dato, no se lanza.
/// </summary>
public sealed record AssistantToolError(string Error);

/// <summary>Límites de los argumentos que pasa el modelo a las herramientas.</summary>
public static class AssistantArgs
{
    /// <summary>Sin valor, <paramref name="default"/>; por debajo de 1, 1; por encima de <paramref name="max"/>, <paramref name="max"/>.</summary>
    public static int Limit(int? requested, int max, int @default)
    {
        if (requested is not { } value) return @default;
        return Math.Clamp(value, 1, max);
    }
}
