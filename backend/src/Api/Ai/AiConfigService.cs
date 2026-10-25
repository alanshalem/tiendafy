using Ai.Infrastructure;
using Api.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Ai;

public sealed record AiProviderDto(string Provider, bool Configured, string? Last4, bool? LastTestOk, DateTime? LastTestAt);

public sealed record AiAssignmentDto(string Task, string PrimaryModel, string? FallbackModel);

/// <summary>El tope viaja en dólares (decimal); en el servidor es <c>MonthlyBudgetMicroUsd</c>.</summary>
public sealed record AiSettingsDto(bool Enabled, decimal MonthlyBudgetUsd, int AlertThresholdPct);

/// <summary>Lo que el panel ofrece para una tarea: modelos elegibles, sugeridos y un aviso si hay algo para corregir.</summary>
public sealed record AiTaskOptionsDto(string Task, string Label, string[] EligibleModels, string[] SuggestedModels, string? Warning);

public sealed record AiConfigDto(
    AiProviderDto[] Providers,
    AiAssignmentDto[] Assignments,
    AiSettingsDto Settings,
    AiTaskOptionsDto[] Tasks);

public sealed record AiAssignmentItem(string? Task, string? PrimaryModel, string? FallbackModel);

public sealed record AiTestResult(bool Ok, string Message);

/// <summary>
/// Configuración de IA de la tienda del request: claves, modelos por tarea y tope. Scoped (usa el
/// <see cref="AiDbContext"/> del request, filtrado por tienda). Ninguna respuesta lleva una clave.
/// </summary>
public sealed class AiConfigService(
    AiDbContext db,
    ITenantContext tenant,
    IAiKeyProtector keys,
    IAiTenantConfig tenantConfig,
    IAiChatClientFactory factory,
    IAiUsageRecorder recorder,
    IHttpContextAccessor http,
    TimeProvider clock,
    ILoggerFactory loggers)
{
    private const int MinKeyLength = 8;
    private const decimal MaxMonthlyBudgetUsd = 100_000m;
    private const long MicroPerUsd = 1_000_000;

    private static readonly Dictionary<AiTask, string> TaskLabels = new()
    {
        [AiTask.QuestionClassify] = "Clasificar preguntas",
        [AiTask.QuestionDraft] = "Redactar respuestas",
        [AiTask.DataAssistant] = "Asistente de datos",
        [AiTask.CatalogWrite] = "Redactar fichas de productos",
        [AiTask.CatalogJudge] = "Evaluar fichas de productos",
        [AiTask.InvoiceRead] = "Leer facturas",
        [AiTask.ShortText] = "Textos cortos (posts y descripciones)",
    };

    private Guid TenantId => tenant.TenantId.Value;

    public static bool TryParseProvider(string? raw, out AiProvider provider) => TryParseName(raw, out provider);

    /// <summary>Por nombre y nada más: un número suelto ("7") no cuenta aunque el enum lo acepte.</summary>
    private static bool TryParseName<T>(string? raw, out T value) where T : struct, Enum =>
        Enum.TryParse(raw, ignoreCase: true, out value) && Enum.IsDefined(value) && !int.TryParse(raw, out _);

    public async Task<AiConfigDto> GetAsync(CancellationToken ct)
    {
        var credentials = await db.Credentials.AsNoTracking().Where(c => c.TenantId == TenantId).ToListAsync(ct);
        var assignments = await db.Assignments.AsNoTracking().Where(a => a.TenantId == TenantId).ToListAsync(ct);
        var settings = await db.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == TenantId, ct);

        var providers = Enum.GetValues<AiProvider>()
            .Select(p => credentials.FirstOrDefault(c => c.Provider == p) is { } c
                ? new AiProviderDto(p.ToString(), true, c.Last4, c.LastTestOk, c.LastTestAtUtc)
                : new AiProviderDto(p.ToString(), false, null, null, null))
            .ToArray();

        var configured = credentials.Select(c => c.Provider).ToHashSet();
        var primaries = assignments.ToDictionary(a => a.Task, a => AiModelCatalog.Find(a.PrimaryModel));
        var tasks = AiTaskSpecs.All.Select(spec =>
        {
            var eligible = AiModelCatalog.Eligible(spec.Task, configured).ToList();
            var suggested = eligible.Where(m => m.Cheap == spec.Cheap).Select(m => m.Id).ToArray();
            return new AiTaskOptionsDto(spec.Task.ToString(), TaskLabels[spec.Task],
                [.. eligible.Select(m => m.Id)], suggested, Warning(spec.Task, primaries));
        }).ToArray();

        return new AiConfigDto(
            providers,
            [.. assignments.Select(a => new AiAssignmentDto(a.Task.ToString(), a.PrimaryModel, a.FallbackModel))],
            settings is null
                ? new AiSettingsDto(false, 0m, AiSettings.DefaultAlertThresholdPct)
                : new AiSettingsDto(settings.Enabled, settings.MonthlyBudgetMicroUsd / (decimal)MicroPerUsd, settings.AlertThresholdPct),
            tasks);
    }

    /// <summary>El evaluador de fichas tiene que ser de otro proveedor que el redactor, o aprueba su propio trabajo.</summary>
    private static string? Warning(AiTask task, Dictionary<AiTask, AiModelInfo?> primaries) =>
        task == AiTask.CatalogJudge
        && primaries.GetValueOrDefault(AiTask.CatalogJudge) is { } judge
        && primaries.GetValueOrDefault(AiTask.CatalogWrite) is { } writer
        && judge.Provider == writer.Provider
            ? "Conviene que evalúe un modelo de otro proveedor."
            : null;

    /// <summary>Guarda la clave. Vacía = conserva la guardada (y falla si no hay ninguna).</summary>
    public async Task<Result> SaveKeyAsync(AiProvider provider, string? apiKey, CancellationToken ct)
    {
        var existing = await db.Credentials.FirstOrDefaultAsync(c => c.TenantId == TenantId && c.Provider == provider, ct);
        var key = apiKey?.Trim();
        if (string.IsNullOrEmpty(key))
        {
            return existing is null
                ? Result.Failure(Error.Validation("Ai.KeyMissing", $"Pegá la clave de {provider}."))
                : Result.Success();
        }
        if (key.Length < MinKeyLength)
            return Result.Failure(Error.Validation("Ai.KeyInvalid", $"La clave de {provider} es demasiado corta."));

        var encrypted = keys.Protect(key);
        var last4 = key[^4..];
        if (existing is null) db.Credentials.Add(AiProviderCredential.Create(TenantId, provider, encrypted, last4));
        else existing.ReplaceKey(encrypted, last4);
        await db.SaveChangesAsync(ct);
        return Result.Success();
    }

    /// <summary>Borra la clave. Las asignaciones quedan: el gateway las informa como no disponibles ("Falta la clave de …").</summary>
    public async Task DeleteKeyAsync(AiProvider provider, CancellationToken ct)
    {
        var existing = await db.Credentials.FirstOrDefaultAsync(c => c.TenantId == TenantId && c.Provider == provider, ct);
        if (existing is null) return;
        db.Credentials.Remove(existing);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Prueba la clave con una llamada mínima al modelo más barato del proveedor, sin depender de que
    /// haya una tarea asignada. Queda en el consumo como <see cref="AiTask.ShortText"/>. Un error de
    /// clave se clasifica igual que en el gateway.
    /// </summary>
    public async Task<Result<AiTestResult>> TestKeyAsync(AiProvider provider, CancellationToken ct)
    {
        var credential = await db.Credentials.FirstOrDefaultAsync(c => c.TenantId == TenantId && c.Provider == provider, ct);
        var key = credential is null ? null : await tenantConfig.KeyAsync(TenantId, provider, ct);
        if (credential is null || key is null)
            return Result.Failure<AiTestResult>(Error.Validation("Ai.KeyMissing", $"Primero cargá la clave de {provider}."));

        var spec = AiTaskSpecs.For(AiTask.ShortText);
        var model = AiModelCatalog.CheapestOf(provider);
        using var client = factory.Create(provider, key, model.Id, spec.MaxOutputTokens);
        var metered = new MeteringChatClient(
            client, recorder,
            new AiUsageEntry(TenantId, http.HttpContext?.User.GetUserId(), AiTask.ShortText, model, Guid.NewGuid(), 0, 0, 0, AiOutcome.Ok),
            reservation: null, loggers.CreateLogger<MeteringChatClient>());

        using var timeout = new CancellationTokenSource(spec.Timeout, clock);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token);
        AiGateway.AiFailure failure;
        try
        {
            await metered.GetResponseAsync(
                [new ChatMessage(ChatRole.User, "ok")], new ChatOptions { MaxOutputTokens = 16 }, linked.Token);
            credential.RecordTest(true, clock.GetUtcNow().UtcDateTime);
            await db.SaveChangesAsync(ct);
            return new AiTestResult(true, $"La conexión con {provider} funciona.");
        }
        catch (Exception ex) when (!ct.IsCancellationRequested
            && (failure = AiGateway.Classify(ex, timeout.IsCancellationRequested)) != AiGateway.AiFailure.Unknown)
        {
            loggers.CreateLogger<AiConfigService>().LogWarning(ex, "Falló la prueba de la clave de {Provider}: {Failure}.", provider, failure);
            if (failure != AiGateway.AiFailure.Auth)
            {
                // Un corte o un pedido rechazado no dice nada de la clave: no pisa el último resultado.
                return new AiTestResult(false, failure == AiGateway.AiFailure.Rejected
                    ? $"{provider} rechazó la prueba."
                    : $"No pudimos comunicarnos con {provider}. Probá de nuevo en unos minutos.");
            }
            credential.RecordTest(false, clock.GetUtcNow().UtcDateTime);
            await db.SaveChangesAsync(ct);
            return new AiTestResult(false, AiErrors.BadKey(provider).Message);
        }
    }

    /// <summary>
    /// Todo o nada. Cada modelo (principal y respaldo) tiene que estar en el catálogo, cumplir lo que
    /// pide la tarea y tener la clave de su proveedor cargada: el gateway ignora un respaldo inválido
    /// sin avisar, así que esta es la única validación.
    /// </summary>
    public async Task<Result> SaveAssignmentsAsync(IReadOnlyList<AiAssignmentItem>? items, CancellationToken ct)
    {
        if (items is null || items.Count == 0)
            return Result.Failure(Error.Validation("Ai.NoAssignments", "No hay modelos para guardar."));

        var configured = await db.Credentials.AsNoTracking().Where(c => c.TenantId == TenantId)
            .Select(c => c.Provider).ToListAsync(ct);
        var providers = configured.ToHashSet();

        var parsed = new List<(AiTask Task, string Primary, string? Fallback)>();
        foreach (var item in items)
        {
            if (!TryParseName<AiTask>(item.Task, out var task))
                return Result.Failure(Error.Validation("Ai.UnknownTask", "Hay una tarea que no existe."));
            if (parsed.Any(p => p.Task == task))
                return Result.Failure(Error.Validation("Ai.DuplicateTask", $"La tarea «{TaskLabels[task]}» está repetida."));

            var primary = item.PrimaryModel?.Trim();
            var fallback = string.IsNullOrWhiteSpace(item.FallbackModel) ? null : item.FallbackModel.Trim();
            if (string.IsNullOrEmpty(primary))
                return Result.Failure(Error.Validation("Ai.ModelMissing", $"Elegí un modelo para «{TaskLabels[task]}»."));
            if (CheckModel(task, primary, providers) is { } primaryError) return Result.Failure(primaryError);
            if (fallback is not null)
            {
                if (fallback == primary)
                    return Result.Failure(Error.Validation("Ai.FallbackSame", $"El respaldo de «{TaskLabels[task]}» tiene que ser otro modelo."));
                if (CheckModel(task, fallback, providers) is { } fallbackError) return Result.Failure(fallbackError);
            }
            parsed.Add((task, primary, fallback));
        }

        var current = await db.Assignments.Where(a => a.TenantId == TenantId).ToListAsync(ct);
        foreach (var (task, primary, fallback) in parsed)
        {
            if (current.FirstOrDefault(a => a.Task == task) is { } existing) existing.Set(primary, fallback);
            else db.Assignments.Add(AiTaskAssignment.Create(TenantId, task, primary, fallback));
        }
        await db.SaveChangesAsync(ct);
        return Result.Success();
    }

    private static Error? CheckModel(AiTask task, string modelId, HashSet<AiProvider> providers)
    {
        var label = TaskLabels[task];
        if (AiModelCatalog.Find(modelId) is not { } model)
            return Error.Validation("Ai.UnknownModel", $"El modelo elegido para «{label}» no existe.");
        var requires = AiTaskSpecs.For(task).Requires;
        if ((model.Capabilities & requires) != requires)
            return Error.Validation("Ai.ModelNotEligible", $"{model.Label} no sirve para «{label}».");
        if (!providers.Contains(model.Provider))
            return Error.Validation("Ai.ModelWithoutKey", $"Cargá primero la clave de {model.Provider} para usar {model.Label}.");
        return null;
    }

    public async Task<Result> SaveSettingsAsync(bool enabled, decimal monthlyBudgetUsd, int alertThresholdPct, CancellationToken ct)
    {
        if (monthlyBudgetUsd < 0 || monthlyBudgetUsd > MaxMonthlyBudgetUsd)
            return Result.Failure(Error.Validation("Ai.BudgetInvalid", "El tope mensual no es válido."));
        if (alertThresholdPct is < 1 or > 100)
            return Result.Failure(Error.Validation("Ai.ThresholdInvalid", "El aviso tiene que estar entre 1 % y 100 %."));
        var micro = (long)decimal.Round(monthlyBudgetUsd * MicroPerUsd, 0, MidpointRounding.AwayFromZero);
        if (enabled && micro <= 0)
            return Result.Failure(Error.Validation("Ai.BudgetRequired", "Para prender la inteligencia artificial, cargá un tope mensual."));

        var settings = await db.Settings.FirstOrDefaultAsync(s => s.TenantId == TenantId, ct);
        if (settings is null)
        {
            settings = AiSettings.CreateDefault(TenantId);
            db.Settings.Add(settings);
        }
        settings.Update(enabled, micro, alertThresholdPct);
        await db.SaveChangesAsync(ct);
        return Result.Success();
    }
}
