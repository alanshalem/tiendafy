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

/// <summary>
/// Si una tarea se puede usar en esta tienda y, si no, por qué: <c>Reason</c> en castellano para el panel y
/// <c>Code</c> (el código del error, p. ej. <c>Ai.Disabled</c>) para que el panel decida sin leer el texto.
/// </summary>
public sealed record AiTaskAvailability(AiTask Task, bool Available, string? Reason, string? Code);

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
/// tarea sin modelo → apagado de la tienda → clave del modelo → corte por fallas → reserva del peor
/// caso → cuerpo con el tiempo máximo de la tarea → respaldo una vez si el principal se cae.
/// Solo una excepción que salió del proveedor (la marca <see cref="MeteringChatClient"/>) pasa al
/// respaldo o cuenta para el corte; cualquier otra del cuerpo es <see cref="AiErrors.Failed"/>.
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
        AiTenantConfigSnapshot? snapshot = null;
        if (!configuration.GetValue<bool>(DisabledKey)) snapshot = await config.LoadAsync(tenantId, ct);

        return AiTaskSpecs.All
            .Select(spec => (snapshot is null ? AiErrors.DisabledGlobally : Resolve(snapshot, spec).Error) is { } error
                ? new AiTaskAvailability(spec.Task, false, error.Message, error.Code)
                : new AiTaskAvailability(spec.Task, true, null, null))
            .ToList();
    }

    public async Task<Result<T>> RunAsync<T>(AiTask task, AiRunOptions options,
        Func<AiRunContext, CancellationToken, Task<T>> body, CancellationToken ct)
    {
        if (configuration.GetValue<bool>(DisabledKey)) return Result.Failure<T>(AiErrors.DisabledGlobally);

        // La tienda de las opciones es para workers: en un request no puede ser otra que la del request.
        if (options.TenantId is { } optionsTenant && tenant.HasTenant && optionsTenant != tenant.TenantId.Value)
            throw new InvalidOperationException("AiRunOptions.TenantId no coincide con la tienda del request.");
        var tenantId = options.TenantId ?? RequestTenant();
        var userId = options.UserId ?? http.HttpContext?.User.GetUserId();
        var snapshot = await config.LoadAsync(tenantId, ct);

        // Resolve decide también la tienda apagada, en el mismo orden que AvailabilityAsync.
        var spec = AiTaskSpecs.For(task);
        var (primary, fallback, blocked) = Resolve(snapshot, spec);
        if (blocked is not null) return Result.Failure<T>(blocked);

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
            using var timeout = new CancellationTokenSource(spec.Timeout, clock);
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token);
            try
            {
                // Adentro del try: si el constructor de un SDK lanza, también se clasifica.
                using var client = factory.Create(model.Provider, key, model.Id, spec.MaxOutputTokens);
                var metered = new MeteringChatClient(
                    client, recorder, new AiUsageEntry(tenantId, userId, task, model, runId, 0, 0, 0, outcome),
                    reservation, loggers.CreateLogger<MeteringChatClient>());
                var value = await body(new AiRunContext(runId, spec, model, metered), linked.Token);
                breaker.RecordSuccess(tenantId, model.Provider);
                return Result.Success(value);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                var failure = Classify(ex, timeout.IsCancellationRequested);
                if (failure == AiFailure.NotProvider)
                {
                    // No salió del proveedor (herramienta, parseo, base): se loguea entera, no puede traer la clave.
                    _logger.LogError(ex, "Falló la tarea {Task} con {Model} por algo que no es el proveedor.", task, model.Id);
                    return Result.Failure<T>(AiErrors.Failed);
                }

                // Sin la excepción: el cuerpo de un error del proveedor puede traer fragmentos de la clave.
                _logger.LogWarning("Falló {Model} en la tarea {Task}: {Failure} (HTTP {Status}).",
                    model.Id, task, failure, HttpStatusOf(ex));
                switch (failure)
                {
                    case AiFailure.Unknown:
                        return Result.Failure<T>(AiErrors.Failed);
                    case AiFailure.Auth:
                        return Result.Failure<T>(AiErrors.BadKey(model.Provider));
                    case AiFailure.Rejected:
                        return Result.Failure<T>(AiErrors.Rejected);
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
    /// respaldo que no cumple lo mismo, o que es el mismo modelo, se ignora. Una tarea sin modelo es
    /// <see cref="AiErrors.NotConfigured"/> antes que <see cref="AiErrors.Disabled"/>: en una tienda que
    /// nunca armó la IA el panel no muestra el botón; con modelo y la tienda apagada, lo muestra deshabilitado.
    /// </summary>
    private static (AiModelInfo? Primary, AiModelInfo? Fallback, Error? Error) Resolve(
        AiTenantConfigSnapshot snapshot, AiTaskSpec spec)
    {
        if (!snapshot.Assignments.TryGetValue(spec.Task, out var assigned)
            || AiModelCatalog.Find(assigned.Primary) is not { } primary
            || !Fits(primary, spec))
            return (null, null, AiErrors.NotConfigured);
        if (!snapshot.Enabled) return (null, null, AiErrors.Disabled);
        if (!snapshot.ProvidersWithKey.Contains(primary.Provider))
            return (null, null, AiErrors.MissingKey(primary.Provider));

        var fallback = assigned.Fallback is { } id ? AiModelCatalog.Find(id) : null;
        if (fallback is null || fallback == primary || !Fits(fallback, spec) || !snapshot.ProvidersWithKey.Contains(fallback.Provider))
            fallback = null;
        return (primary, fallback, null);
    }

    private static bool Fits(AiModelInfo model, AiTaskSpec spec) => (model.Capabilities & spec.Requires) == spec.Requires;

    internal enum AiFailure
    {
        /// <summary>
        /// Salió del proveedor pero no se reconoce como una falla suya (un bug de un adaptador, por
        /// ejemplo): <see cref="AiErrors.Failed"/>, sin respaldo ni corte.
        /// </summary>
        Unknown,
        /// <summary>No salió del proveedor (una herramienta, el parseo, la base): <see cref="AiErrors.Failed"/>, sin respaldo ni corte.</summary>
        NotProvider,
        /// <summary>429, 408, 5xx, red o un error del SDK sin estado HTTP: pasa al respaldo y cuenta para el corte por fallas.</summary>
        Transient,
        /// <summary>Venció el tiempo máximo de la tarea: igual que <see cref="Transient"/>.</summary>
        TimedOut,
        /// <summary>401, 402, 403, o un 400 que habla de la clave o del saldo. Sin respaldo.</summary>
        Auth,
        /// <summary>Cualquier otro 4xx (un pedido demasiado largo, por ejemplo). Sin respaldo ni corte.</summary>
        Rejected,
    }

    /// <summary>
    /// Si venció el tiempo de la tarea, cualquier excepción es un timeout. Si no, solo una excepción
    /// marcada por <see cref="MeteringChatClient"/> es del proveedor: una herramienta que tira un
    /// <see cref="HttpRequestException"/> no es una caída del modelo. Cada SDK informa el estado HTTP a
    /// su manera: primero se busca un estado en la excepción o en las de adentro; si no hay, una
    /// excepción de un SDK de proveedor es una falla pasajera (nunca un 500).
    /// </summary>
    internal static AiFailure Classify(Exception ex, bool timedOut)
    {
        if (timedOut) return AiFailure.TimedOut;
        if (!MeteringChatClient.CameFromProvider(ex)) return AiFailure.NotProvider;
        for (var e = ex; e is not null; e = e.InnerException)
        {
            var failure = e switch
            {
                AnthropicApiException a => ByStatus((int)a.StatusCode, $"{a.ErrorType} {a.ResponseBody}"),
                AnthropicIOException => AiFailure.Transient,
                // Status 0 (Google y OpenAI/Groq): no hubo respuesta; lo resuelve la segunda pasada.
                Google.GenAI.ApiException { StatusCode: not 0 } g => ByStatus(g.StatusCode, $"{g.Status} {g.Message}"),
                ClientResultException { Status: not 0 } c => ByStatus(c.Status, $"{c.Message} {RawContent(c)}"),
                Google.GenAI.ApiException or ClientResultException => AiFailure.Unknown,
                HttpRequestException h => h.StatusCode is { } status ? ByStatus((int)status, h.Message) : AiFailure.Transient,
                // Un timeout propio del HttpClient (no el de la tarea ni el del llamador).
                TimeoutException or OperationCanceledException => AiFailure.Transient,
                _ => AiFailure.Unknown,
            };
            if (failure != AiFailure.Unknown) return failure;
        }

        // Sin estado HTTP: si es de un SDK (datos inválidos, sin respuesta), es del proveedor.
        for (var e = ex; e is not null; e = e.InnerException)
        {
            if (e is AnthropicException or ClientResultException or Google.GenAI.ApiException)
                return AiFailure.Transient;
        }
        return AiFailure.Unknown;
    }

    /// <summary>
    /// Solo el número de estado HTTP, para loguear sin la excepción: el cuerpo de un 401 puede traer
    /// la clave enmascarada. Null si no hay uno.
    /// </summary>
    internal static int? HttpStatusOf(Exception ex)
    {
        for (var e = ex; e is not null; e = e.InnerException)
        {
            int? status = e switch
            {
                AnthropicApiException a => (int)a.StatusCode,
                Google.GenAI.ApiException { StatusCode: not 0 } g => g.StatusCode,
                ClientResultException { Status: not 0 } c => c.Status,
                HttpRequestException { StatusCode: { } h } => (int)h,
                _ => null,
            };
            if (status is not null) return status;
        }
        return null;
    }

    /// <summary>
    /// Un 400 es la clave solo si el proveedor lo dice (tipo, código o mensaje): Anthropic contesta
    /// 400 "credit balance is too low" y Google 400 "API key not valid". Cualquier otro 400 es el pedido.
    /// </summary>
    private static AiFailure ByStatus(int status, string detail) => status switch
    {
        (int)HttpStatusCode.TooManyRequests or (int)HttpStatusCode.RequestTimeout or >= 500 => AiFailure.Transient,
        (int)HttpStatusCode.Unauthorized or (int)HttpStatusCode.PaymentRequired or (int)HttpStatusCode.Forbidden => AiFailure.Auth,
        (int)HttpStatusCode.BadRequest when SpeaksOfKey(detail) => AiFailure.Auth,
        _ => AiFailure.Rejected,
    };

    private static readonly string[] KeyWords = ["auth", "api key", "api_key", "apikey", "billing", "credit", "balance"];

    private static bool SpeaksOfKey(string detail) =>
        KeyWords.Any(w => detail.Contains(w, StringComparison.OrdinalIgnoreCase));

    private static string RawContent(ClientResultException c)
    {
        try
        {
            return c.GetRawResponse()?.Content?.ToString() ?? "";
        }
        catch (InvalidOperationException)
        {
            // El cuerpo no se bufereó: alcanza con el mensaje.
            return "";
        }
    }
}
