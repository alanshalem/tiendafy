namespace Api.Notifications;

/// <summary>Costos de referencia de notificaciones (config con default único).</summary>
public static class NotificationCosts
{
    /// <summary>Tarifa de referencia Resend por 1000 emails, en USD.</summary>
    public static decimal EmailUsdPer1000(IConfiguration cfg) =>
        cfg.GetValue("Notifications:EmailCostUsdPer1000", 0.40m);
}
