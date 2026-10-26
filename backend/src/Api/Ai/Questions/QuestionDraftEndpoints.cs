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

        return ai;
    }
}
