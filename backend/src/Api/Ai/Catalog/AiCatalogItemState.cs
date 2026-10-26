using System.Text.Json;
using System.Text.Json.Serialization;
using Api.Meli;
using MercadoLibre.Infrastructure;

namespace Api.Ai.Catalog;

/// <summary>El próximo paso de un ítem. <c>Done</c> = ya está para revisar (o falló).</summary>
public enum AiCatalogStep { Category, Write, Judge, Done }

/// <summary>
/// Lo que va en <c>AiCatalogJobItem.ProposalJson</c>: el estado de trabajo del ítem, guardado al terminar cada paso
/// para que un reinicio retome donde quedó sin repetir una llamada ya pagada.
/// </summary>
public sealed record AiCatalogItemState(
    AiCatalogStep Step,
    MeliCategoryRef? Category,
    MeliCategorySource? CategorySource,
    IReadOnlyList<MeliCategorySuggestion> Suggestions,
    IReadOnlyList<MeliCategoryAttribute> Asked,
    AiCatalogProposal? Proposal,
    IReadOnlyList<string> GateNotes,
    AiCatalogJudgeResult? Judge,
    IReadOnlyList<string> Critiques,
    bool Passed,
    IReadOnlyList<Guid> RunIds,
    int TransientFailures,
    string? FailureReason)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    public static AiCatalogItemState Initial { get; } = new(
        AiCatalogStep.Category, null, null, [], [], null, [], null, [], false, [], 0, null);

    public string ToJson() => JsonSerializer.Serialize(this, Json);

    /// <summary>Null, vacío o un JSON que no se entiende vuelven al principio: el ítem se rehace, nunca se rompe.</summary>
    public static AiCatalogItemState FromJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Initial;
        try
        {
            return JsonSerializer.Deserialize<AiCatalogItemState>(json, Json) ?? Initial;
        }
        catch (JsonException)
        {
            return Initial;
        }
    }
}
