using Api.Auth;
using Api.Endpoints;
using Identity.Infrastructure;

namespace Api.Ai.Questions;

/// <summary>
/// Borradores de respuesta de la bandeja. El navegador manda solo el id: la consulta, la publicación o el
/// pedido los lee el servidor. Pedir un borrador es de solo lectura; responder sigue siendo el botón de siempre.
/// Los errores del gateway (apagada, sin cupo, proveedor caído) vuelven tal cual.
/// </summary>
public static class QuestionDraftEndpoints
{
    public static RouteGroupBuilder MapQuestionDrafts(this RouteGroupBuilder ai)
    {
        // Pregunta de preventa en una publicación de Mercado Libre.
        ai.MapPost("/ml/questions/{id:long}/draft", async (
            long id, MeliDraftSources sources, QuestionDraftService drafts, CancellationToken ct) =>
        {
            var subject = await sources.QuestionAsync(id, ct);
            if (subject.IsFailure) return subject.Error.ToProblem();
            var draft = await drafts.DraftAsync(subject.Value, ct);
            return draft.IsSuccess ? Results.Ok(draft.Value) : draft.Error.ToProblem();
        }).RequirePermission(Permission.MeliOperate).RequireAiRateLimit(AiRateLimitKind.PerUser);

        // Chat posventa de una venta de Mercado Libre: el pack sale del cache local de esta tienda.
        ai.MapPost("/ml/messages/{packId:long}/draft", async (
            long packId, MeliDraftSources sources, QuestionDraftService drafts, CancellationToken ct) =>
        {
            var subject = await sources.PackAsync(packId, ct);
            if (subject.IsFailure) return subject.Error.ToProblem();
            var draft = await drafts.DraftAsync(subject.Value, ct);
            return draft.IsSuccess ? Results.Ok(draft.Value) : draft.Error.ToProblem();
        }).RequirePermission(Permission.MeliOperate).RequireAiRateLimit(AiRateLimitKind.PerUser);

        // Chat posventa de la tienda: la conversación y su pedido los lee el servidor, sin marcarla leída.
        ai.MapPost("/support/conversations/{id:guid}/draft", async (
            Guid id, StoreDraftSources sources, QuestionDraftService drafts, CancellationToken ct) =>
        {
            var subject = await sources.SupportConversationAsync(id, ct);
            if (subject.IsFailure) return subject.Error.ToProblem();
            var draft = await drafts.DraftAsync(subject.Value, ct);
            return draft.IsSuccess ? Results.Ok(draft.Value) : draft.Error.ToProblem();
        }).RequirePermission(Permission.SupportChat).RequireAiRateLimit(AiRateLimitKind.PerUser);

        // Mensaje del formulario de contacto: el mismo permiso que hoy pide contestarlo.
        ai.MapPost("/contact/{id:guid}/draft", async (
            Guid id, StoreDraftSources sources, QuestionDraftService drafts, CancellationToken ct) =>
        {
            var subject = await sources.ContactAsync(id, ct);
            if (subject.IsFailure) return subject.Error.ToProblem();
            var draft = await drafts.DraftAsync(subject.Value, ct);
            return draft.IsSuccess ? Results.Ok(draft.Value) : draft.Error.ToProblem();
        }).RequirePermission(Permission.MessagesRead).RequireAiRateLimit(AiRateLimitKind.PerUser);

        return ai;
    }
}
