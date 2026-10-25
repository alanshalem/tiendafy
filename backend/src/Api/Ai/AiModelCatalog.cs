using Ai.Infrastructure;

namespace Api.Ai;

/// <summary>Lo que un modelo sabe hacer. Una tarea pide un conjunto y el panel solo ofrece los modelos que lo cumplen.</summary>
[Flags]
public enum AiCapability
{
    None = 0,
    /// <summary>Llama herramientas de forma confiable.</summary>
    Tools = 1,
    /// <summary>Respeta un esquema JSON en la respuesta.</summary>
    Json = 2,
    /// <summary>Lo anterior en la misma llamada que usa herramientas (Groq no).</summary>
    JsonWithTools = 4,
    /// <summary>Lee PDF.</summary>
    Pdf = 8,
    /// <summary>Lee imágenes.</summary>
    Image = 16,
}

/// <summary>Un modelo del catálogo. Precios en micro-dólares por millón de tokens (1 USD = 1.000.000).</summary>
public sealed record AiModelInfo(
    AiProvider Provider,
    string Id,
    string Label,
    AiCapability Capabilities,
    long InputMicroUsdPerMTok,
    long CachedInputMicroUsdPerMTok,
    long OutputMicroUsdPerMTok,
    bool Cheap);

/// <summary>
/// Catálogo de modelos EN CÓDIGO (no editable desde el panel: una tabla por tienda
/// daría precios distintos para el mismo modelo). Cambiar un precio o sumar un
/// modelo es un commit, y <see cref="PricesVerifiedOn"/> dice cuándo se
/// verificaron contra las páginas de precios de cada proveedor.
/// </summary>
public static class AiModelCatalog
{
    public const string PricesVerifiedOn = "2026-10-25";

    private const AiCapability Full =
        AiCapability.Tools | AiCapability.Json | AiCapability.JsonWithTools | AiCapability.Pdf | AiCapability.Image;

    // Entrada en caché: donde el proveedor no publica un precio, es el 10 % de la entrada.
    public static IReadOnlyList<AiModelInfo> All { get; } =
    [
        new(AiProvider.Anthropic, "claude-haiku-5-5", "Claude Haiku 5.5", Full, 100_000, 10_000, 500_000, true),
        new(AiProvider.Anthropic, "claude-sonnet-5-5", "Claude Sonnet 5.5", Full, 2_000_000, 100_000, 10_000_000, false),
        new(AiProvider.Anthropic, "claude-opus-5-5", "Claude Opus 5.5", Full, 4_000_000, 200_000, 20_000_000, false),
        new(AiProvider.OpenAI, "gpt-6-luna", "GPT-6 Luna", Full, 100_000, 10_000, 500_000, true),
        new(AiProvider.OpenAI, "gpt-6.1-sol", "GPT-6.1 Sol", Full, 2_000_000, 100_000, 10_000_000, false),
        new(AiProvider.Google, "gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite", Full, 250_000, 25_000, 1_500_000, true),
        // Sube a 1,50 / 7,50 USD el 1-ene-2027: actualizar ese día.
        new(AiProvider.Google, "gemini-3.8-flash", "Gemini 3.8 Flash", Full, 750_000, 75_000, 3_750_000, false),
        new(AiProvider.Groq, "openai/gpt-oss-20b", "GPT-OSS 20B (Groq)", AiCapability.Tools | AiCapability.Json, 75_000, 7_500, 300_000, true),
        new(AiProvider.Groq, "openai/gpt-oss-120b", "GPT-OSS 120B (Groq)", AiCapability.Tools | AiCapability.Json, 150_000, 15_000, 600_000, true),
        new(AiProvider.Groq, "qwen/qwen3.8-27b", "Qwen 3.8 27B (Groq)", AiCapability.Tools | AiCapability.Json | AiCapability.Image, 800_000, 80_000, 4_000_000, false),
    ];

    public static AiModelInfo? Find(string modelId) =>
        All.FirstOrDefault(m => string.Equals(m.Id, modelId, StringComparison.Ordinal));

    /// <summary>Modelos que el panel puede ofrecer para la tarea: proveedor con clave cargada y requisitos cumplidos.</summary>
    public static IEnumerable<AiModelInfo> Eligible(AiTask task, IReadOnlySet<AiProvider> configured)
    {
        var requires = AiTaskSpecs.For(task).Requires;
        return All.Where(m => configured.Contains(m.Provider) && (m.Capabilities & requires) == requires);
    }

    /// <summary>El modelo más barato del proveedor (entrada + salida); lo usa "Probar conexión".</summary>
    public static AiModelInfo CheapestOf(AiProvider provider) =>
        All.Where(m => m.Provider == provider)
            .OrderBy(m => m.InputMicroUsdPerMTok + m.OutputMicroUsdPerMTok)
            .First();
}
