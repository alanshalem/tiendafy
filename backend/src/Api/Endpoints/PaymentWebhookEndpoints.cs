using System.Text;
using System.Text.Json;
using Api.Payments;
using Payments.Contracts;

namespace Api.Endpoints;

public static class PaymentWebhookEndpoints
{
    public static RouteGroupBuilder MapPaymentWebhookEndpoints(this RouteGroupBuilder group)
    {
        // Público (sin tenant): MercadoPago notifica acá. Gateado por firma HMAC.
        group.MapPost("/payments/webhooks/mercadopago", async (
            HttpRequest httpRequest,
            IMercadoPagoWebhookValidator validator,
            PaymentWebhookQueue queue,
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

            // Responder 200 ya; el worker procesa async.
            if (result.Type == "payment" && !string.IsNullOrEmpty(result.DataId))
                await queue.EnqueueAsync(new PaymentWebhookJob(result.Type, result.DataId!, userId), ct);

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
