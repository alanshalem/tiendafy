using Api.Auth;
using Api.Import;
using Catalog.Core.Features.UpdateProduct;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static partial class ProductEndpoints
{
    /// <summary>
    /// Lo que se usa con el producto en la mano: kits, buscar por codigo de
    /// barras, imprimir etiquetas, asignar un EAN. Es el deposito, no el
    /// catalogo.
    /// </summary>
    private static void MapWarehouse(RouteGroupBuilder products)
    {

        // ---- Kits (BOM liviano): componentes que se descuentan al vender ----
        // Los kits de a una página, con búsqueda por nombre o SKU del kit o de
        // cualquiera de sus componentes (en la base: antes llegaban todos y el
        // panel filtraba lo que tenía).
        products.MapGet("/kits", async (
            ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb,
            Catalog.Contracts.ICatalogCheckoutQuery catalogQuery, CancellationToken ct,
            string? q = null, int? offset = null, int? limit = null) =>
        {
            var kitRows = catalogDb.KitComponents.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(q))
            {
                var matching = Catalog.Infrastructure.Persistence.ProductTextSearch
                    .Matching(catalogDb.Products.AsNoTracking(), q, includeSku: true)
                    .SelectMany(p => p.Variants.Select(v => v.Id));
                kitRows = kitRows.Where(c => matching.Contains(c.KitVariantId) || matching.Contains(c.ComponentVariantId));
            }
            var (kitIds, total) = await kitRows
                .Select(c => c.KitVariantId).Distinct().OrderBy(id => id)
                .PageAsync(offset, limit, ct);
            var components = await catalogDb.KitComponents.AsNoTracking()
                .Where(c => kitIds.Contains(c.KitVariantId))
                .ToListAsync(ct);
            var allIds = components.SelectMany(c => new[] { c.KitVariantId, c.ComponentVariantId }).Distinct().ToList();
            var names = allIds.Count == 0
                ? []
                : (await catalogQuery.GetVariantsAsync(tenant.TenantId.Value, allIds, ct)).ToDictionary(v => v.VariantId);

            string Label(Guid id) => names.TryGetValue(id, out var v)
                ? $"{v.ProductName}{(v.VariantDescription is "Única" or "" ? "" : $" · {v.VariantDescription}")}"
                : "(variante borrada)";

            return Results.Ok(new
            {
                total,
                items = components.GroupBy(c => c.KitVariantId).OrderBy(g => kitIds.IndexOf(g.Key)).Select(g => new
                {
                    kitVariantId = g.Key,
                    kitLabel = Label(g.Key),
                    kitSku = names.TryGetValue(g.Key, out var kv) ? kv.Sku : "",
                    components = g.Select(c => new
                    {
                        componentVariantId = c.ComponentVariantId,
                        label = Label(c.ComponentVariantId),
                        sku = names.TryGetValue(c.ComponentVariantId, out var cv) ? cv.Sku : "",
                        quantity = c.Quantity,
                    }),
                }),
            });
        }).RequirePermission(Permission.CatalogWrite);

        products.MapPut("/variants/{variantId:guid}/kit", async (
            Guid variantId, SetKitRequest request, ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb,
            Catalog.Contracts.ICatalogCheckoutQuery catalogQuery, CancellationToken ct) =>
        {
            var entries = request.Components ?? [];
            if (entries.Any(e => e.Quantity is < 1 or > 999))
                return Error.Validation("Kit.InvalidQuantity", "Cantidades entre 1 y 999.").ToProblem();
            if (entries.Any(e => e.ComponentVariantId == variantId))
                return Error.Validation("Kit.SelfReference", "Un kit no puede contenerse a sí mismo.").ToProblem();
            if (entries.Select(e => e.ComponentVariantId).Distinct().Count() != entries.Count)
                return Error.Validation("Kit.Duplicate", "Cada componente va una sola vez.").ToProblem();

            var ids = entries.Select(e => e.ComponentVariantId).Append(variantId).Distinct().ToList();
            var known = (await catalogQuery.GetVariantsAsync(tenant.TenantId.Value, ids, ct))
                .Select(v => v.VariantId).ToHashSet();
            if (ids.Any(id => !known.Contains(id)))
                return Error.NotFound("Kit.VariantNotFound", "Alguna variante no existe.").ToProblem();

            // Sin kits anidados: un componente no puede tener BOM propio.
            var componentIds = entries.Select(e => e.ComponentVariantId).ToList();
            if (componentIds.Count > 0 && await catalogDb.KitComponents.AnyAsync(k => componentIds.Contains(k.KitVariantId), ct))
                return Error.Validation("Kit.Nested", "Un componente no puede ser a su vez un kit.").ToProblem();

            var existing = await catalogDb.KitComponents.Where(k => k.KitVariantId == variantId).ToListAsync(ct);
            catalogDb.KitComponents.RemoveRange(existing);
            foreach (var e in entries)
                catalogDb.KitComponents.Add(new Catalog.Infrastructure.KitComponent(
                    tenant.TenantId.Value, variantId, e.ComponentVariantId, e.Quantity));
            await catalogDb.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // ---- Escáner: buscar variante por código de barras o SKU ----
        // Lo usa el depósito (buscar/ajustar/picking); permiso de inventario
        // explícito porque los GET del grupo son públicos.
        products.MapGet("/by-code/{code}", async (
            string code, ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb,
            Inventory.Core.Domain.IStockRepository stock, CancellationToken ct) =>
        {
            var needle = code.Trim();
            if (needle.Length == 0) return Results.NotFound();

            var product = await catalogDb.Products.AsNoTracking()
                .FirstOrDefaultAsync(p => p.TenantId == tenant.TenantId
                    && p.Variants.Any(v => v.Barcode == needle || v.Sku == needle), ct);
            var variant = product?.Variants.FirstOrDefault(v => v.Barcode == needle || v.Sku == needle);
            if (product is null || variant is null) return Results.NotFound();

            var stockRows = await stock.GetByVariantsAsync(tenant.TenantId, [variant.Id], ct);
            var stockItem = stockRows.Count > 0 ? stockRows[0] : null;
            return Results.Ok(new
            {
                productId = product.Id,
                productName = product.Name,
                imageUrl = product.Images.OrderBy(i => i.Position).FirstOrDefault()?.Url,
                variantId = variant.Id,
                sku = variant.Sku,
                barcode = variant.Barcode,
                description = variant.OptionValues.Count > 0 ? string.Join(" / ", variant.OptionValues) : "Única",
                priceAmount = variant.Price.AmountInMinorUnits,
                available = stockItem?.Available ?? 0,
                reserved = stockItem?.Reserved ?? 0,
                location = stockItem?.Location,
            });
        }).RequirePermission(Permission.InventoryRead);

        // ---- Etiquetas QR imprimibles (plancha A4) ----
        products.MapGet("/labels", async (
            string variantIds, ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb, CancellationToken ct) =>
        {
            var ids = variantIds.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => Guid.TryParse(s.Trim(), out var g) ? g : Guid.Empty)
                .Where(g => g != Guid.Empty).Take(240).ToHashSet();
            if (ids.Count == 0) return Results.BadRequest();

            // Query directa por las variantes pedidas: cargar el catálogo entero
            // (con imágenes y opciones) para imprimir ≤240 etiquetas no escala.
            var all = await catalogDb.Products.AsNoTracking()
                .Where(p => p.TenantId == tenant.TenantId && p.Variants.Any(v => ids.Contains(v.Id)))
                .ToListAsync(ct);
            var labels = all
                .SelectMany(p => p.Variants
                    .Where(v => ids.Contains(v.Id))
                    .Select(v => new VariantLabel(
                        p.Name,
                        v.OptionValues.Count > 0 ? string.Join(" / ", v.OptionValues) : "",
                        v.Sku,
                        v.Barcode ?? v.Sku,
                        v.Price.AmountInMinorUnits)))
                .ToList();
            if (labels.Count == 0) return Results.NotFound();

            var pdf = VariantLabelsPdf.Render(labels);
            return Results.File(pdf, "application/pdf", "etiquetas.pdf");
        }).RequirePermission(Permission.InventoryRead);

        // Asignar el código escaneado a una variante (flujo del Escáner:
        // "EAN desconocido → buscá por SKU → asignar").
        products.MapPut("/{id:guid}/variants/{variantId:guid}/barcode", async (
            Guid id, Guid variantId, SetBarcodeRequest request, ITenantContext tenant,
            UpdateProductHandler handler, CancellationToken ct) =>
        {
            var result = await handler.SetVariantBarcodeAsync(tenant.TenantId, id, variantId, request.Barcode, ct);
            return result.IsSuccess ? Results.NoContent() : result.Error.ToProblem();
        });

        // Peso y medidas del paquete de una unidad: con esto cotizan los correos.
        products.MapPut("/{id:guid}/variants/{variantId:guid}/shipping", async (
            Guid id, Guid variantId, SetVariantShippingRequest request, ITenantContext tenant,
            UpdateProductHandler handler, CancellationToken ct) =>
        {
            var result = await handler.SetVariantShippingAsync(tenant.TenantId, id, variantId,
                request.WeightGrams, request.LengthCm, request.WidthCm, request.HeightCm, ct);
            return result.IsSuccess ? Results.NoContent() : result.Error.ToProblem();
        });

        // Costo sugerido de un kit: la suma del costo de sus componentes por
        // cantidad. Sin esto, el costo del combo era un número a mano y la
        // rentabilidad de los kits dependía de que alguien hiciera la cuenta.
        products.MapGet("/kits/suggested-costs", async (
            ITenantContext tenant,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb, CancellationToken ct) =>
        {
            var components = await catalogDb.KitComponents.AsNoTracking().ToListAsync(ct);
            if (components.Count == 0) return Results.Ok(new { items = Array.Empty<object>() });

            var neededIds = components.Select(c => c.ComponentVariantId).Distinct().ToList();
            var costByVariant = (await catalogDb.Products.AsNoTracking()
                    .Where(p => p.TenantId == tenant.TenantId && p.Variants.Any(v => neededIds.Contains(v.Id)))
                    .ToListAsync(ct))
                .SelectMany(p => p.Variants)
                .Where(v => v.Cost is not null)
                .ToDictionary(v => v.Id, v => v.Cost!.Value.AmountInMinorUnits);

            var items = components
                .GroupBy(c => c.KitVariantId)
                .Select(g => new
                {
                    kitVariantId = g.Key,
                    // null = falta el costo de algún componente (no se puede sumar).
                    suggestedCostMinor = g.All(c => costByVariant.ContainsKey(c.ComponentVariantId))
                        ? g.Sum(c => costByVariant[c.ComponentVariantId] * c.Quantity)
                        : (long?)null,
                })
                .ToList();
            return Results.Ok(new { items });
        }).RequirePermission(Permission.CostsRead);
    }
}
