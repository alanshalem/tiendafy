using Catalog.Core.Domain;
using Catalog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Api.Pricing;

/// <summary>
/// Arma el <see cref="PriceResolver"/> de una tienda: trae las listas y los
/// precios escritos a mano y los deja listos para responder.
///
/// Se trae TODO de una vez y no lista por lista. Una lista se calcula sobre
/// otra, así que resolver un precio puede recorrer la cadena entera: pedir cada
/// escalón a la base convertiría una pantalla de 50 productos en cientos de
/// consultas. Las listas son pocas —una tienda tiene tres o cuatro— y los
/// precios a mano son la excepción, así que entran holgados en memoria.
///
/// Scoped: dentro de un request se cachea, porque la misma pantalla resuelve
/// muchos precios contra las mismas listas.
/// </summary>
public sealed class PriceListService(CatalogDbContext db)
{
    private PriceResolver? _cached;
    private TenantId _cachedFor;

    public async Task<PriceResolver> LoadAsync(TenantId tenantId, CancellationToken ct)
    {
        if (_cached is not null && _cachedFor == tenantId) return _cached;

        var lists = await db.PriceLists.AsNoTracking().Where(l => l.TenantId == tenantId).ToListAsync(ct);
        var overrides = lists.Count == 0
            ? []
            : await db.PriceListItems.AsNoTracking().Where(i => i.TenantId == tenantId).ToListAsync(ct);

        _cachedFor = tenantId;
        _cached = new PriceResolver(lists, overrides);
        return _cached;
    }

    /// <summary>
    /// La lista de un cliente, si tiene una y sigue activa. Una lista apagada
    /// no se le aplica a nadie: apagarla es justamente la forma de dejar de
    /// usarla sin tener que desasignarla cliente por cliente.
    /// </summary>
    public async Task<Guid?> ActiveListForAsync(TenantId tenantId, Guid? priceListId, CancellationToken ct)
    {
        if (priceListId is not { } id) return null;
        var active = await db.PriceLists.AsNoTracking()
            .AnyAsync(l => l.Id == id && l.TenantId == tenantId && l.Active, ct);
        return active ? id : null;
    }
}
