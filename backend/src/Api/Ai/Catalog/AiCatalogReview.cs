using System.Globalization;
using Ai.Infrastructure;
using Api.Endpoints;
using Api.Meli;
using Catalog.Core.Domain;
using Catalog.Core.Features.UpdateProduct;
using Catalog.Infrastructure.Persistence;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Ai.Catalog;

/// <summary>
/// La revisión de las fichas: ver lo actual contra lo propuesto, aprobar (con o sin cambios), descartar y elegir la categoría
/// de lo que quedó en "elegí la categoría". Scoped, en el request: la tienda es la del request.
///
/// <para>
/// Aprobar guarda en la tienda (descripción, SEO y la ficha técnica) y en las tablas de ML (categoría y atributos que solo usa
/// Mercado Libre). <b>No hace ningún pedido a Mercado Libre</b>: mandar la ficha a una publicación es otro clic
/// (el envío de atributos a la publicación).
/// </para>
/// </summary>
public sealed class AiCatalogReview(
    AiDbContext ai,
    MeliDbContext meli,
    CatalogDbContext catalog,
    IProductRepository products,
    UpdateProductHandler update,
    MeliCatalogReader reader,
    ITenantContext tenant,
    TimeProvider clock)
{
    public const int DefaultPageSize = 25, MaxPageSize = 50;

    private const int MaxMissingValues = 300;

    internal static readonly Error ItemNotFound =Error.NotFound("AiCatalog.ItemNotFound", "Esa ficha no existe.");

    private static readonly Error NotReviewable = Error.Conflict("AiCatalog.NotReviewable", "Esta ficha ya no está para revisar.");

    private Guid TenantId => tenant.TenantId.Value;

    private DateTime Now => clock.GetUtcNow().UtcDateTime;

    // ------------------------------------------------------------------ Lectura

    /// <param name="status">Un estado de ficha (sin distinguir mayúsculas) o nada para todas.</param>
    /// <returns>
    /// La página, el total y, si se piden las que están para revisar, cuántas de TODAS ellas pasaron el evaluador: es lo que
    /// aprueba "aprobar todos los que pasaron", y la página sola no lo dice.
    /// </returns>
    public async Task<Result<(IReadOnlyList<AiCatalogItemDto> Items, int Total, int Passed)>> ListAsync(
        Guid jobId, string? status, int? offset, int? limit, CancellationToken ct)
    {
        if (!await ai.CatalogJobs.AsNoTracking().AnyAsync(j => j.TenantId == TenantId && j.Id == jobId, ct))
            return Result.Failure<(IReadOnlyList<AiCatalogItemDto>, int, int)>(AiCatalogEndpoints.JobNotFound);

        var query = ai.CatalogJobItems.AsNoTracking().Where(i => i.TenantId == TenantId && i.JobId == jobId);
        AiCatalogItemStatus? filter = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!Enum.TryParse<AiCatalogItemStatus>(status, ignoreCase: true, out var parsed))
                return Result.Failure<(IReadOnlyList<AiCatalogItemDto>, int, int)>(
                    Error.Validation("AiCatalog.BadStatus", "Ese estado de ficha no existe."));
            filter = parsed;
            query = query.Where(i => i.Status == parsed);
        }

        var total = await query.CountAsync(ct);
        var page = await query.OrderBy(i => i.UpdatedAtUtc).ThenBy(i => i.Id)
            .Skip(Math.Max(0, offset ?? 0)).Take(Math.Clamp(limit ?? DefaultPageSize, 1, MaxPageSize))
            .ToListAsync(ct);

        // "Pasó" vive en el estado de cada ficha y no en una columna: se cuenta leyéndolas (un trabajo tiene 500 como mucho).
        var passed = 0;
        if (filter == AiCatalogItemStatus.Review)
        {
            var states = await query.Select(i => i.ProposalJson).ToListAsync(ct);
            passed = states.Count(json => AiCatalogItemState.FromJson(json).Passed);
        }
        return (await ToDtosAsync(page, ct), total, passed);
    }

    // ------------------------------------------------------------------ Aprobar

    public async Task<Result<AiCatalogItemDto>> ApproveAsync(Guid itemId, AiCatalogApproveRequest? edits, CancellationToken ct)
    {
        var item = await ai.CatalogJobItems.FirstOrDefaultAsync(i => i.TenantId == TenantId && i.Id == itemId, ct);
        if (item is null) return Result.Failure<AiCatalogItemDto>(ItemNotFound);
        var state = AiCatalogItemState.FromJson(item.ProposalJson);
        if (item.Status != AiCatalogItemStatus.Review || state.Proposal is not { } proposal)
            return Result.Failure<AiCatalogItemDto>(NotReviewable);

        // 1. Lo que escribió la persona, validado contra los atributos que se pidieron al armar la ficha.
        var description = (edits?.Description ?? proposal.Description).Trim();
        var seoTitle = (edits?.SeoTitle ?? proposal.SeoTitle).Trim();
        var seoDescription = (edits?.SeoDescription ?? proposal.SeoDescription).Trim();
        if (description.Length == 0)
            return Result.Failure<AiCatalogItemDto>(Error.Validation("AiCatalog.BadEdit", "La descripción no puede quedar vacía."));

        var attributes = proposal.Attributes.Where(a => !a.Missing).ToDictionary(a => a.Id, StringComparer.OrdinalIgnoreCase);
        foreach (var input in edits?.Attributes ?? [])
        {
            if (string.IsNullOrWhiteSpace(input.Id) || (string.IsNullOrWhiteSpace(input.ValueId) && string.IsNullOrWhiteSpace(input.ValueName)))
                continue;
            attributes[input.Id.Trim()] = new AiCatalogAttributeProposal(input.Id.Trim(), input.ValueId, input.ValueName, input.Unit, false);
        }
        // Lo que la persona descartó no se guarda, antes de validar. Si un id viene editado y quitado a la vez, manda quitar.
        foreach (var removed in edits?.Remove ?? [])
            if (!string.IsNullOrWhiteSpace(removed)) attributes.Remove(removed.Trim());

        var cleaned = AiCatalogGate.CleanHumanAttributes([.. attributes.Values], state.Asked);
        var violations = AiCatalogGate.CheckHumanEdit(cleaned.Attributes, state.Asked, description, seoTitle, seoDescription)
            .Concat(cleaned.Violations).Distinct().ToList();
        if (violations.Count > 0)
            return Result.Failure<AiCatalogItemDto>(Error.Validation("AiCatalog.BadEdit", string.Join(" ", violations)));

        var product = await products.GetByIdAsync(tenant.TenantId, item.ProductId, ct);
        if (product is null)
            return Result.Failure<AiCatalogItemDto>(Error.NotFound("AiCatalog.ProductNotFound", "El producto de esta ficha ya no existe."));

        // 2. Descripción y SEO. Nombre y marca actuales: UpdateDetails pide el nombre y pisa la marca (null la borra).
        var updated = await update.UpdateDetailsAsync(new UpdateProductDetailsCommand(
            tenant.TenantId, product.Id, product.Name, description, seoTitle, seoDescription, product.Brand), ct);
        if (updated.IsFailure) return Result.Failure<AiCatalogItemDto>(updated.Error);

        // 3. Ficha técnica: lo que ya tenía más lo nuevo (SetSpecs reemplaza la ficha entera).
        var definitions = await catalog.SpecDefinitions.AsNoTracking().Where(d => d.TenantId == tenant.TenantId).ToListAsync(ct);
        var mapping = MappedDefinitions(product, definitions);
        var newSpecs = new Dictionary<Guid, string>();
        var forMeli = new List<AiCatalogAttributeProposal>();
        foreach (var attribute in cleaned.Attributes)
        {
            if (mapping.TryGetValue(attribute.Id, out var definition) && SpecValue(definition, attribute) is { } value)
                newSpecs[definition.Id] = value;
            else
                forMeli.Add(attribute);
        }
        if (newSpecs.Count > 0)
        {
            var merged = product.Specs.Where(s => !newSpecs.ContainsKey(s.DefinitionId)).Select(s => (s.DefinitionId, (string?)s.Value))
                .Concat(newSpecs.Select(s => (s.Key, (string?)s.Value))).ToList();
            ProductSpecsSave.Apply(product, merged, await ProductSpecsSave.KnownDefinitionIdsAsync(catalog, tenant.TenantId, ct));
            await catalog.SaveChangesAsync(ct);
        }

        // 4. Mercado Libre: la categoría y lo que la tienda no tiene como spec. Solo la base: ningún pedido a ML.
        await SaveMeliDataAsync(product.Id, state, forMeli, ct);

        // 5. Listo. Si algo de 3 o 4 falló, el ítem sigue en revisión y aprobar de nuevo escribe lo mismo.
        item.Approve(Now);
        await ai.SaveChangesAsync(ct);
        return (await ToDtosAsync([item], ct))[0];
    }

    /// <summary>Aprueba los que pasaron el evaluador, sin cambios y de a uno: el que falla se informa y el resto sigue.</summary>
    public async Task<Result<AiCatalogBulkResult>> ApprovePassedAsync(Guid jobId, CancellationToken ct)
    {
        if (!await ai.CatalogJobs.AsNoTracking().AnyAsync(j => j.TenantId == TenantId && j.Id == jobId, ct))
            return Result.Failure<AiCatalogBulkResult>(AiCatalogEndpoints.JobNotFound);

        var inReview = await ai.CatalogJobItems.AsNoTracking()
            .Where(i => i.TenantId == TenantId && i.JobId == jobId && i.Status == AiCatalogItemStatus.Review)
            .OrderBy(i => i.UpdatedAtUtc).ThenBy(i => i.Id)
            .ToListAsync(ct);

        var approved = 0;
        var failed = new List<AiCatalogBulkFailure>();
        foreach (var item in inReview.Where(i => AiCatalogItemState.FromJson(i.ProposalJson).Passed))
        {
            ClearTrackers();
            var result = await ApproveAsync(item.Id, null, ct);
            if (result.IsSuccess) approved++;
            else failed.Add(new AiCatalogBulkFailure(item.ProductId, result.Error.Message));
        }
        ClearTrackers();
        return new AiCatalogBulkResult(approved, [.. failed]);
    }

    // ------------------------------------------------------------------ Descartar y elegir categoría

    public async Task<Result<AiCatalogItemDto>> DiscardAsync(Guid itemId, CancellationToken ct)
    {
        var item = await ai.CatalogJobItems.FirstOrDefaultAsync(i => i.TenantId == TenantId && i.Id == itemId, ct);
        if (item is null) return Result.Failure<AiCatalogItemDto>(ItemNotFound);
        if (item.Status is not (AiCatalogItemStatus.Review or AiCatalogItemStatus.NeedsCategory or AiCatalogItemStatus.Failed))
            return Result.Failure<AiCatalogItemDto>(NotReviewable);

        item.Discard(Now);
        await ai.SaveChangesAsync(ct);
        return (await ToDtosAsync([item], ct))[0];
    }

    /// <summary>La persona eligió la categoría: el ítem vuelve a la cola desde cero intentos y, si el trabajo había terminado, se reabre.</summary>
    public async Task<Result<AiCatalogItemDto>> SetCategoryAsync(Guid itemId, string categoryId, CancellationToken ct)
    {
        var item = await ai.CatalogJobItems.FirstOrDefaultAsync(i => i.TenantId == TenantId && i.Id == itemId, ct);
        if (item is null) return Result.Failure<AiCatalogItemDto>(ItemNotFound);
        if (item.Status != AiCatalogItemStatus.NeedsCategory)
            return Result.Failure<AiCatalogItemDto>(Error.Conflict("AiCatalog.NotNeedsCategory", "Esta ficha no está esperando una categoría."));
        if (string.IsNullOrWhiteSpace(categoryId))
            return Result.Failure<AiCatalogItemDto>(Error.Validation("AiCatalog.BadCategory", "Elegí una categoría de Mercado Libre."));

        var jobStatus = await ai.CatalogJobs.AsNoTracking()
            .Where(j => j.TenantId == TenantId && j.Id == item.JobId).Select(j => j.Status).FirstAsync(ct);
        if (jobStatus == AiCatalogJobStatus.Cancelled)
            return Result.Failure<AiCatalogItemDto>(Error.Conflict("AiCatalog.JobCancelled", "El trabajo está cancelado: no se siguen armando fichas."));

        var found = await LookUpCategoryAsync(categoryId.Trim(), ct);
        if (found.IsFailure) return Result.Failure<AiCatalogItemDto>(found.Error);

        var state = AiCatalogItemState.FromJson(item.ProposalJson) with
        {
            Step = AiCatalogStep.Category,
            Category = found.Value,
            CategorySource = MeliCategorySource.Manual,
            Suggestions = [],
            TransientFailures = 0,
            FailureReason = null,
        };

        // La consulta a ML de arriba pudo tardar segundos: en el medio el worker pudo cerrar el trabajo. Por eso el trabajo no se
        // lee antes y se escribe después: se descuenta y se reabre con UPDATEs condicionales sobre el estado de AHORA, y todo
        // bajo el candado de la tienda (reabrir es lo que puede dejar dos trabajos activos).
        await using var tx = await ai.Database.BeginTransactionAsync(ct);
        await AiCatalogQueue.LockTenantAsync(ai, TenantId, ct);
        item.Requeue(state.ToJson(), Now);
        await ai.SaveChangesAsync(ct);
        await AiCatalogQueue.ReopenForItemAsync(ai, TenantId, item.JobId, Now, ct);
        await tx.CommitAsync(ct);
        return (await ToDtosAsync([item], ct))[0];
    }

    /// <summary>Una ficha de esta tienda, como la ve el panel (null si no existe o es de otra).</summary>
    public async Task<AiCatalogItemDto?> GetItemAsync(Guid itemId, CancellationToken ct)
    {
        var item = await ai.CatalogJobItems.AsNoTracking().FirstOrDefaultAsync(i => i.TenantId == TenantId && i.Id == itemId, ct);
        return item is null ? null : (await ToDtosAsync([item], ct))[0];
    }

    /// <summary>Busca categorías con el texto que escribe la persona (la misma predicción que usa el flujo de publicar).</summary>
    public async Task<Result<IReadOnlyList<MeliCategorySuggestion>>> SearchCategoriesAsync(string? text, CancellationToken ct)
    {
        var query = text?.Trim() ?? "";
        if (query.Length < 3) return Result.Success<IReadOnlyList<MeliCategorySuggestion>>([]);
        try
        {
            var connection = await reader.ConnectAsync(TenantId, ct);
            if (connection is null) return Result.Failure<IReadOnlyList<MeliCategorySuggestion>>(NotConnected);
            return Result.Success(await reader.PredictAsync(connection, query[..Math.Min(query.Length, 200)], ct));
        }
        catch (MeliBusyException ex)
        {
            return Result.Failure<IReadOnlyList<MeliCategorySuggestion>>(new Error("Meli.Busy", ex.Message, ErrorType.Unavailable));
        }
        catch (MeliException ex)
        {
            return Result.Failure<IReadOnlyList<MeliCategorySuggestion>>(Error.Validation("Meli.Predict", ex.Message));
        }
    }

    private static readonly Error NotConnected = Error.Conflict("Meli.NotConnected", AiCatalogJobs.NotConnectedReason);

    private async Task<Result<MeliCategoryRef>> LookUpCategoryAsync(string categoryId, CancellationToken ct)
    {
        try
        {
            var connection = await reader.ConnectAsync(TenantId, ct);
            if (connection is null) return Result.Failure<MeliCategoryRef>(NotConnected);
            return await reader.CategoryAsync(connection, categoryId, ct) is { } category
                ? category
                : Result.Failure<MeliCategoryRef>(Error.Validation("AiCatalog.BadCategory", "Esa categoría no existe en Mercado Libre."));
        }
        catch (MeliBusyException ex)
        {
            return Result.Failure<MeliCategoryRef>(new Error("Meli.Busy", ex.Message, ErrorType.Unavailable));
        }
        catch (MeliException ex)
        {
            return Result.Failure<MeliCategoryRef>(Error.Validation("Meli.Category", ex.Message));
        }
    }

    // ------------------------------------------------------------------ Guardado

    private async Task SaveMeliDataAsync(
        Guid productId, AiCatalogItemState state, List<AiCatalogAttributeProposal> attributes, CancellationToken ct)
    {
        var tenantId = TenantId;
        if (state.Category is { } category)
        {
            var source = state.CategorySource ?? MeliCategorySource.Predicted;
            var saved = await meli.ProductCategories.FirstOrDefaultAsync(c => c.TenantId == tenantId && c.ProductId == productId, ct);
            if (saved is null) meli.ProductCategories.Add(MeliProductCategory.Create(tenantId, productId, category.Id, category.Name, source));
            else saved.Change(category.Id, category.Name, source);
        }

        if (attributes.Count > 0)
        {
            // La entidad no tiene "cambiar": se borran las filas de esos ids y se crean de nuevo (y el borrado va antes, por el índice único).
            var ids = attributes.Select(a => a.Id.ToUpperInvariant()).ToList();
            await meli.ProductAttributes
                .Where(a => a.TenantId == tenantId && a.ProductId == productId && ids.Contains(a.AttributeId))
                .ExecuteDeleteAsync(ct);
            foreach (var attribute in attributes)
                meli.ProductAttributes.Add(MeliProductAttribute.Create(tenantId, productId, attribute.Id, attribute.ValueId, attribute.ValueName, attribute.Unit));
        }
        await meli.SaveChangesAsync(ct);
    }

    /// <summary>Las specs de la tienda equivalentes a un atributo de ML que aplican a este producto, por id de atributo.</summary>
    private static Dictionary<string, SpecDefinition> MappedDefinitions(Product product, IReadOnlyList<SpecDefinition> definitions) =>
        definitions
            .Where(d => !string.IsNullOrWhiteSpace(d.MeliAttributeId)
                && (d.CategoryIds.Count == 0 || d.CategoryIds.Any(product.CategoryIds.Contains)))
            .GroupBy(d => d.MeliAttributeId!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.OrderBy(d => d.SortOrder).First(), StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// El valor tal cual lo guarda la spec, o null si no entra en ella y va solo a Mercado Libre: en una spec de lista tiene que ser
    /// una de sus opciones, en una numérica tiene que ser un número, y un texto no puede pasar del largo de una spec.
    /// </summary>
    private static string? SpecValue(SpecDefinition definition, AiCatalogAttributeProposal attribute)
    {
        var text = attribute.ValueName?.Trim();
        if (string.IsNullOrEmpty(text) || text.Length > ProductSpec.MaxValueLength) return null;
        var unit = attribute.Unit?.Trim();
        var hasUnit = !string.IsNullOrEmpty(unit);
        return definition.Type switch
        {
            // Un texto lleva su unidad con él: "300 cm", no "300".
            SpecType.Text => WithUnit(text, unit),
            // Un número no tiene dónde llevar la unidad: solo entra si es la de la spec; si no, 300 m se leería como 300 cm.
            SpecType.Number => decimal.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out _)
                && (!hasUnit || string.Equals(unit, definition.Unit?.Trim(), StringComparison.OrdinalIgnoreCase)) ? text : null,
            SpecType.List => definition.Options.FirstOrDefault(o => string.Equals(o, text, StringComparison.OrdinalIgnoreCase)),
            _ => null,
        };
    }

    private static string? WithUnit(string text, string? unit)
    {
        var value = string.IsNullOrEmpty(unit) ? text : $"{text} {unit}";
        return value.Length <= ProductSpec.MaxValueLength ? value : null;
    }

    private void ClearTrackers()
    {
        ai.ChangeTracker.Clear();
        meli.ChangeTracker.Clear();
        catalog.ChangeTracker.Clear();
    }

    // ------------------------------------------------------------------ DTOs

    private async Task<IReadOnlyList<AiCatalogItemDto>> ToDtosAsync(IReadOnlyList<AiCatalogJobItem> items, CancellationToken ct)
    {
        var productIds = items.Select(i => i.ProductId).Distinct().ToList();
        var found = (await products.ListByIdsAsync(tenant.TenantId, productIds, ct)).ToDictionary(p => p.Id);
        var definitions = await catalog.SpecDefinitions.AsNoTracking().Where(d => d.TenantId == tenant.TenantId).ToListAsync(ct);
        var listed = (await meli.ItemLinks.AsNoTracking()
            .Where(l => l.TenantId == TenantId && productIds.Contains(l.ProductId))
            .Select(l => l.ProductId).Distinct().ToListAsync(ct)).ToHashSet();

        return [.. items.Select(item => ToDto(item, found.GetValueOrDefault(item.ProductId), definitions, listed.Contains(item.ProductId)))];
    }

    private static AiCatalogItemDto ToDto(
        AiCatalogJobItem item, Product? product, IReadOnlyList<SpecDefinition> definitions, bool hasListing)
    {
        var state = AiCatalogItemState.FromJson(item.ProposalJson);
        var names = definitions.ToDictionary(d => d.Id, d => d.Name);
        var current = product is null
            ? new AiCatalogCurrentDto("(producto eliminado)", null, null, null, null, [])
            : new AiCatalogCurrentDto(
                product.Name, product.Description, product.SeoTitle, product.SeoDescription, product.Brand,
                [.. product.Specs.Where(s => names.ContainsKey(s.DefinitionId)).Select(s => new AiCatalogSpecDto(names[s.DefinitionId], s.Value))]);

        var mapping = product is null ? [] : MappedDefinitions(product, definitions);
        var asked = state.Asked.ToDictionary(a => a.Id, StringComparer.OrdinalIgnoreCase);
        var proposed = state.Proposal is null
            ? null
            : new AiCatalogProposalDto(
                state.Proposal.Description, state.Proposal.SeoTitle, state.Proposal.SeoDescription,
                [.. state.Proposal.Attributes.Where(a => !a.Missing).Select(a => new AiCatalogProposedAttributeDto(
                    a.Id,
                    asked.TryGetValue(a.Id, out var definition) ? definition.Name : a.Id,
                    string.Join(' ', new[] { a.ValueName, a.Unit }.Where(s => !string.IsNullOrWhiteSpace(s))),
                    a.ValueId, a.ValueName, a.Unit,
                    mapping.TryGetValue(a.Id, out var spec) && SpecValue(spec, a) is not null ? "spec" : "meli"))]);

        // Lo que se pidió y no tiene un valor válido en la propuesta: eso le falta a la ficha para Mercado Libre.
        var filled = state.Proposal?.Attributes.Where(a => !a.Missing).Select(a => a.Id).ToHashSet(StringComparer.OrdinalIgnoreCase) ?? [];
        var missing = item.Status == AiCatalogItemStatus.Review
            ? state.Asked.Where(a => !filled.Contains(a.Id)).Select(ToMissing).ToArray()
            : [];

        return new AiCatalogItemDto(
            item.Id, item.ProductId, item.Status.ToString(), state.Passed, item.Attempts, item.JudgeScore, item.JudgeNotes,
            current, proposed, missing,
            state.Category is { } category ? new AiCatalogCategoryDto(category.Id, category.Name) : null,
            [.. state.Suggestions.Select(s => new AiCatalogCategoryDto(s.CategoryId, s.CategoryName))],
            hasListing, state.FailureReason);
    }

    private static AiCatalogMissingDto ToMissing(MeliCategoryAttribute a) => new(
        a.Id, a.Name, a.Kind.ToString(),
        [.. a.Values.Take(MaxMissingValues).Select(v => new AiCatalogValueDto(v.Id, v.Name))],
        [.. a.AllowedUnits], a.DefaultUnit, a.Required);
}
