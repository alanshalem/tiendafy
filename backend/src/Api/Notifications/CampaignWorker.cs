using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using SharedKernel.Common;
using Tenancy.Infrastructure.Persistence;

namespace Api.Notifications;

/// <summary>
/// Motor de envío de campañas, en background:
/// 1) Promueve campañas "scheduled" vencidas: resuelve la audiencia EN ESE
///    momento (filtros y supresión al día), snapshotea y pasa a "sending".
/// 2) Procesa "sending" por lotes chicos con pausa entre emails (rate limit
///    de Resend). Cada email sale con links trackeados, pixel de apertura,
///    cards de productos y link de baja atado a la campaña.
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

        await PromoteScheduledAsync(sp, db, ct);
        await ProcessSendingAsync(sp, db, ct);
    }

    private async Task PromoteScheduledAsync(IServiceProvider sp, NotificationsDbContext db, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var due = await db.EmailCampaigns
            .Where(c => c.Status == "scheduled" && c.ScheduledAtUtc <= now)
            .OrderBy(c => c.ScheduledAtUtc)
            .Take(3)
            .ToListAsync(ct);
        if (due.Count == 0) return;

        var audienceService = sp.GetRequiredService<CampaignAudienceService>();
        foreach (var campaign in due)
        {
            var spec = AudienceSpec.Parse(campaign.AudienceJson, campaign.Audience);
            var members = await audienceService.ResolveAsync(TenantId.From(campaign.TenantId), spec, ct);
            if (members.Count == 0)
            {
                campaign.Cancel();
                logger.LogWarning("Campaña programada {CampaignId} cancelada: audiencia vacía.", campaign.Id);
                continue;
            }
            foreach (var member in members)
                db.CampaignRecipients.Add(CampaignRecipient.Create(campaign.TenantId, campaign.Id, member.Email));
            campaign.StartSending(members.Count);
            logger.LogInformation("Campaña programada {CampaignId} arrancó: {Count} destinatarios.",
                campaign.Id, members.Count);
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task ProcessSendingAsync(IServiceProvider sp, NotificationsDbContext db, CancellationToken ct)
    {
        var email = sp.GetRequiredService<BrandedEmailSender>();
        var dp = sp.GetRequiredService<IDataProtectionProvider>();
        var tenancy = sp.GetRequiredService<TenancyDbContext>();
        var apiBase = configuration["PublicApiBaseUrl"] ?? "http://localhost:5080";
        var platform = (configuration["Tenancy:PlatformBaseDomain"] ?? "localhost:3000").ToLowerInvariant();

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

        // URL pública de la tienda (para las cards de productos).
        var tenant = await tenancy.Tenants.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == campaign.TenantId, ct);
        var storeBase = tenant is null
            ? $"http://{platform}"
            : !string.IsNullOrWhiteSpace(tenant.CustomDomain)
                ? $"https://{tenant.CustomDomain}"
                : $"http://{tenant.Subdomain.Value}.{platform}";
        var products = CampaignEmailComposer.ParseProducts(campaign.ProductsJson);

        var sent = 0;
        var failed = 0;
        foreach (var recipient in batch)
        {
            if (ct.IsCancellationRequested) break;
            try
            {
                var track = TrackToken.Protect(dp, campaign.Id, recipient.Email);
                var unsub = UnsubscribeToken.Protect(dp, campaign.TenantId, recipient.Email, campaign.Id);
                var body = CampaignEmailComposer.ComposeForRecipient(
                    campaign.BodyHtml, products, storeBase,
                    trackClickBaseUrl: $"{apiBase}/api/v1/marketing/c?t={Uri.EscapeDataString(track)}",
                    openPixelUrl: $"{apiBase}/api/v1/marketing/o.gif?t={Uri.EscapeDataString(track)}",
                    unsubscribeUrl: $"{apiBase}/api/v1/marketing/unsubscribe?token={Uri.EscapeDataString(unsub)}");
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
}
