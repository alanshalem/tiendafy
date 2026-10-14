using Api.Auth;
using Api.Crm;
using Customers.Infrastructure;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

public static class CustomersEndpoints
{
    /// <summary>Ventas que trae la ficha de un cliente: alcanza para ver su historia sin paginar.</summary>
    private const int ProfileOrdersLimit = 50;

    public static RouteGroupBuilder MapCustomerEndpoints(this RouteGroupBuilder group)
    {
        // Grupo 100% admin: PII de clientes. Toda lectura/escritura exige membresía.
        var customers = group.MapGroup("/customers").RequirePermission(Permission.CustomersRead).RequirePermissionForWrites(Permission.CustomersWrite);

        // Página + total: la agenda tiene un cliente por comprador, así que crece
        // con las ventas. Buscar, filtrar por segmento, ordenar y paginar se
        // hacen en la base, con el resumen de compras que guarda cada ficha.
        customers.MapGet("/", async (
            ITenantContext tenant, CustomersDbContext db, CancellationToken ct,
            [AsParameters] CustomerListQuery filter, int? limit = null, int? offset = null) =>
        {
            var query = await SearchAsync(db, tenant.TenantId.Value, filter, ct);
            var (items, total) = await Sort(query, filter.Sort, filter.Desc).PageAsync(offset, limit, ct);
            return Results.Ok(new { items = items.Select(ToDto), total });
        });

        // La agenda (con la misma búsqueda que la pantalla) como planilla, para
        // llevarla a otro sistema o a una campaña. Se escribe a medida que sale
        // de la base: no tiene el tope de una página.
        customers.MapGet("/export", async (
            ITenantContext tenant, CustomersDbContext db, CancellationToken ct,
            [AsParameters] CustomerListQuery filter) =>
        {
            var query = await SearchAsync(db, tenant.TenantId.Value, filter, ct);
            return Api.Fiscal.VatBookCsv.Download(
                $"clientes-{DateTime.UtcNow.AddHours(-3):yyyy-MM-dd}.csv",
                "Nombre;Email;Teléfono;Dirección;Notas;Etiquetas;Compras;Total gastado;Última compra;Alta",
                Sort(query, filter.Sort, filter.Desc)
                    .ThenBy(c => c.Id)
                    .AsAsyncEnumerable()
                    .Select(c => (IEnumerable<string?>)
                    [
                        Api.Fiscal.VatBookCsv.Text(c.Name),
                        Api.Fiscal.VatBookCsv.Text(c.Email),
                        Api.Fiscal.VatBookCsv.Text(c.Phone),
                        Api.Fiscal.VatBookCsv.Text(c.Address),
                        Api.Fiscal.VatBookCsv.Text(c.Notes),
                        Api.Fiscal.VatBookCsv.Text(string.Join(", ", c.Tags)),
                        c.OrdersCount.ToString(System.Globalization.CultureInfo.InvariantCulture),
                        Api.Fiscal.VatBookCsv.Amount(c.TotalSpentMinor / 100m),
                        c.LastOrderAtUtc is { } last ? Api.Fiscal.VatBookCsv.Date(last) : "",
                        Api.Fiscal.VatBookCsv.Date(c.CreatedAtUtc),
                    ]),
                ct);
        });

        // Las etiquetas que ya se usan en la tienda: el filtro de la agenda y
        // las sugerencias al etiquetar, para no terminar con "VIP", "vip" y "Vip".
        customers.MapGet("/tags", async (ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var lists = await db.Customers.AsNoTracking()
                .Where(c => c.TenantId == tid && c.Tags.Count > 0)
                .Select(c => c.Tags)
                .ToListAsync(ct);
            var tags = lists.SelectMany(t => t)
                .GroupBy(t => t, StringComparer.OrdinalIgnoreCase)
                .Select(g => new { tag = g.First(), count = g.Count() })
                .OrderByDescending(t => t.count).ThenBy(t => t.tag, StringComparer.OrdinalIgnoreCase)
                .ToList();
            return Results.Ok(new { items = tags });
        });

        // La ficha de un cliente: datos, resumen de compras, su historia de
        // ventas. El resumen se calcula en vivo con las ventas y, si la foto
        // guardada en la agenda quedó atrás (un reembolso que no pasó por acá),
        // se corrige de paso: así la columna de la agenda y la ficha no se
        // contradicen después de que alguien la mira.
        customers.MapGet("/{id:guid}", async (
            Guid id, HttpContext http, ITenantContext tenant, CustomersDbContext db,
            CustomerDirectory directory, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.TenantId == tid && c.Id == id, ct);
            if (customer is null) return Results.NotFound();

            var orders = await directory.OrdersOfAsync(customer, ProfileOrdersLimit + 1, ct);
            var stats = CustomerDirectory.Summarize(orders);
            // Con más ventas que las que se muestran, el resumen va con TODAS.
            if (orders.Count > ProfileOrdersLimit)
            {
                await directory.RestateAsync(customer, ct);
                stats = new PurchaseStats(customer.OrdersCount, customer.TotalSpentMinor, customer.LastOrderAtUtc,
                    stats.FirstAtUtc);
            }
            else
            {
                customer.SetPurchaseStats(stats.Count, stats.SpentMinor, stats.LastAtUtc);
            }
            await db.SaveChangesAsync(ct);

            // El historial dice qué compró y cuánto: es información de ventas, y
            // quien solo ve la agenda no tiene por qué verla línea por línea.
            var canSeeOrders = (await http.GetAccessAsync())?.Can(Permission.OrdersRead) == true;

            return Results.Ok(new
            {
                customer = ToDto(customer),
                stats = new
                {
                    ordersCount = stats.Count,
                    totalSpentMinor = stats.SpentMinor,
                    averageTicketMinor = stats.AverageMinor,
                    lastOrderAtUtc = stats.LastAtUtc,
                    firstOrderAtUtc = stats.FirstAtUtc,
                    currency = orders.FirstOrDefault()?.Currency ?? "ARS",
                },
                orders = canSeeOrders
                    ? orders.Take(ProfileOrdersLimit).Select(o => new
                    {
                        id = o.Id,
                        status = o.Status.ToString().ToUpperInvariant(),
                        createdAtUtc = o.CreatedAtUtc,
                        paidAtUtc = o.PaidAtUtc,
                        totalMinor = o.Total.AmountInMinorUnits,
                        currency = o.Currency,
                        itemsCount = o.Items.Sum(i => i.Quantity),
                        firstItem = o.Items.Select(i => i.ProductName).FirstOrDefault(),
                    })
                    : null,
                hasMoreOrders = canSeeOrders && orders.Count > ProfileOrdersLimit,
            });
        });

        // Trae a la agenda a los compradores de las ventas anteriores. De acá en
        // más cada venta pagada deja su ficha sola (PaidOrderSideEffects); esto
        // es para el histórico que quedó afuera. De paso recalcula el resumen de
        // compras de toda la agenda.
        customers.MapPost("/sync-from-orders", async (
            ITenantContext tenant, global::Orders.Infrastructure.Persistence.OrdersDbContext ordersDb,
            CustomerDirectory directory, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var orders = await ordersDb.Orders.AsNoTracking()
                .Where(o => o.TenantId == tid && o.PaidAtUtc != null)
                .OrderByDescending(o => o.PaidAtUtc)
                .Take(5000)
                .ToListAsync(ct);

            var touched = 0;
            foreach (var order in orders)
                if (await directory.UpsertFromOrderAsync(order, ct, restate: false))
                    touched++;
            await directory.RestateAllAsync(tid.Value, ct);

            return Results.Ok(new { imported = touched, scanned = orders.Count });
        }).RequirePermission(Permission.CustomersWrite);

        customers.MapPost("/", async (CustomerRequest req, ITenantContext tenant, CustomersDbContext db,
            CustomerDirectory directory, CancellationToken ct) =>
        {
            var created = Customer.Create(tenant.TenantId.Value, req.Name, req.Email, req.Phone, req.Address, req.Notes);
            if (created.IsFailure) return created.Error.ToProblem();
            created.Value.SetPriceList(req.PriceListId);
            if (req.Tags is not null && created.Value.SetTags(req.Tags) is { IsFailure: true } badTags)
                return badTags.Error.ToProblem();
            // Alguien que ya compró y recién ahora se carga a mano llega con su historia.
            await directory.RestateAsync(created.Value, ct);
            db.Customers.Add(created.Value);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/customers/{created.Value.Id}", ToDto(created.Value));
        });

        customers.MapPut("/{id:guid}", async (Guid id, CustomerRequest req, ITenantContext tenant, CustomersDbContext db,
            CustomerDirectory directory, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.TenantId == tid && c.Id == id, ct);
            if (customer is null) return Results.NotFound();
            var previousEmail = customer.Email;
            var result = customer.Update(req.Name, req.Email, req.Phone, req.Address, req.Notes);
            if (result.IsFailure) return result.Error.ToProblem();
            customer.SetPriceList(req.PriceListId);
            // Null = el formulario no manda etiquetas (el modal de edición no las
            // toca): no se borran las que se pusieron desde la ficha.
            if (req.Tags is not null && customer.SetTags(req.Tags) is { IsFailure: true } badTags)
                return badTags.Error.ToProblem();
            // Otro email son otras ventas.
            if (!string.Equals(previousEmail, customer.Email, StringComparison.OrdinalIgnoreCase))
                await directory.RestateAsync(customer, ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(customer));
        });

        // Notas y etiquetas sueltas, desde la ficha: escribir una nota no tiene
        // por qué reenviar (y revalidar) nombre, email y dirección.
        customers.MapPatch("/{id:guid}", async (Guid id, CustomerPatchRequest req, ITenantContext tenant,
            CustomersDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.TenantId == tid && c.Id == id, ct);
            if (customer is null) return Results.NotFound();
            if (req.Notes is not null && customer.SetNotes(req.Notes) is { IsFailure: true } badNotes)
                return badNotes.Error.ToProblem();
            if (req.Tags is not null && customer.SetTags(req.Tags) is { IsFailure: true } badTags)
                return badTags.Error.ToProblem();
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(customer));
        });

        customers.MapDelete("/{id:guid}", async (Guid id, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.TenantId == tid && c.Id == id, ct);
            if (customer is null) return Results.NotFound();
            db.Customers.Remove(customer);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return group;
    }

    /// <summary>
    /// La búsqueda y los segmentos de la agenda: una sola para la página y para
    /// el export.
    /// </summary>
    private static async Task<IQueryable<Customer>> SearchAsync(
        CustomersDbContext db, Guid tenantId, CustomerListQuery filter, CancellationToken ct)
    {
        var query = db.Customers.AsNoTracking().Where(c => c.TenantId == tenantId);
        if (!string.IsNullOrWhiteSpace(filter.Q))
        {
            var term = $"%{filter.Q.Trim()}%";
            var byPhone = await CustomerPhoneSearch.MatchingIdsAsync(db, tenantId, filter.Q, ct);
            query = query.Where(c => EF.Functions.ILike(c.Name, term)
                || (c.Email != null && EF.Functions.ILike(c.Email, term))
                || byPhone.Contains(c.Id));
        }

        // Segmentos: "compró N veces o más", "no compra hace N días" (solo los que
        // alguna vez compraron: el que nunca compró es otro segmento), "nunca compró".
        if (filter.MinOrders is int min and > 0) query = query.Where(c => c.OrdersCount >= min);
        if (filter.InactiveDays is int days and > 0)
        {
            var since = DateTime.UtcNow.AddDays(-days);
            query = query.Where(c => c.LastOrderAtUtc != null && c.LastOrderAtUtc < since);
        }
        if (filter.NeverBought == true) query = query.Where(c => c.OrdersCount == 0);
        if (!string.IsNullOrWhiteSpace(filter.Tag))
        {
            // Las etiquetas se guardan como se escribieron; se filtra sin mayúsculas.
            var tag = filter.Tag.Trim().ToLower();
            query = query.Where(c => c.Tags.Any(t => t.ToLower() == tag));
        }
        return query;
    }

    /// <summary>Orden de la agenda. Sin pedido: los más nuevos primero, como siempre.</summary>
    private static IOrderedQueryable<Customer> Sort(IQueryable<Customer> query, string? sort, bool? desc)
    {
        var descending = desc ?? true;
        return (sort?.ToLowerInvariant()) switch
        {
            "name" => descending ? query.OrderByDescending(c => c.Name) : query.OrderBy(c => c.Name),
            "orders" => descending
                ? query.OrderByDescending(c => c.OrdersCount).ThenByDescending(c => c.TotalSpentMinor)
                : query.OrderBy(c => c.OrdersCount).ThenBy(c => c.TotalSpentMinor),
            "spent" => descending ? query.OrderByDescending(c => c.TotalSpentMinor) : query.OrderBy(c => c.TotalSpentMinor),
            // Los que nunca compraron (sin fecha) van al final en los dos sentidos:
            // ordenar por "última compra" es mirar a los que compraron.
            "last" => descending
                ? query.OrderBy(c => c.LastOrderAtUtc == null).ThenByDescending(c => c.LastOrderAtUtc)
                : query.OrderBy(c => c.LastOrderAtUtc == null).ThenBy(c => c.LastOrderAtUtc),
            _ => descending ? query.OrderByDescending(c => c.CreatedAtUtc) : query.OrderBy(c => c.CreatedAtUtc),
        };
    }

    private static object ToDto(Customer c) => new
    {
        c.Id,
        c.Name,
        c.Email,
        c.Phone,
        c.Address,
        c.Notes,
        c.PriceListId,
        c.CreatedAtUtc,
        c.Tags,
        c.OrdersCount,
        c.TotalSpentMinor,
        c.LastOrderAtUtc,
    };
}

/// <summary>Búsqueda, segmentos y orden de la agenda (query string).</summary>
public sealed record CustomerListQuery(
    string? Q = null,
    string? Sort = null,
    bool? Desc = null,
    int? MinOrders = null,
    int? InactiveDays = null,
    bool? NeverBought = null,
    string? Tag = null);

public sealed record CustomerRequest(
    string Name, string? Email, string? Phone, string? Address, string? Notes, Guid? PriceListId = null,
    List<string>? Tags = null);

public sealed record CustomerPatchRequest(string? Notes = null, List<string>? Tags = null);
