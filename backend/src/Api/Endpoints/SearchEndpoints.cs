using Api.Auth;
using Api.Crm;
using Catalog.Infrastructure.Persistence;
using Customers.Infrastructure;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Infrastructure.Persistence;
using Purchasing.Infrastructure;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

/// <summary>
/// El buscador del panel (Ctrl+K): una sola consulta que trae, agrupado, lo
/// que coincide en ventas, clientes, productos y SKUs, compras y proveedores.
///
/// Antes la paleta buscaba solo pantallas y productos: para encontrar la venta
/// de "Laura" había que entrar a Ventas y buscarla ahí, y la venta que llegaba
/// por WhatsApp con su número no tenía atajo. Cada grupo respeta los permisos
/// de quien busca (no aparece lo que no podría abrir) y trae pocos resultados:
/// es para saltar a algo, no para listar.
/// </summary>
public static class SearchEndpoints
{
    /// <summary>Resultados por grupo cuando el panel no pide otro número.</summary>
    private const int DefaultPerGroup = 5;
    private const int MaxPerGroup = 10;

    /// <summary>Menos que esto busca demasiado: "a" coincide con media tienda.</summary>
    public const int MinQueryLength = 2;

    public static RouteGroupBuilder MapSearchEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/search", async (
            HttpContext http, ITenantContext tenant,
            OrdersDbContext orders, CustomersDbContext customers, CatalogDbContext catalog,
            PurchasingDbContext purchasing, CancellationToken ct,
            string? q = null, int? limit = null) =>
        {
            var text = q?.Trim() ?? "";
            if (text.Length < MinQueryLength) return Results.Ok(SearchResults.Empty);

            var take = Math.Clamp(limit ?? DefaultPerGroup, 1, MaxPerGroup);
            var access = await http.GetAccessAsync();
            bool Can(Permission p) => access?.Can(p) == true;
            var tid = tenant.TenantId.Value;

            // Uno detrás de otro: los DbContext no se comparten entre hilos, y son
            // cinco consultas chicas con índice por tienda.
            return Results.Ok(new SearchResults(
                Orders: Can(Permission.OrdersRead) ? await OrdersAsync(orders, tenant.TenantId, text, take, ct) : null,
                Customers: Can(Permission.CustomersRead) ? await CustomersAsync(customers, tid, text, take, ct) : null,
                Products: Can(Permission.CatalogWrite) || Can(Permission.InventoryRead)
                    ? await ProductsAsync(catalog, tenant.TenantId, text, take, ct) : null,
                PurchaseOrders: Can(Permission.PurchasingManage) ? await PurchaseOrdersAsync(purchasing, tid, text, take, ct) : null,
                Suppliers: Can(Permission.PurchasingManage) ? await SuppliersAsync(purchasing, tid, text, take, ct) : null));
        })
        .RequireTenant()
        .RequireAnyPermission(
            Permission.OrdersRead, Permission.CustomersRead, Permission.CatalogWrite,
            Permission.InventoryRead, Permission.PurchasingManage);

        return group;
    }

    /// <summary>
    /// Ventas por número ("#A1B2C3D4", con o sin numeral: es el principio del
    /// id), email o nombre del comprador. Igual que el buscador de Ventas.
    /// </summary>
    private static async Task<List<SearchHit>> OrdersAsync(
        OrdersDbContext db, SharedKernel.Common.TenantId tenantId, string text, int take, CancellationToken ct)
    {
        var plain = text.TrimStart('#').Trim();
        var term = $"%{plain}%";
        var rows = await db.Orders.AsNoTracking()
            .Where(o => o.TenantId == tenantId)
            .Where(o => EF.Functions.ILike(o.BuyerEmail, term)
                || (o.BuyerName != null && EF.Functions.ILike(o.BuyerName, term))
                || EF.Functions.ILike(o.Id.ToString(), $"{plain}%"))
            .OrderByDescending(o => o.CreatedAtUtc)
            .Take(take)
            .ToListAsync(ct);

        return rows.Select(o => new SearchHit(
            o.Id,
            $"#{o.Id.ToString("N")[..8].ToUpperInvariant()} · {o.BuyerName ?? o.BuyerEmail}",
            o.Status.ToString().ToUpperInvariant(),
            AmountMinor: o.Total.AmountInMinorUnits,
            Currency: o.Currency,
            AtUtc: o.CreatedAtUtc)).ToList();
    }

    /// <summary>Clientes por nombre, email o teléfono (el teléfono está cifrado: ver CustomerPhoneSearch).</summary>
    private static async Task<List<SearchHit>> CustomersAsync(
        CustomersDbContext db, Guid tenantId, string text, int take, CancellationToken ct)
    {
        var term = $"%{text}%";
        var byPhone = await CustomerPhoneSearch.MatchingIdsAsync(db, tenantId, text, ct, max: take);
        var rows = await db.Customers.AsNoTracking()
            .Where(c => c.TenantId == tenantId)
            .Where(c => EF.Functions.ILike(c.Name, term)
                || (c.Email != null && EF.Functions.ILike(c.Email, term))
                || byPhone.Contains(c.Id))
            .OrderByDescending(c => c.LastOrderAtUtc ?? c.CreatedAtUtc)
            .Take(take)
            .ToListAsync(ct);

        return rows.Select(c => new SearchHit(
            c.Id, c.Name, c.Email ?? c.Phone,
            Detail: c.OrdersCount > 0 ? $"{c.OrdersCount} {(c.OrdersCount == 1 ? "compra" : "compras")}" : null))
            .ToList();
    }

    /// <summary>
    /// Productos por nombre (cada palabra, sin tildes) o por SKU / código de
    /// barras de alguna variante. Si entró por el SKU, se muestra cuál.
    /// </summary>
    private static async Task<List<SearchHit>> ProductsAsync(
        CatalogDbContext db, SharedKernel.Common.TenantId tenantId, string text, int take, CancellationToken ct)
    {
        var skuTerm = $"%{text}%";
        var byName = ProductTextSearch.Matching(db.Products.AsNoTracking().Where(p => p.TenantId == tenantId), text, includeSku: false);
        var bySku = db.Products.AsNoTracking().Where(p => p.TenantId == tenantId
            && p.Variants.Any(v => EF.Functions.ILike(v.Sku, skuTerm) || v.Barcode == text));
        // Dos consultas de ids y una de productos: un Union de entidades con
        // colecciones propias (variantes, fotos) no se traduce a SQL. Primero
        // los que entraron por SKU: quien tipea un código busca ese producto.
        var skuIds = await bySku.OrderBy(p => p.Name).Select(p => p.Id).Take(take).ToListAsync(ct);
        var nameIds = await byName.OrderBy(p => p.Name).Select(p => p.Id).Take(take).ToListAsync(ct);
        var ids = skuIds.Concat(nameIds).Distinct().Take(take).ToList();
        var found = await db.Products.AsNoTracking().Where(p => ids.Contains(p.Id)).ToListAsync(ct);
        var rows = ids.Select(id => found.FirstOrDefault(p => p.Id == id)).OfType<Catalog.Core.Domain.Product>();

        return rows.Select(p =>
        {
            var sku = p.Variants.FirstOrDefault(v =>
                v.Sku.Contains(text, StringComparison.OrdinalIgnoreCase) || v.Barcode == text)?.Sku;
            return new SearchHit(
                p.Id, p.Name,
                sku is null ? null : $"SKU {sku}",
                ImageUrl: p.Images.OrderBy(i => i.Position).Select(i => i.Url).FirstOrDefault(),
                Detail: sku);
        }).ToList();
    }

    /// <summary>Compras por proveedor, referencia o número de factura.</summary>
    private static async Task<List<SearchHit>> PurchaseOrdersAsync(
        PurchasingDbContext db, Guid tenantId, string text, int take, CancellationToken ct)
    {
        var term = $"%{text}%";
        var rows = await db.PurchaseOrders.AsNoTracking()
            .Where(p => p.TenantId == tenantId)
            .Where(p => EF.Functions.ILike(p.SupplierName, term)
                || (p.Reference != null && EF.Functions.ILike(p.Reference, term))
                || (p.InvoiceNumber != null && EF.Functions.ILike(p.InvoiceNumber, term)))
            .OrderByDescending(p => p.CreatedAtUtc)
            .Take(take)
            .ToListAsync(ct);

        return rows.Select(p => new SearchHit(
            p.Id,
            p.Reference is { Length: > 0 } r ? $"{r} · {p.SupplierName}" : p.SupplierName,
            p.Status.ToString().ToUpperInvariant(),
            AtUtc: p.CreatedAtUtc)).ToList();
    }

    /// <summary>Proveedores por nombre, CUIT o email.</summary>
    private static async Task<List<SearchHit>> SuppliersAsync(
        PurchasingDbContext db, Guid tenantId, string text, int take, CancellationToken ct)
    {
        var term = $"%{text}%";
        var rows = await db.Suppliers.AsNoTracking()
            .Where(s => s.TenantId == tenantId)
            .Where(s => EF.Functions.ILike(s.Name, term)
                || (s.TaxId != null && EF.Functions.ILike(s.TaxId, term))
                || (s.Email != null && EF.Functions.ILike(s.Email, term)))
            .OrderByDescending(s => s.Active).ThenBy(s => s.Name)
            .Take(take)
            .ToListAsync(ct);

        return rows.Select(s => new SearchHit(s.Id, s.Name, s.TaxId ?? s.Email ?? s.Country)).ToList();
    }
}

/// <summary>
/// Un resultado del buscador. El panel arma el link con el id según el grupo:
/// la API no sabe de rutas del panel.
/// </summary>
public sealed record SearchHit(
    Guid Id,
    string Title,
    string? Subtitle = null,
    string? ImageUrl = null,
    string? Detail = null,
    long? AmountMinor = null,
    string? Currency = null,
    DateTime? AtUtc = null);

/// <summary>Los grupos del buscador. Null = la persona no tiene permiso para ese grupo (no es "sin resultados").</summary>
public sealed record SearchResults(
    List<SearchHit>? Orders,
    List<SearchHit>? Customers,
    List<SearchHit>? Products,
    List<SearchHit>? PurchaseOrders,
    List<SearchHit>? Suppliers)
{
    public static readonly SearchResults Empty = new([], [], [], [], []);
}
