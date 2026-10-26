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

/// <summary>
/// Lo que la persona cambió al aprobar: el texto y los datos de ML que completó o corrigió. Lo que no manda se aprueba como
/// lo propuso la IA. Un valor de lista va por <c>ValueId</c> (o por su nombre); un número con unidad, el número y su <c>Unit</c>.
/// <c>Remove</c> son los ids de atributos propuestos que la persona descartó: no se guardan.
/// </summary>
public sealed record AiCatalogApproveRequest(
    string? Description, string? SeoTitle, string? SeoDescription, AiCatalogAttributeInput[]? Attributes, string[]? Remove = null);

public sealed record AiCatalogAttributeInput(string Id, string? ValueId, string? ValueName, string? Unit);

public sealed record AiCatalogBulkFailure(Guid ProductId, string Message);

public sealed record AiCatalogBulkResult(int Approved, AiCatalogBulkFailure[] Failed);

public sealed record AiCatalogSetCategoryRequest(string? CategoryId);

public sealed record AiCatalogCategoryDto(string Id, string Name);

public sealed record AiCatalogSpecDto(string Name, string Value);

public sealed record AiCatalogValueDto(string Id, string Name);

/// <summary>Lo que tiene el producto AHORA (leído al pedir), no la foto del momento en que se armó el trabajo.</summary>
public sealed record AiCatalogCurrentDto(
    string Name, string? Description, string? SeoTitle, string? SeoDescription, string? Brand, AiCatalogSpecDto[] Specs);

/// <summary>
/// <c>Target</c> dice a dónde va al aprobar: <c>spec</c> (la ficha que ve el comprador) o <c>meli</c> (solo Mercado Libre).
/// <c>Definition</c> es cómo se pide ese dato en la categoría (tipo, opciones, unidades): con eso el panel lo deja corregir.
/// </summary>
public sealed record AiCatalogProposedAttributeDto(
    string Id, string Name, string Value, string? ValueId, string? ValueName, string? Unit, string Target,
    AiCatalogMissingDto? Definition);

public sealed record AiCatalogProposalDto(
    string Description, string SeoTitle, string SeoDescription, AiCatalogProposedAttributeDto[] Attributes);

/// <summary>Un dato que pide Mercado Libre y que la IA no pudo sacar de lo que hay: se completa a mano en la revisión.</summary>
public sealed record AiCatalogMissingDto(
    string AttributeId, string Name, string Kind, AiCatalogValueDto[] Values, string[] Units, string? DefaultUnit, bool Required);

public sealed record AiCatalogItemDto(
    Guid Id,
    Guid ProductId,
    string Status,
    bool Passed,
    int Attempts,
    int? Score,
    string? JudgeNotes,
    AiCatalogCurrentDto Current,
    AiCatalogProposalDto? Proposal,
    AiCatalogMissingDto[] Missing,
    AiCatalogCategoryDto? Category,
    AiCatalogCategoryDto[] Suggestions,
    bool HasMeliListing,
    string? FailureReason);

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
