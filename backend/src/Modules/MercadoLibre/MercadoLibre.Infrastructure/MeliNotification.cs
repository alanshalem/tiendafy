using SharedKernel.Common;

namespace MercadoLibre.Infrastructure;

/// <summary>
/// Inbox durable de notificaciones (webhooks) de Mercado Libre. ML pide
/// responder 200 enseguida (la doc vigente da 20 s; si no, reintenta durante
/// una hora y después descarta el aviso), así que el endpoint solo persiste y
/// un worker procesa después con reintentos. El payload de ML NO trae los datos
/// (solo el resource a consultar), por eso nunca se confía en él: el worker
/// re-consulta el recurso con el token del vendedor.
/// </summary>
public sealed class MeliNotification : InboxEntry
{
    public string Topic { get; private set; } = string.Empty;
    public string Resource { get; private set; } = string.Empty;
    public long MeliUserId { get; private set; }

    private MeliNotification() { } // EF Core

    public static MeliNotification Receive(string topic, string resource, long meliUserId)
    {
        var n = new MeliNotification
        {
            Topic = topic.Length > 60 ? topic[..60] : topic,
            Resource = resource.Length > 300 ? resource[..300] : resource,
            MeliUserId = meliUserId,
        };
        n.Enqueue();
        return n;
    }
}
