namespace Api.Ai.Catalog;

/// <summary>
/// Lo que ve la persona antes de confirmar: cuántos productos, el costo estimado y cuánto le queda del tope del mes.
/// <c>FitsBudget</c> se informa, no bloquea: el worker pausa el trabajo al llegar al tope. Plata en micro-dólares.
/// </summary>
public sealed record AiCatalogPreviewDto(
    int Count,
    int Matched,
    bool Capped,
    long EstimatedCostMicroUsd,
    long BudgetMicroUsd,
    long CommittedMicroUsd,
    long RemainingMicroUsd,
    bool FitsBudget,
    string? WriteModel,
    string? JudgeModel,
    bool Available,
    string? Reason);

/// <summary><c>ByStatus</c> lleva todos los estados de los ítems (con cero donde no hay) para que el panel no tenga que suponer.</summary>
public sealed record AiCatalogJobDto(
    Guid Id,
    string Status,
    int Total,
    int Processed,
    Dictionary<string, int> ByStatus,
    long EstimatedCostMicroUsd,
    long ActualCostMicroUsd,
    string? PauseReason,
    DateTime CreatedAt,
    string CreatedByName);
