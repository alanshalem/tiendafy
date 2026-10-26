using System.Text.Json;
using SharedKernel.Common;

namespace Api.Ai.Questions;

/// <summary>Dónde se está pidiendo el borrador: define el system prompt y qué herramientas hay.</summary>
public enum DraftChannel { MeliQuestion, MeliMessage, SupportChat, Contact }

public enum QuestionCategory { Stock, Shipping, Product, Price, AfterSale, OutOfPolicy, Other }

public static class QuestionCategories
{
    public static string Wire(QuestionCategory c) => c switch
    {
        QuestionCategory.Stock => "stock",
        QuestionCategory.Shipping => "envio",
        QuestionCategory.Product => "producto",
        QuestionCategory.Price => "precio",
        QuestionCategory.AfterSale => "postventa",
        QuestionCategory.OutOfPolicy => "fuera_de_politica",
        QuestionCategory.Other => "otro",
        _ => throw new ArgumentOutOfRangeException(nameof(c), c, null),
    };

    public static QuestionCategory? FromWire(string? s) => s?.Trim().ToLowerInvariant() switch
    {
        "stock" => QuestionCategory.Stock,
        "envio" => QuestionCategory.Shipping,
        "producto" => QuestionCategory.Product,
        "precio" => QuestionCategory.Price,
        "postventa" => QuestionCategory.AfterSale,
        "fuera_de_politica" => QuestionCategory.OutOfPolicy,
        "otro" => QuestionCategory.Other,
        _ => null,
    };
}

/// <summary>Lo que el modelo contestó al clasificar. Nada de lo que diga el modelo se confía sin validar.</summary>
public sealed record QuestionClassification(QuestionCategory Category, string Reason)
{
    public const int MaxReasonChars = 200;

    private static readonly QuestionClassification Fallback = new(QuestionCategory.Other, "");

    /// <summary>
    /// Lee <c>{"categoria":"…","motivo":"…"}</c>, con o sin bloque de código. Nunca lanza:
    /// cualquier cosa inválida es <see cref="QuestionCategory.Other"/> sin motivo.
    /// </summary>
    public static QuestionClassification Parse(string? modelText)
    {
        var json = ExtractObject(modelText);
        if (json is null) return Fallback;

        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return Fallback;

            var category = doc.RootElement.TryGetProperty("categoria", out var c) && c.ValueKind == JsonValueKind.String
                ? QuestionCategories.FromWire(c.GetString())
                : null;
            if (category is null) return Fallback;

            var reason = doc.RootElement.TryGetProperty("motivo", out var m) && m.ValueKind == JsonValueKind.String
                ? Text.Clip(m.GetString(), MaxReasonChars)
                : null;
            return new QuestionClassification(category.Value, reason ?? "");
        }
        catch (JsonException)
        {
            return Fallback;
        }
    }

    /// <summary>Del primer '{' al último '}': deja afuera la cerca ```json y cualquier texto alrededor.</summary>
    private static string? ExtractObject(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        return start >= 0 && end > start ? text[start..(end + 1)] : null;
    }
}
