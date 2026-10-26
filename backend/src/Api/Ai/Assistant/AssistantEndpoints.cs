using Api.Auth;
using Api.Endpoints;
using Identity.Infrastructure;

namespace Api.Ai.Assistant;

/// <summary>
/// "Preguntale a tu tienda". Solo lectura: las herramientas que ve el modelo son las que permite el rol de quien
/// pregunta, y los errores del gateway (apagada, sin cupo, proveedor caído) vuelven tal cual.
/// </summary>
public static class AssistantEndpoints
{
    public static RouteGroupBuilder MapAssistant(this RouteGroupBuilder ai)
    {
        ai.MapPost("/assistant", async (
            AssistantRequest request, AssistantService assistant, HttpContext http, CancellationToken ct) =>
        {
            // RequirePermission ya probó que hay sesión y tienda; acá se resuelve qué puede ver.
            var userId = http.User.GetUserId();
            var access = await http.GetAccessAsync();
            if (userId is null || access is null) return AuthExtensions.NotAMember();

            var answer = await assistant.AskAsync(userId.Value, access, request, ct);
            return answer.IsSuccess ? Results.Ok(answer.Value) : answer.Error.ToProblem();
        }).RequirePermission(Permission.StatsRead).RequireAiRateLimit(AiRateLimitKind.PerUser);

        return ai;
    }
}
