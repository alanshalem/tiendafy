using Ai.Infrastructure;
using Api.Ai;
using Api.Auth;
using Identity.Infrastructure;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Sugerencias con IA: responder preguntas de ML y del chat posventa, redactar posts para redes y
/// describir productos. Los prompts viven ACÁ (server-side); el browser solo manda el contexto y recibe
/// texto editable — la IA sugiere, el merchant decide. Todo pasa por el gateway: el modelo, la clave y
/// el tope los pone cada tienda.
/// </summary>
public static class AiEndpoints
{
    public const string SocialPost = "social-post";
    public const string ProductDescription = "product-description";

    public static RouteGroupBuilder MapAiEndpoints(this RouteGroupBuilder group)
    {
        var ai = group.MapGroup("/ai").RequireTenant();

        // Gating para el front: qué funciones puede usar ESTA persona en esta tienda. Una función sin
        // permiso figura como no disponible, así que sus botones no aparecen. Pide sesión y tienda,
        // nada más: no expone nada que el permiso proteja (solo si está configurada).
        ai.MapGet("/status", async (
            IAiGateway gateway, IAccessService accessService, ITenantContext tenant, HttpContext http, CancellationToken ct) =>
        {
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();

            var access = await accessService.GetAsync(userId.Value, tenant.TenantId.Value, ct);
            var tasks = await gateway.AvailabilityAsync(ct);
            return Results.Ok(new
            {
                tasks = tasks.Select(t => AiTaskPermissions.Allows(access, t.Task)
                    ? new { task = t.Task.ToString(), available = t.Available, reason = t.Reason, code = t.Code }
                    : new { task = t.Task.ToString(), available = false, reason = (string?)AiTaskPermissions.Denied, code = (string?)AiTaskPermissions.DeniedCode }),
            });
        }).RequireAuthorization();

        // Respuesta sugerida para una pregunta prevente de Mercado Libre.
        ai.MapPost("/ml-answer", async (
            AiMlAnswerRequest request, IAiGateway gateway, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Question))
                return Error.Validation("Ai.NoQuestion", "Falta la pregunta.").ToProblem();

            var result = await gateway.CompleteAsync(
                AiTask.QuestionDraft,
                "Sos el vendedor de una tienda argentina en Mercado Libre. Respondés preguntas de compradores: " +
                "cordial, directo, en argentino neutro (vos/tenés), sin inventar datos que no tengas — si no sabés " +
                "un dato técnico, decí que lo confirmás por mensaje. Máximo 2 oraciones. Sin saludos largos ni firmas. " +
                "Respondé SOLO con el texto de la respuesta.",
                $"Publicación: {Text.Clip(request.ItemTitle ?? "(sin título)", 200)}\nPregunta del comprador: {Text.Clip(request.Question, 500)}",
                ct);
            return result.IsSuccess ? Results.Ok(new { text = result.Value }) : result.Error.ToProblem();
        }).RequirePermission(Permission.MeliOperate).RequireAiRateLimit(AiRateLimitKind.PerUser);

        // Respuesta sugerida para el chat posventa (con el contexto del pedido).
        ai.MapPost("/support-reply", async (
            AiSupportReplyRequest request, IAiGateway gateway, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Message))
                return Error.Validation("Ai.NoMessage", "Falta el mensaje del cliente.").ToProblem();

            var context = string.IsNullOrWhiteSpace(request.OrderSummary)
                ? ""
                : $"\nContexto del pedido: {Text.Clip(request.OrderSummary!, 600)}";
            var result = await gateway.CompleteAsync(
                AiTask.QuestionDraft,
                "Sos atención al cliente de una tienda online argentina, en el chat posventa de un pedido. " +
                "Empático y resolutivo, argentino neutro (vos/tenés), máximo 3 oraciones. Usá el contexto del " +
                "pedido si ayuda, pero NO inventes fechas de entrega, números de seguimiento ni políticas que no " +
                "estén en el contexto: si falta un dato, ofrecé confirmarlo. Respondé SOLO con el texto.",
                $"Mensaje del cliente: {Text.Clip(request.Message, 800)}{context}",
                ct);
            return result.IsSuccess ? Results.Ok(new { text = result.Value }) : result.Error.ToProblem();
        }).RequirePermission(Permission.SupportChat).RequireAiRateLimit(AiRateLimitKind.PerUser);

        // Textos cortos para el comercio: un post para redes o la descripción de un producto. El permiso
        // depende del tipo, así que se mira dentro (la ruta pide cualquiera de los dos).
        ai.MapPost("/short-text", async (
            AiShortTextRequest request, IAiGateway gateway, HttpContext http, CancellationToken ct) =>
        {
            var permission = request.Kind switch
            {
                SocialPost => Permission.SocialPublish,
                ProductDescription => Permission.CatalogWrite,
                _ => (Permission?)null,
            };
            if (permission is null)
                return Error.Validation("Ai.BadKind", "No sabemos qué texto generar.").ToProblem();
            if (await AuthExtensions.CheckPermissionAsync(http, permission.Value) is { } denied) return denied;

            var result = request.Kind == SocialPost
                ? await SocialPostAsync(request, gateway, ct)
                : await ProductDescriptionAsync(request, gateway, ct);
            return result.IsSuccess ? Results.Ok(new { text = result.Value }) : result.Error.ToProblem();
        }).RequireAnyPermission(Permission.SocialPublish, Permission.CatalogWrite).RequireAiRateLimit(AiRateLimitKind.PerUser);

        return group;
    }

    /// <summary>Borrador (o mejora) de un post para redes sociales.</summary>
    private static async Task<Result<string>> SocialPostAsync(AiShortTextRequest request, IAiGateway gateway, CancellationToken ct)
    {
        var brief = Text.Clip(request.Draft ?? request.ProductName ?? "", 1500);
        if (string.IsNullOrWhiteSpace(brief))
            return Result.Failure<string>(Error.Validation("Ai.NoBrief", "Escribí un borrador o elegí un producto primero."));

        return await gateway.CompleteAsync(
            AiTask.ShortText,
            "Redactás posts de redes sociales para una tienda online argentina. Tono cercano y vendedor sin " +
            "exagerar, argentino neutro (vos), 1-3 emojis bien puestos, máximo 500 caracteres, con un llamado a " +
            "la acción. Si el borrador incluye un link o un código de cupón, conservalos EXACTOS. " +
            "Respondé SOLO con el texto del post.",
            request.Draft is { Length: > 0 }
                ? $"Mejorá este borrador de post:\n{brief}"
                : $"Escribí un post para promocionar este producto: {brief}",
            ct);
    }

    /// <summary>Descripción de producto para la tienda.</summary>
    private static async Task<Result<string>> ProductDescriptionAsync(AiShortTextRequest request, IAiGateway gateway, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return Result.Failure<string>(Error.Validation("Ai.NoName", "Falta el nombre del producto."));

        return await gateway.CompleteAsync(
            AiTask.ShortText,
            "Escribís descripciones de producto para una tienda online argentina. Dos párrafos cortos: qué es y " +
            "qué resuelve, y para quién es ideal. Concreto, sin promesas vacías ni datos inventados, argentino " +
            "neutro (vos). Respondé SOLO con la descripción.",
            $"Producto: {Text.Clip(request.Name, 200)}{(string.IsNullOrWhiteSpace(request.Notes) ? "" : $"\nDatos: {Text.Clip(request.Notes!, 800)}")}",
            ct);
    }
}

public sealed record AiMlAnswerRequest(string? Question, string? ItemTitle);
public sealed record AiSupportReplyRequest(string? Message, string? OrderSummary);

/// <summary><c>Kind</c>: <c>social-post</c> (Draft o ProductName) o <c>product-description</c> (Name y Notes).</summary>
public sealed record AiShortTextRequest(string? Kind, string? Draft, string? ProductName, string? Name, string? Notes);
