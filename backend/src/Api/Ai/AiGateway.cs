using System.ClientModel;
using System.Net;
using Ai.Infrastructure;
using Anthropic.Exceptions;
using Api.Auth;
using Microsoft.Extensions.AI;
using SharedKernel.Abstractions;
using SharedKernel.Common;
using CacheControlEphemeral = Anthropic.Models.Messages.CacheControlEphemeral;

namespace Api.Ai;

/// <summary>Si una tarea se puede usar en esta tienda y, si no, por qué (en castellano, para el panel).</summary>
public sealed record AiTaskAvailability(AiTask Task, bool Available, string? Reason);

/// <summary>
/// <paramref name="EstimatedInputTokens"/> se estima por lo alto (largo del prompt / 3): con eso se
/// reserva el peor caso. <paramref name="TenantId"/> y <paramref name="UserId"/> son solo para
/// workers sin request; en un request salen de la tienda y el usuario del request.
/// </summary>
public sealed record AiRunOptions(int EstimatedInputTokens, Guid? TenantId = null, Guid? UserId = null);

/// <summary>
/// Lo que recibe el cuerpo de una ejecución. Cada intento (principal o respaldo) tiene el suyo.
/// </summary>
public sealed class AiRunContext
{
    private IChatClient? _withTools;

    internal AiRunContext(Guid runId, AiTaskSpec spec, AiModelInfo model, IChatClient chat)
    {
        RunId = runId;
        Spec = spec;
        Model = model;
        Chat = chat;
    }

    public Guid RunId { get; }
    public AiTaskSpec Spec { get; }
    public AiModelInfo Model { get; }

    /// <summary>Medido (cada respuesta queda en el consumo), sin herramientas.</summary>
    public IChatClient Chat { get; }

    /// <summary>
    /// Opciones nuevas con el tope de salida de la tarea y, en Claude, su effort.
    /// Nunca lleva <c>temperature</c>: la API de Claude la rechaza.
    /// </summary>
    public ChatOptions NewOptions()
    {
        var options = new ChatOptions { MaxOutputTokens = Spec.MaxOutputTokens };
        if (Model.Provider == AiProvider.Anthropic && Effort(Spec.ClaudeEffort) is { } effort)
            options.Reasoning = new ReasoningOptions { Effort = effort };
        return options;
    }

    /// <summary>
    /// El system prompt de la tarea. Tiene que ser constante (nada de fechas ni ids adentro) para que
    /// el proveedor lo cachee: en Anthropic se marca con <c>WithCacheControl</c>; OpenAI y Google cachean solos.
    /// </summary>
    public ChatMessage System(string stableText)
    {
        var content = new TextContent(stableText);
        if (Model.Provider == AiProvider.Anthropic)
            content.WithCacheControl(new CacheControlEphemeral());
        return new ChatMessage(ChatRole.System, [content]);
    }

    /// <summary>
    /// <see cref="Chat"/> con el bucle de herramientas, cortado en las vueltas máximas de la tarea.
    /// Las herramientas se declaran con <c>AIFunctionFactory.Create(closure, name, description)</c> y
    /// son todas de lectura: el closure captura la tienda y los ids; el modelo no elige ninguno.
    /// </summary>
    /// <remarks>
    /// <see cref="FunctionInvokingChatClient"/> hace sus N vueltas con herramientas y después una
    /// llamada más sin herramientas para que el modelo conteste con lo que tiene. Por eso N es
    /// <c>MaxIterations - 1</c>: así son <c>MaxIterations</c> llamadas en total, las que reserva el tope.
    /// </remarks>
    public IChatClient WithTools()
    {
        if (Spec.MaxIterations < 2)
            throw new InvalidOperationException($"La tarea {Spec.Task} no usa herramientas (una sola vuelta).");
        return _withTools ??= new FunctionInvokingChatClient(Chat)
        {
            MaximumIterationsPerRequest = Spec.MaxIterations - 1,
            MaximumConsecutiveErrorsPerRequest = 2,
        };
    }

    private static ReasoningEffort? Effort(string? effort) => effort switch
    {
        "low" => ReasoningEffort.Low,
        "medium" => ReasoningEffort.Medium,
        "high" => ReasoningEffort.High,
        _ => null,
    };
}

/// <summary>Única puerta a los modelos: ninguna función de IA crea un cliente por su cuenta.</summary>
public interface IAiGateway
{
    /// <summary>Qué tareas se pueden usar en la tienda del request.</summary>
    Task<IReadOnlyList<AiTaskAvailability>> AvailabilityAsync(CancellationToken ct);

    /// <summary>
    /// Ejecuta <paramref name="body"/> contra el modelo asignado a la tarea. <paramref name="body"/> tiene
    /// que ser de solo lectura: si el principal se cae, se vuelve a ejecutar entero con el respaldo.
    /// </summary>
    Task<Result<T>> RunAsync<T>(AiTask task, AiRunOptions options,
        Func<AiRunContext, CancellationToken, Task<T>> body, CancellationToken ct);
}

/// <summary>
/// Scoped: toma la tienda y el usuario del request. En orden: apagado global (<c>Ai:Disabled</c>) →
/// apagado de la tienda → modelo asignado con clave → corte por fallas → reserva del peor caso →
/// cuerpo con el tiempo máximo de la tarea → respaldo una vez si el principal se cae.
/// </summary>
public sealed class AiGateway(
    IConfiguration configuration,
    ITenantContext tenant,
    IHttpContextAccessor http,
    IAiTenantConfig config,
    AiBudget budget,
    AiCircuitBreaker breaker,
    IAiChatClientFactory factory,
    IAiUsageRecorder recorder,
    TimeProvider clock,
    ILoggerFactory loggers) : IAiGateway
{
    public const string DisabledKey = "Ai:Disabled";

    private readonly ILogger _logger = loggers.CreateLogger<AiGateway>();

    public async Task<IReadOnlyList<AiTaskAvailability>> AvailabilityAsync(CancellationToken ct)
    {
        var tenantId = RequestTenant();
        Error? blocked = null;
        AiTenantConfigSnapshot? snapshot = null;
        if (configuration.GetValue<bool>(DisabledKey)) blocked = AiErrors.DisabledGlobally;
        else
        {
            snapshot = await config.LoadAsync(tenantId, ct);
            if (!snapshot.Enabled) blocked = AiErrors.Disabled;
        }

        return AiTaskSpecs.All
            .Select(spec => (blocked ?? Resolve(snapshot!, spec).Error) is { } error
                ? new AiTaskAvailability(spec.Task, false, error.Message)
                : new AiTaskAvailability(spec.Task, true, null))
            .ToList();
    }

    public async Task<Result<T>> RunAsync<T>(AiTask task, AiRunOptions options,
        Func<AiRunContext, CancellationToken, Task<T>> body, CancellationToken ct)
    {
        if (configuration.GetValue<bool>(DisabledKey)) return Result.Failure<T>(AiErrors.DisabledGlobally);

        var tenantId = options.TenantId ?? RequestTenant();
        var userId = options.UserId ?? http.HttpContext?.User.GetUserId();
        var snapshot = await config.LoadAsync(tenantId, ct);
        if (!snapshot.Enabled) return Result.Failure<T>(AiErrors.Disabled);

        var spec = AiTaskSpecs.For(task);
        var (primary, fallback, notConfigured) = Resolve(snapshot, spec);
        if (notConfigured is not null) return Result.Failure<T>(notConfigured);

        // Con el principal dado por caído se va directo al respaldo.
        var attempts = new List<AiModelInfo>(2);
        if (!breaker.IsOpen(tenantId, primary!.Provider)) attempts.Add(primary);
        if (fallback is not null && !breaker.IsOpen(tenantId, fallback.Provider)) attempts.Add(fallback);
        if (attempts.Count == 0) return Result.Failure<T>(AiErrors.Unavailable);

        var runId = Guid.NewGuid();
        var lastError = AiErrors.Unavailable;
        foreach (var model in attempts)
        {
            // Una reserva por intento, del modelo que va a correr. Al liberarla queda solo lo real.
            await using var reservation = await budget.TryReserveAsync(
                tenantId, snapshot.MonthlyBudgetMicroUsd, AiCost.WorstCaseMicroUsd(model, spec, options.EstimatedInputTokens), ct);
            if (reservation is null) return Result.Failure<T>(AiErrors.Budget);

            var key = await config.KeyAsync(tenantId, model.Provider, ct);
            if (key is null) return Result.Failure<T>(AiErrors.MissingKey(model.Provider));

            var outcome = ReferenceEquals(model, primary) ? AiOutcome.Ok : AiOutcome.Fallback;
            using var client = factory.Create(model.Provider, key, model.Id, spec.MaxOutputTokens);
            var metered = new MeteringChatClient(
                client, recorder, new AiUsageEntry(tenantId, userId, task, model, runId, 0, 0, 0, outcome),
                reservation, loggers.CreateLogger<MeteringChatClient>());

            using var timeout = new CancellationTokenSource(spec.Timeout, clock);
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token);
            AiFailure failure;
            try
            {
                var value = await body(new AiRunContext(runId, spec, model, metered), linked.Token);
                breaker.RecordSuccess(tenantId, model.Provider);
                return Result.Success(value);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested
                && (failure = Classify(ex, timeout.IsCancellationRequested)) != AiFailure.Unknown)
            {
                _logger.LogWarning(ex, "Falló {Model} en la tarea {Task}: {Failure}.", model.Id, task, failure);
                switch (failure)
                {
                    case AiFailure.Auth:
                        return Result.Failure<T>(AiErrors.BadKey(model.Provider));
                    case AiFailure.Rejected:
                        return Result.Failure<T>(AiErrors.Unavailable);
                    default:
                        breaker.RecordFailure(tenantId, model.Provider);
                        lastError = failure == AiFailure.TimedOut ? AiErrors.TimedOut : AiErrors.Unavailable;
                        break;
                }
            }
        }

        return Result.Failure<T>(lastError);
    }

    private Guid RequestTenant() =>
        tenant.HasTenant
            ? tenant.TenantId.Value
            : throw new InvalidOperationException("El gateway de IA necesita una tienda: sin request, pasala en AiRunOptions.TenantId.");

    /// <summary>
    /// Principal y respaldo de la tarea. El principal tiene que existir en el catálogo, cumplir lo que
    /// pide la tarea y tener clave; si no, es el error (su mensaje es el motivo que ve el panel). Un
    /// respaldo que no cumple lo mismo, o que es el mismo modelo, se ignora.
    /// </summary>
    private static (AiModelInfo? Primary, AiModelInfo? Fallback, Error? Error) Resolve(
        AiTenantConfigSnapshot snapshot, AiTaskSpec spec)
    {
        if (!snapshot.Assignments.TryGetValue(spec.Task, out var assigned)
            || AiModelCatalog.Find(assigned.Primary) is not { } primary
            || !Fits(primary, spec))
            return (null, null, AiErrors.NotConfigured);
        if (!snapshot.ProvidersWithKey.Contains(primary.Provider))
            return (null, null, AiErrors.MissingKey(primary.Provider));

        var fallback = assigned.Fallback is { } id ? AiModelCatalog.Find(id) : null;
        if (fallback is null || fallback == primary || !Fits(fallback, spec) || !snapshot.ProvidersWithKey.Contains(fallback.Provider))
            fallback = null;
        return (primary, fallback, null);
    }

    private static bool Fits(AiModelInfo model, AiTaskSpec spec) => (model.Capabilities & spec.Requires) == spec.Requires;

    private enum AiFailure
    {
        /// <summary>No es del proveedor (un bug del cuerpo): se relanza.</summary>
        Unknown,
        /// <summary>429, 408, 5xx o red: pasa al respaldo y cuenta para el corte por fallas.</summary>
        Transient,
        /// <summary>Venció el tiempo máximo de la tarea: igual que <see cref="Transient"/>.</summary>
        TimedOut,
        /// <summary>400, 401, 402 o 403: la clave no sirve o no tiene saldo. Sin respaldo.</summary>
        Auth,
        /// <summary>Otro 4xx: el pedido no es válido para el proveedor. Sin respaldo.</summary>
        Rejected,
    }

    /// <summary>
    /// Cada SDK informa el estado HTTP a su manera; se mira la excepción y las de adentro, y gana la
    /// primera que se reconoce. Si venció el tiempo de la tarea, cualquier excepción es un timeout.
    /// </summary>
    private static AiFailure Classify(Exception ex, bool timedOut)
    {
        if (timedOut) return AiFailure.TimedOut;
        for (var e = ex; e is not null; e = e.InnerException)
        {
            var failure = e switch
            {
                AnthropicApiException a => ByStatus((int)a.StatusCode),
                AnthropicIOException => AiFailure.Transient,
                // Status 0 (Google y OpenAI/Groq): no hubo respuesta, es una falla de red.
                Google.GenAI.ApiException g => g.StatusCode == 0 ? AiFailure.Transient : ByStatus(g.StatusCode),
                ClientResultException c => c.Status == 0 ? AiFailure.Transient : ByStatus(c.Status),
                HttpRequestException h => h.StatusCode is { } status ? ByStatus((int)status) : AiFailure.Transient,
                // Un timeout propio del HttpClient (no el de la tarea ni el del llamador).
                TimeoutException or OperationCanceledException => AiFailure.Transient,
                _ => AiFailure.Unknown,
            };
            if (failure != AiFailure.Unknown) return failure;
        }
        return AiFailure.Unknown;
    }

    private static AiFailure ByStatus(int status) => status switch
    {
        (int)HttpStatusCode.TooManyRequests or (int)HttpStatusCode.RequestTimeout or >= 500 => AiFailure.Transient,
        (int)HttpStatusCode.BadRequest or (int)HttpStatusCode.Unauthorized
            or (int)HttpStatusCode.PaymentRequired or (int)HttpStatusCode.Forbidden => AiFailure.Auth,
        _ => AiFailure.Rejected,
    };
}
