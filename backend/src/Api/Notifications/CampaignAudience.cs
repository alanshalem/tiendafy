using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Notifications;

/// <summary>
/// Spec de audiencia de una campaña (serializada en EmailCampaign.AudienceJson).
/// Type: "buyers" | "customers" | "custom". Los filtros aplican sobre las
/// estadísticas de compra; en "custom" manda la lista de emails.
/// </summary>
public sealed record AudienceSpec(
    string Type,
    long? MinSpentMinor = null,
    int? MinOrders = null,
    int? PurchasedWithinDays = null,
    int? InactiveForDays = null,
    List<string>? Emails = null,
    /// <summary>Compró alguno de estos productos (la campaña de proteína, a los que compran proteína).</summary>
    List<Guid>? BoughtProductIds = null,
    /// <summary>Tiene alguno de estos productos en favoritos: intención de compra sin compra todavía.</summary>
    List<Guid>? FavoritedProductIds = null)
{

    public static AudienceSpec Parse(string? json, string fallbackType)
    {
        if (string.IsNullOrWhiteSpace(json)) return new AudienceSpec(fallbackType);
        try
        {
            return JsonSerializer.Deserialize<AudienceSpec>(json, JsonOpts) ?? new AudienceSpec(fallbackType);
        }
        catch (JsonException)
        {
            return new AudienceSpec(fallbackType);
        }
    }

    public string Serialize() => JsonSerializer.Serialize(this, JsonOpts);

    private static readonly JsonSerializerOptions JsonOpts = ApiJson.Web;
}

/// <summary>Destinatario resuelto, con sus stats de compra (para preview y selección).</summary>
public sealed record AudienceMember(
    string Email, string? Name, long SpentMinor, int Orders, DateTime? LastPurchaseUtc)
{
    /// <summary>Productos que compró (para el filtro por producto).</summary>
    public IReadOnlySet<Guid> BoughtProductIds { get; init; } = new HashSet<Guid>();

    /// <summary>Productos que tiene marcados como favoritos.</summary>
    public IReadOnlySet<Guid> FavoritedProductIds { get; init; } = new HashSet<Guid>();
}

/// <summary>
/// Resuelve la audiencia de una campaña: agrega las compras por email (suma
/// gastada, cantidad, última compra), aplica filtros, suma contactos del CRM
/// si corresponde, y SIEMPRE resta la lista de supresión. Los agregados se
/// computan en memoria: los montos viven como "minor|CUR" (no sumables en SQL)
/// y el volumen por tienda es chico.
/// </summary>
public sealed class CampaignAudienceService(
    OrdersDbContext orders,
    Customers.Infrastructure.CustomersDbContext customers,
    NotificationsDbContext notifications,
    Catalog.Infrastructure.Persistence.CatalogDbContext catalog)
{
    /// <summary>Mapa variante → producto para traducir las líneas de una venta.</summary>
    private static async Task<Dictionary<Guid, Guid>> ProductByVariantAsync(
        Catalog.Infrastructure.Persistence.CatalogDbContext catalog, TenantId tenantId,
        List<Guid> variantIds, CancellationToken ct)
    {
        if (variantIds.Count == 0) return [];
        var products = await catalog.Products.AsNoTracking()
            .Where(p => p.TenantId == tenantId)
            .ToListAsync(ct);
        return products
            .SelectMany(p => p.Variants.Select(v => (v.Id, ProductId: p.Id)))
            .Where(x => variantIds.Contains(x.Id))
            .ToDictionary(x => x.Id, x => x.ProductId);
    }

    public async Task<IReadOnlyList<AudienceMember>> ResolveAsync(
        TenantId tenantId, AudienceSpec spec, CancellationToken ct)
    {
        // Stats de compradores (órdenes con pago acreditado).
        var paidOrders = await orders.Orders.AsNoTracking()
            .Where(o => o.TenantId == tenantId && o.PaidAtUtc != null)
            .ToListAsync(ct);

        var stats = paidOrders
            .Where(o => !string.IsNullOrWhiteSpace(o.BuyerEmail) && o.BuyerEmail.Contains('@'))
            .GroupBy(o => o.BuyerEmail.Trim().ToLowerInvariant())
            .ToDictionary(
                g => g.Key,
                g => (Spent: g.Sum(o => o.Total.AmountInMinorUnits),
                      Orders: g.Count(),
                      Last: g.Max(o => o.PaidAtUtc),
                      Name: g.OrderByDescending(o => o.PaidAtUtc).Select(o => o.BuyerName).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n))));

        // Qué productos compró cada email (solo si la campaña filtra por producto:
        // es una vuelta más por el catálogo y no vale pagarla siempre).
        var boughtByEmail = new Dictionary<string, HashSet<Guid>>();
        if (spec.BoughtProductIds is { Count: > 0 })
        {
            var variantIds = paidOrders.SelectMany(o => o.Items).Select(i => i.VariantId).Distinct().ToList();
            var productByVariant = await ProductByVariantAsync(catalog, tenantId, variantIds, ct);
            foreach (var order in paidOrders)
            {
                var email = order.BuyerEmail?.Trim().ToLowerInvariant();
                if (string.IsNullOrEmpty(email) || !email.Contains('@')) continue;
                if (!boughtByEmail.TryGetValue(email, out var set))
                    boughtByEmail[email] = set = [];
                foreach (var item in order.Items)
                    if (productByVariant.TryGetValue(item.VariantId, out var productId))
                        set.Add(productId);
            }
        }

        // Favoritos por email: la lista de gente con la intención de compra más
        // alta que tiene la tienda, y hasta ahora no se podía segmentar por ella.
        var favoritesByEmail = new Dictionary<string, HashSet<Guid>>();
        if (spec.FavoritedProductIds is { Count: > 0 })
        {
            var rows = await (
                from f in customers.CustomerFavorites.AsNoTracking()
                join c in customers.Customers.AsNoTracking() on f.CustomerId equals c.Id
                where f.TenantId == tenantId.Value && c.Email != null
                select new { c.Email, f.ProductId }).ToListAsync(ct);
            foreach (var row in rows)
            {
                var email = row.Email!.Trim().ToLowerInvariant();
                if (!favoritesByEmail.TryGetValue(email, out var set))
                    favoritesByEmail[email] = set = [];
                set.Add(row.ProductId);
            }
        }

        // Contactos del CRM (nombre + posibles no-compradores).
        var contacts = await customers.Customers.AsNoTracking()
            .Where(c => c.TenantId == tenantId.Value && c.Email != null)
            .Select(c => new { c.Email, c.Name })
            .ToListAsync(ct);
        var contactNames = contacts
            .GroupBy(c => c.Email!.Trim().ToLowerInvariant())
            .ToDictionary(g => g.Key, g => g.First().Name);

        // Suscriptores a novedades: dejaron el email en la tienda sin comprar todavía.
        // Solo se cargan si la campaña los pide (una consulta menos en el resto).
        var subscribers = spec.Type is "subscribers" or "customers"
            ? await customers.NewsletterSubscribers.AsNoTracking()
                .Where(x => x.TenantId == tenantId.Value)
                .Select(x => x.Email)
                .ToListAsync(ct)
            : [];

        AudienceMember Build(string email)
        {
            var hasStats = stats.TryGetValue(email, out var s);
            var name = (hasStats ? s.Name : null) ?? contactNames.GetValueOrDefault(email);
            return new AudienceMember(email, name,
                hasStats ? s.Spent : 0, hasStats ? s.Orders : 0, hasStats ? s.Last : null)
            {
                BoughtProductIds = boughtByEmail.GetValueOrDefault(email, []),
                FavoritedProductIds = favoritesByEmail.GetValueOrDefault(email, []),
            };
        }

        IEnumerable<AudienceMember> members = spec.Type switch
        {
            "custom" => (spec.Emails ?? [])
                .Where(e => !string.IsNullOrWhiteSpace(e) && e.Contains('@'))
                .Select(e => e.Trim().ToLowerInvariant())
                .Distinct()
                .Select(Build),
            "subscribers" => subscribers.Distinct().Select(Build),
            "customers" => stats.Keys.Concat(contactNames.Keys).Concat(subscribers).Distinct().Select(Build),
            _ => stats.Keys.Select(Build),
        };

        // Filtros de compra (no aplican a la selección manual: ahí manda la lista).
        members = AudienceFilters.Apply(members, spec, DateTime.UtcNow);

        var suppressed = (await notifications.EmailSuppressions.AsNoTracking()
            .Where(s => s.TenantId == tenantId.Value)
            .Select(s => s.Email)
            .ToListAsync(ct)).ToHashSet(StringComparer.OrdinalIgnoreCase);

        return members
            .Where(m => !suppressed.Contains(m.Email))
            .OrderByDescending(m => m.SpentMinor)
            .ThenBy(m => m.Email, StringComparer.Ordinal)
            .ToList();
    }
}

/// <summary>Filtros puros de audiencia, testeables sin base de datos.</summary>
public static class AudienceFilters
{
    public static IEnumerable<AudienceMember> Apply(IEnumerable<AudienceMember> members, AudienceSpec spec, DateTime nowUtc)
    {
        if (spec.Type == "custom") return members;
        if (spec.MinSpentMinor is > 0) members = members.Where(m => m.SpentMinor >= spec.MinSpentMinor);
        if (spec.MinOrders is > 0) members = members.Where(m => m.Orders >= spec.MinOrders);
        if (spec.BoughtProductIds is { Count: > 0 } bought)
            members = members.Where(m => m.BoughtProductIds.Overlaps(bought));
        if (spec.FavoritedProductIds is { Count: > 0 } favorited)
            members = members.Where(m => m.FavoritedProductIds.Overlaps(favorited));
        if (spec.PurchasedWithinDays is > 0)
            members = members.Where(m => m.LastPurchaseUtc >= nowUtc.AddDays(-spec.PurchasedWithinDays.Value));
        if (spec.InactiveForDays is > 0)
            members = members.Where(m => m.LastPurchaseUtc == null || m.LastPurchaseUtc < nowUtc.AddDays(-spec.InactiveForDays.Value));
        return members;
    }
}
