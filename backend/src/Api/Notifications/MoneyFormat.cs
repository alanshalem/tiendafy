using SharedKernel.Common;

namespace Api.Notifications;

/// <summary>
/// Formato de dinero de las notificaciones al comprador (email y WhatsApp):
/// "ARS 1.500" sin importar la cultura del proceso (producción corre con la
/// invariante, que ponía "ARS 1,500").
/// </summary>
public static class MoneyFormat
{
    public static string ForNotification(Money m) => ArgentineNumbers.Money(m);
}
