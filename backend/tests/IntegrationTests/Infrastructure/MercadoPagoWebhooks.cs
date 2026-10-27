using System.Security.Cryptography;
using System.Text;
using Api.Payments;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Payments.Infrastructure.Persistence;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// Los avisos de Mercado Pago en los tests: mandar uno firmado como lo firma MP
/// y correr el worker hasta vaciar el inbox.
/// </summary>
public static class MercadoPagoWebhooks
{
    /// <summary>Un aviso de MP, firmado como lo firma MP.</summary>
    public static Task<HttpResponseMessage> SendAsync(ApiFactory factory, string paymentId, long userId,
        string secret = ApiFactory.MercadoPagoWebhookSecret, string? ts = null)
    {
        var requestId = Guid.NewGuid().ToString();
        ts ??= DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var v1 = Convert.ToHexString(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret),
            Encoding.UTF8.GetBytes($"id:{paymentId};request-id:{requestId};ts:{ts};"))).ToLowerInvariant();

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/mercadopago")
        {
            Content = new StringContent(
                $$$"""{"type":"payment","action":"payment.updated","user_id":{{{userId}}},"data":{"id":"{{{paymentId}}}"}}""",
                Encoding.UTF8, "application/json"),
        };
        req.Headers.Add("x-signature", $"ts={ts},v1={v1}");
        req.Headers.Add("x-request-id", requestId);
        return factory.CreateClient().SendAsync(req);
    }

    /// <summary>
    /// Pasadas del worker hasta vaciar lo que está para procesar. La base de
    /// tests persiste entre corridas y el worker toma de a 20: puede haber
    /// avisos viejos adelante del de este test.
    /// </summary>
    public static async Task DrainAsync(ApiFactory factory)
    {
        for (var pass = 0; pass < 20; pass++)
        {
            await Workers.RunOnceAsync<PaymentWebhookWorker>(factory);
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<PaymentsDbContext>();
            var now = DateTime.UtcNow;
            if (!await db.PaymentWebhookEvents.IgnoreQueryFilters().AnyAsync(e => e.Status == InboxEntry.StatusPending && e.NextAttemptAtUtc <= now))
                return;
        }
    }
}
