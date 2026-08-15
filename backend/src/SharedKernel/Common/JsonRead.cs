using System.Text.Json;

namespace SharedKernel.Common;

/// <summary>
/// Lecturas tolerantes de propiedades de un JsonElement (APIs de terceros con
/// shapes flojos). Antes duplicadas entre el cliente y los endpoints de ML.
/// </summary>
public static class JsonRead
{
    public static string? GetString(JsonElement e, string name) =>
        e.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    public static decimal GetDecimal(JsonElement e, string name) =>
        e.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number ? p.GetDecimal() : 0m;

    public static long GetLong(JsonElement e, string name) =>
        e.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number ? p.GetInt64() : 0;

    public static DateTime? GetDate(JsonElement e, string name) =>
        e.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String
            && DateTimeOffset.TryParse(p.GetString(), out var dto) ? dto.UtcDateTime : null;
}
