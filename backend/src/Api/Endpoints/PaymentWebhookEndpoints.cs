using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Payments.Contracts;
using Payments.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Endpoints;

public static class PaymentWebhookEndpoints
{
    /// <summary>¿La excepción es una violación de unique de Postgres (SQLSTATE 23505)?</summary>
    private static bool IsUniqueViolation(DbUpdateException ex) =>
        ex.InnerException is { } inner && inner.GetType().Name == "PostgresException"
        && (string?)inner.GetType().GetProperty("SqlState")?.GetValue(inner) == "23505";

    public static RouteGroupBuilder MapPaymentWebhookEndpoints(this RouteGroupBuilder group)
    {
        // Público (sin tenant): MercadoPago notifica acá. Gateado por firma HMAC.
        group.MapPost("/payments/webhooks/mercadopago", async (
            HttpRequest httpRequest,
            IMercadoPagoWebhookValidator validator,
            PaymentsDbContext db,
            CancellationToken ct) =>
        {
            string body;
            using (var reader = new StreamReader(httpRequest.Body, Encoding.UTF8))
                body = await reader.ReadToEndAsync(ct);

            var xSignature = httpRequest.Headers["x-signature"].ToString();
            var xRequestId = httpRequest.Headers["x-request-id"].ToString();
            var dataIdQuery = httpRequest.Query["data.id"].ToString();

            var result = validator.Validate(
                xSignature, xRequestId,
                string.IsNullOrEmpty(dataIdQuery) ? null : dataIdQuery, body);

            // Firma inválida → 401 (no confiar en el body).
            if (!result.IsValid) return Results.Unauthorized();

            var userId = ParseUserId(body);

            // Persistir el evento (inbox durable) y responder 200. El worker lo
            // procesa async con reintentos; sobrevive reinicios del proceso.
            //
            // Hay una fila por pago (índice único (type, data.id)), pero MP avisa
            // CADA cambio del mismo pago: pendiente → aprobado (efectivo en
            // Rapipago, tarjeta en revisión), reembolso hecho desde su cuenta,
            // contracargo. El aviso no trae el estado: el worker lo consulta al
            // procesar. Así que un aviso repetido vuelve a poner en cola la fila
            // que ya se había procesado (o dado por muerta). Antes se descartaba
            // y la venta quedaba pendiente para siempre.
            if (result.Type == "payment" && !string.IsNullOrEmpty(result.DataId))
            {
                db.PaymentWebhookEvents.Add(PaymentWebhookEvent.Receive(result.Type, result.DataId!, userId));
                try
                {
                    await db.SaveChangesAsync(ct);
                }
                catch (DbUpdateException dup) when (IsUniqueViolation(dup))
                {
                    db.ChangeTracker.Clear();
                    var type = result.Type;
                    var dataId = result.DataId!;
                    var now = DateTime.UtcNow;
                    // Si sigue pendiente no se toca: el worker todavía no lo
                    // consultó y, cuando lo haga, va a leer el estado nuevo.
                    await db.PaymentWebhookEvents
                        .Where(e => e.Type == type && e.DataId == dataId && e.Status != InboxEntry.StatusPending)
                        .ExecuteUpdateAsync(s => s
                            .SetProperty(e => e.Status, InboxEntry.StatusPending)
                            .SetProperty(e => e.Attempts, 0)
                            .SetProperty(e => e.LastError, (string?)null)
                            .SetProperty(e => e.ProcessedAtUtc, (DateTime?)null)
                            .SetProperty(e => e.NextAttemptAtUtc, now), ct);
                }
            }

            return Results.Ok();
        });

        return group;
    }

    private static long ParseUserId(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return 0;
        try
        {
            using var doc = JsonDocument.Parse(body);
            return JsonRead.GetLongFlexible(doc.RootElement, "user_id");
        }
        catch { return 0; }
    }
}
