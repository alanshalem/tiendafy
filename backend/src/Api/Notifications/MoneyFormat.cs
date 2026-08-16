using SharedKernel.Common;

namespace Api.Notifications;

/// <summary>Formato de dinero de las notificaciones al comprador (email y WhatsApp).</summary>
public static class MoneyFormat
{
    public static string ForNotification(Money m) => $"{m.Currency} {m.ToDecimal():N0}";
}
