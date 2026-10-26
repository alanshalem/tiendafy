using Ai.Infrastructure;

namespace Api.Ai.Catalog;

/// <summary>
/// El costo estimado de un trabajo de fichas y lo que se exige libre del tope antes de cada ítem. Plata en micro-dólares
/// (<c>long</c>). Los tokens son promedios por producto con la lista de atributos incluida.
/// </summary>
public static class AiCatalogEstimate
{
    public const int WriteInputTokens = 2_500, WriteOutputTokens = 700, JudgeInputTokens = 2_000, JudgeOutputTokens = 250;

    /// <summary>Un 10 % de más por los reintentos (la mitad de los productos puede necesitar una segunda redacción).</summary>
    private const long RetriesNumerator = 11, RetriesDenominator = 10;

    /// <summary>El modelo principal asignado a la tarea en la tienda, o null si no tiene (o ya no está en el catálogo).</summary>
    public static AiModelInfo? ModelOf(AiTenantConfigSnapshot snapshot, AiTask task) =>
        snapshot.Assignments.TryGetValue(task, out var assigned) ? AiModelCatalog.Find(assigned.Primary) : null;

    /// <summary>Redacción más evaluación con los tokens promedio, y un 10 % por los reintentos; hacia arriba.</summary>
    public static long PerProductMicroUsd(AiModelInfo write, AiModelInfo judge)
    {
        var once = AiCost.MicroUsd(write, WriteInputTokens, 0, WriteOutputTokens)
            + AiCost.MicroUsd(judge, JudgeInputTokens, 0, JudgeOutputTokens);
        return (once * RetriesNumerator + RetriesDenominator - 1) / RetriesDenominator;
    }

    /// <summary>
    /// Lo que el gateway reservaría en el peor caso por un ítem: dos intentos de redacción más evaluación. Es lo que tiene
    /// que haber libre del tope antes de reclamar un ítem; si no, el trabajo se pausa.
    /// </summary>
    public static long WorstCaseItemMicroUsd(AiModelInfo write, AiModelInfo judge) =>
        AiCatalogDrafter.MaxAttempts * (
            AiCost.WorstCaseMicroUsd(write, AiTaskSpecs.For(AiTask.CatalogWrite), WriteInputTokens)
            + AiCost.WorstCaseMicroUsd(judge, AiTaskSpecs.For(AiTask.CatalogJudge), JudgeInputTokens));
}
