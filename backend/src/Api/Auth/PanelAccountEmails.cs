using System.Threading.Channels;
using Api.Notifications;

namespace Api.Auth;

/// <summary>
/// Los emails de la cuenta del panel que se piden sin sesión ("olvidé mi
/// contraseña", reenviar la verificación) salen fuera del request.
///
/// <para>
/// Antes el endpoint esperaba a Resend (con reintentos de hasta varios
/// segundos) solo cuando la cuenta existía, y el tiempo de respuesta delataba
/// si un email tenía cuenta en el panel aunque la respuesta fuera siempre 204.
/// Ahora los dos caminos hacen lo mismo en el request (buscar la cuenta) y el
/// envío lo hace <see cref="PanelAccountEmailWorker"/>.
/// </para>
///
/// <para>
/// La cola es en memoria: si la API se reinicia con un email en la cola, ese
/// email no sale y la persona lo vuelve a pedir (los dos son a pedido y el
/// link vence en poco, así que no vale una cola durable).
/// </para>
///
/// <para>
/// Con tope: si se juntan más de <see cref="Capacity"/> sin mandar (un ataque
/// de "olvidé mi contraseña" en masa, Resend caído), los nuevos se descartan
/// con un aviso en el log en vez de crecer en memoria hasta tumbar la API.
/// </para>
/// </summary>
public sealed class PanelAccountEmails
{
    /// <summary>Cuántos emails pueden esperar en la cola.</summary>
    public const int Capacity = 1000;

    private readonly Channel<PanelAccountEmail> _queue;

    public PanelAccountEmails(ILogger<PanelAccountEmails> logger) : this(logger, Capacity)
    {
    }

    internal PanelAccountEmails(ILogger<PanelAccountEmails> logger, int capacity) =>
        _queue = Channel.CreateBounded<PanelAccountEmail>(
            new BoundedChannelOptions(capacity) { SingleReader = true, FullMode = BoundedChannelFullMode.DropWrite },
            dropped => logger.LogWarning(
                "Cola de emails de la cuenta del panel llena ({Capacity}): se descarta uno ({Subject}).",
                capacity, dropped.Subject));

    /// <summary>Encola el email. No espera el envío (con la cola llena, se descarta: ver la clase).</summary>
    public void Enqueue(string to, string subject, string html) =>
        _queue.Writer.TryWrite(new PanelAccountEmail(to, subject, html));

    internal ChannelReader<PanelAccountEmail> Reader => _queue.Reader;
}

internal sealed record PanelAccountEmail(string To, string Subject, string Html);

/// <summary>Manda los emails de <see cref="PanelAccountEmails"/>, de a uno.</summary>
public sealed class PanelAccountEmailWorker(
    PanelAccountEmails emails, IServiceScopeFactory scopes, ILogger<PanelAccountEmailWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var email in emails.Reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    using var scope = scopes.CreateScope();
                    var sender = scope.ServiceProvider.GetRequiredService<IEmailSender>();
                    await sender.SendAsync(email.To, email.Subject, email.Html, ct: stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    // El sender no tira por errores del proveedor; esto es algo
                    // inesperado. Se loguea y se sigue con el próximo.
                    logger.LogError(ex, "No se pudo mandar un email de la cuenta del panel.");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // apagado normal
        }
    }
}
