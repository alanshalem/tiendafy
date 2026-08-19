using Api.Ai;
using Api.Auth;
using Identity.Infrastructure;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Sugerencias con IA (Claude): responder preguntas de ML, redactar posts para
/// redes y describir productos. Los prompts viven ACÁ (server-side); el
/// browser solo manda el contexto y recibe texto editable — la IA sugiere,
/// el merchant decide.
/// </summary>
public static class AiEndpoints
{
    public static RouteGroupBuilder MapAiEndpoints(this RouteGroupBuilder group)
    {
        var ai = group.MapGroup("/ai").RequireTenant();

        // Gating para el front: sin API key, los botones "Sugerir" no aparecen.
        ai.MapGet("/status", (AiClient client) => Results.Ok(new { enabled = client.Configured }));

        // Respuesta sugerida para una pregunta prevente de Mercado Libre.
        ai.MapPost("/ml-answer", async (
            AiMlAnswerRequest request, HttpContext http, AiClient client, CancellationToken ct) =>
        {
            if (await AuthExtensions.CheckPermissionAsync(http, Permission.OrdersFulfill) is { } denied) return denied;
            if (string.IsNullOrWhiteSpace(request.Question))
                return Error.Validation("Ai.NoQuestion", "Falta la pregunta.").ToProblem();

            var result = await client.CompleteAsync(
                "Sos el vendedor de una tienda argentina en Mercado Libre. Respondés preguntas de compradores: " +
                "cordial, directo, en argentino neutro (vos/tenés), sin inventar datos que no tengas — si no sabés " +
                "un dato técnico, decí que lo confirmás por mensaje. Máximo 2 oraciones. Sin saludos largos ni firmas. " +
                "Respondé SOLO con el texto de la respuesta.",
                $"Publicación: {Text.Clip(request.ItemTitle ?? "(sin título)", 200)}\nPregunta del comprador: {Text.Clip(request.Question, 500)}",
                300, ct);
            return result.IsSuccess ? Results.Ok(new { text = result.Value }) : result.Error.ToProblem();
        });

        // Respuesta sugerida para el chat posventa (con el contexto del pedido).
        ai.MapPost("/support-reply", async (
            AiSupportReplyRequest request, HttpContext http, AiClient client, CancellationToken ct) =>
        {
            if (await AuthExtensions.CheckPermissionAsync(http, Permission.SupportChat) is { } denied) return denied;
            if (string.IsNullOrWhiteSpace(request.Message))
                return Error.Validation("Ai.NoMessage", "Falta el mensaje del cliente.").ToProblem();

            var context = string.IsNullOrWhiteSpace(request.OrderSummary)
                ? ""
                : $"\nContexto del pedido: {Text.Clip(request.OrderSummary!, 600)}";
            var result = await client.CompleteAsync(
                "Sos atención al cliente de una tienda online argentina, en el chat posventa de un pedido. " +
                "Empático y resolutivo, argentino neutro (vos/tenés), máximo 3 oraciones. Usá el contexto del " +
                "pedido si ayuda, pero NO inventes fechas de entrega, números de seguimiento ni políticas que no " +
                "estén en el contexto: si falta un dato, ofrecé confirmarlo. Respondé SOLO con el texto.",
                $"Mensaje del cliente: {Text.Clip(request.Message, 800)}{context}",
                400, ct);
            return result.IsSuccess ? Results.Ok(new { text = result.Value }) : result.Error.ToProblem();
        });

        // Borrador (o mejora) de un post para redes sociales.
        ai.MapPost("/social-post", async (
            AiSocialPostRequest request, HttpContext http, AiClient client, CancellationToken ct) =>
        {
            if (await AuthExtensions.CheckPermissionAsync(http, Permission.Social) is { } denied) return denied;
            var brief = Text.Clip(request.Draft ?? request.ProductName ?? "", 1500);
            if (string.IsNullOrWhiteSpace(brief))
                return Error.Validation("Ai.NoBrief", "Escribí un borrador o elegí un producto primero.").ToProblem();

            var result = await client.CompleteAsync(
                "Redactás posts de redes sociales para una tienda online argentina. Tono cercano y vendedor sin " +
                "exagerar, argentino neutro (vos), 1-3 emojis bien puestos, máximo 500 caracteres, con un llamado a " +
                "la acción. Si el borrador incluye un link o un código de cupón, conservalos EXACTOS. " +
                "Respondé SOLO con el texto del post.",
                request.Draft is { Length: > 0 }
                    ? $"Mejorá este borrador de post:\n{brief}"
                    : $"Escribí un post para promocionar este producto: {brief}",
                600, ct);
            return result.IsSuccess ? Results.Ok(new { text = result.Value }) : result.Error.ToProblem();
        });

        // Descripción de producto para la tienda.
        ai.MapPost("/product-description", async (
            AiProductDescriptionRequest request, HttpContext http, AiClient client, CancellationToken ct) =>
        {
            if (await AuthExtensions.CheckPermissionAsync(http, Permission.CatalogWrite) is { } denied) return denied;
            if (string.IsNullOrWhiteSpace(request.Name))
                return Error.Validation("Ai.NoName", "Falta el nombre del producto.").ToProblem();

            var result = await client.CompleteAsync(
                "Escribís descripciones de producto para una tienda online argentina. Dos párrafos cortos: qué es y " +
                "qué resuelve, y para quién es ideal. Concreto, sin promesas vacías ni datos inventados, argentino " +
                "neutro (vos). Respondé SOLO con la descripción.",
                $"Producto: {Text.Clip(request.Name, 200)}{(string.IsNullOrWhiteSpace(request.Notes) ? "" : $"\nDatos: {Text.Clip(request.Notes!, 800)}")}",
                500, ct);
            return result.IsSuccess ? Results.Ok(new { text = result.Value }) : result.Error.ToProblem();
        });

        return group;
    }
}

public sealed record AiMlAnswerRequest(string? Question, string? ItemTitle);
public sealed record AiSupportReplyRequest(string? Message, string? OrderSummary);
public sealed record AiSocialPostRequest(string? Draft, string? ProductName);
public sealed record AiProductDescriptionRequest(string? Name, string? Notes);
