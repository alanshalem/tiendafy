namespace Notifications.Infrastructure;

/// <summary>
/// Registro de cada envío transaccional (email/WhatsApp) por tienda. Alimenta
/// el panel de uso y costos estimados del merchant. Una fila por envío: el
/// volumen es bajo (transaccional, no marketing) y da breakdown por plantilla.
/// </summary>
public sealed class NotificationEvent
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    /// <summary>"email" | "whatsapp".</summary>
    public string Channel { get; set; } = null!;
    /// <summary>Tipo de plantilla (ej. "confirmacion-pago"). Null = envío suelto.</summary>
    public string? Template { get; set; }
    public DateTime CreatedAtUtc { get; set; }

    public static NotificationEvent Email(Guid tenantId, string? template) =>
        new() { Id = Guid.NewGuid(), TenantId = tenantId, Channel = "email", Template = template, CreatedAtUtc = DateTime.UtcNow };

    public static NotificationEvent WhatsApp(Guid tenantId, string? template) =>
        new() { Id = Guid.NewGuid(), TenantId = tenantId, Channel = "whatsapp", Template = template, CreatedAtUtc = DateTime.UtcNow };
}
