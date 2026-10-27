using Api.Storefront;
using Microsoft.EntityFrameworkCore;
using Themes.Infrastructure;

namespace Api.Workers;

/// <summary>
/// Publica los diseños programados cuando llega la hora.
///
/// Existe para lo mismo que existe el Hot Sale a las 00:00: nadie tiene que
/// quedarse despierto para apretar "Publicar". Guarda la versión anterior en el
/// historial igual que una publicación a mano, así "volver atrás" sigue estando
/// para un cambio que salió mientras el comercio dormía.
/// </summary>
public sealed class ThemeScheduleWorker(
    IServiceScopeFactory scopeFactory,
    IStorefrontRevalidator storefront,
    ILogger<ThemeScheduleWorker> logger) : PollingWorker(TimeSpan.FromSeconds(30))
{
    protected override void LogPollFailure(Exception ex) =>
        logger.LogError(ex, "Publicación programada de diseño falló.");

    protected override async Task PollOnceAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        // Sin tienda en el scope los filtros no devuelven nada: el worker mira
        // todas las tiendas a propósito, con IgnoreQueryFilters.
        var db = scope.ServiceProvider.GetRequiredService<ThemesDbContext>();

        var now = DateTime.UtcNow;
        var due = await db.Themes.IgnoreQueryFilters()
            .Where(t => t.ScheduledAtUtc != null && t.ScheduledAtUtc <= now && t.ScheduledConfig != null)
            .OrderBy(t => t.ScheduledAtUtc)
            .Take(20)
            .ToListAsync(ct);

        foreach (var doc in due)
        {
            var next = doc.ScheduledConfig!;
            if (!string.IsNullOrWhiteSpace(doc.PublishedConfig) && doc.PublishedConfig != next)
                db.ThemeVersions.Add(ThemeVersion.Create(doc.TenantId, doc.PublishedConfig, null));

            // El borrador NO se pisa: entre que se programó y ahora el comercio
            // siguió editando, y antes esos cambios se perdían a la hora
            // programada. La única excepción es un borrador sin cambios propios
            // (igual a lo que estaba publicado): ahí se lo trae a lo nuevo, porque
            // si no el editor mostraría "cambios sin publicar" y publicarlos
            // desharía lo programado.
            if (doc.DraftConfig == doc.PublishedConfig && doc.DraftConfig != next)
            {
                doc.DraftConfig = next;
                doc.DraftVersion++;
            }
            doc.PublishedConfig = next;
            doc.ScheduledConfig = null;
            doc.ScheduledAtUtc = null;
            doc.UpdatedAtUtc = now;
            logger.LogInformation("Diseño programado publicado para el tenant {TenantId}.", doc.TenantId);
        }

        if (due.Count == 0) return;
        await db.SaveChangesAsync(ct);
        // Lo programado tiene que verse a la hora, no un rato después.
        foreach (var doc in due) _ = storefront.RevalidateAsync(doc.TenantId, StorefrontScope.Theme);
    }
}
