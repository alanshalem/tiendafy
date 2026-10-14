using System.Reflection;
using System.Text.Json;

namespace Themes.Infrastructure;

/// <summary>
/// El contrato del tema que comparten el editor, la tienda y la API.
///
/// No se escribe a mano: lo genera el registro de secciones de
/// shared/types (TypeScript) en <c>theme-contract.json</c>, que va embebido en
/// este ensamblado. Trae los tipos de sección con sus campos y límites (lo que
/// valida <see cref="ThemeConfigValidator"/>) y el tema por defecto de una
/// tienda nueva. Un test del admin falla si el JSON no coincide con lo que
/// genera el registro, así que no puede quedar desincronizado en silencio.
/// </summary>
public static class ThemeContract
{
    private const string ResourceName = "Themes.Infrastructure.theme-contract.json";

    private static readonly Lazy<JsonDocument> Document = new(Load);

    private static JsonDocument Load()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Falta el recurso embebido {ResourceName}.");
        return JsonDocument.Parse(stream);
    }

    public static JsonElement Root => Document.Value.RootElement;

    /// <summary>La versión del esquema del tema que escribe el editor hoy.</summary>
    public static int SchemaVersion => Root.GetProperty("schemaVersion").GetInt32();

    /// <summary>El tema de una tienda recién creada, como JSON.</summary>
    public static string DefaultConfigJson { get; } = Root.GetProperty("defaultConfig").GetRawText();

    /// <summary>Los tipos de sección que existen (en el orden del registro).</summary>
    public static IReadOnlyList<string> SectionTypes { get; } =
        [.. Root.GetProperty("sections").EnumerateObject().Select(p => p.Name)];

    public static int Limit(string name) => Root.GetProperty("limits").GetProperty(name).GetInt32();

    public static IReadOnlyList<string> EnvelopeValues(string name) =>
        [.. Root.GetProperty("envelope").GetProperty(name).EnumerateArray().Select(v => v.GetString()!)];

    /// <summary>La definición de un tipo de sección (label + campos), si existe.</summary>
    public static bool TryGetSection(string type, out JsonElement section) =>
        Root.GetProperty("sections").TryGetProperty(type, out section);
}
