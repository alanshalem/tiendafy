using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;

namespace Api.Notifications;

/// <summary>
/// Envía las campañas en estado "sending" por lotes chicos, en background.
/// Cada tick procesa hasta BatchSize destinatarios pending (de cualquier
/// tienda), con una pausa corta entre emails para no pelearse con el rate
/// limit de Resend. Cuando no quedan pending, la campaña pasa a "sent".
/// Resumible por diseño: el estado vive en campaign_recipients.
/// </summary>
public sealed class CampaignWorker(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<CampaignWorker> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(20);
    private static readonly TimeSpan PerEmailDelay = TimeSpan.FromMilliseconds(600);
    private const int BatchSize = 25;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await PollOnceAsync(stoppingToken); }
            catch (Exception ex) { logger.LogError(ex, "Envío de campañas falló."); }
            try { await Task.Delay(PollInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<NotificationsDbContext>();
        var email = sp.GetRequiredService<BrandedEmailSender>();
        var dp = sp.GetRequiredService<IDataProtectionProvider>();
        var apiBase = configuration["PublicApiBaseUrl"] ?? "http://localhost:5080";

        var campaign = await db.EmailCampaigns
            .Where(c => c.Status == "sending")
            .OrderBy(c => c.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);
        if (campaign is null) return;

        var batch = await db.CampaignRecipients
            .Where(r => r.CampaignId == campaign.Id && r.Status == "pending")
            .OrderBy(r => r.Email)
            .Take(BatchSize)
            .ToListAsync(ct);

        if (batch.Count == 0)
        {
            campaign.MarkSent();
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Campaña {CampaignId} completada: {Sent} enviados, {Failed} fallidos.",
                campaign.Id, campaign.SentCount, campaign.FailedCount);
            return;
        }

        var sent = 0;
        var failed = 0;
        foreach (var recipient in batch)
        {
            if (ct.IsCancellationRequested) break;
            try
            {
                var token = UnsubscribeToken.Protect(dp, campaign.TenantId, recipient.Email);
                var body = campaign.BodyHtml + UnsubscribeFooter($"{apiBase}/api/v1/marketing/unsubscribe?token={Uri.EscapeDataString(token)}");
                await email.SendAsync(campaign.TenantId, recipient.Email, campaign.Subject, body, ct, template: "campaign");
                recipient.MarkSent();
                sent++;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Campaña {CampaignId}: fallo enviando a {Email}.",
                    campaign.Id, Logging.LogValue.MaskEmail(recipient.Email));
                recipient.MarkFailed();
                failed++;
            }
            await Task.Delay(PerEmailDelay, ct);
        }

        campaign.RecordProgress(sent, failed);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Footer de baja: obligatorio en email marketing. Va DENTRO del cuerpo
    /// (el layout brandeado lo envuelve igual que al resto del contenido).
    /// </summary>
    private static string UnsubscribeFooter(string url) => $"""
        <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;text-align:center">
          Recibís este email porque compraste o te registraste en esta tienda.
          <a href="{url}" style="color:#a1a1aa;text-decoration:underline">Dejar de recibir novedades</a>
        </p>
        """;
}
