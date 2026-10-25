using Ai.Infrastructure;
using Identity.Infrastructure;

namespace Api.Ai;

/// <summary>
/// Qué permisos habilitan cada tarea de IA: alcanza con tener ALGUNO. Es el único lugar donde vive el
/// mapa: lo usan <c>/ai/status</c> (disponibilidad por usuario) y los endpoints de cada función.
/// </summary>
public static class AiTaskPermissions
{
    public const string Denied = "No tenés permiso para usar esta función.";

    /// <summary>El código que <c>/ai/status</c> manda con <see cref="Denied"/>: el panel oculta el botón por él, no por el texto.</summary>
    public const string DeniedCode = "Ai.Denied";

    public static IReadOnlyList<Permission> For(AiTask task) => task switch
    {
        AiTask.QuestionClassify or AiTask.QuestionDraft => [Permission.MeliOperate, Permission.SupportChat, Permission.MessagesRead],
        AiTask.DataAssistant => [Permission.StatsRead],
        AiTask.CatalogWrite or AiTask.CatalogJudge => [Permission.CatalogWrite],
        AiTask.InvoiceRead => [Permission.PurchasingManage],
        AiTask.ShortText => [Permission.SocialPublish, Permission.CatalogWrite],
        _ => throw new ArgumentOutOfRangeException(nameof(task), task, "Tarea de IA sin permisos asignados."),
    };

    /// <summary>Si la persona (null = no es del equipo) puede usar la tarea.</summary>
    public static bool Allows(MemberAccess? access, AiTask task) =>
        access is not null && For(task).Any(access.Can);
}
