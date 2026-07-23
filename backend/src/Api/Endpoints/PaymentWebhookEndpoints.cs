using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Payments.Contracts;
using Payments.Infrastructure.Persistence;

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
            // Idempotente: si MP reenvía el mismo (type, data.id), el índice único
            // lo rechaza y respondemos 200 igual (ya está encolado).
            if (result.Type == "payment" && !string.IsNullOrEmpty(result.DataId))
            {
                db.PaymentWebhookEvents.Add(PaymentWebhookEvent.Receive(result.Type, result.DataId!, userId));
                try
                {
                    await db.SaveChangesAsync(ct);
                }
                catch (DbUpdateException dup) when (IsUniqueViolation(dup))
                {
                    // Duplicado ya encolado: nada que hacer, seguimos a 200.
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
            if (!doc.RootElement.TryGetProperty("user_id", out var u)) return 0;
            if (u.ValueKind == JsonValueKind.Number) return u.GetInt64();
            return long.TryParse(u.GetString(), out var parsed) ? parsed : 0;
        }
        catch { return 0; }
    }
}
