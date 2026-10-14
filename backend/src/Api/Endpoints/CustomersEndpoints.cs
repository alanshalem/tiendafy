using Api.Auth;
using Customers.Infrastructure;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

public static class CustomersEndpoints
{
    public static RouteGroupBuilder MapCustomerEndpoints(this RouteGroupBuilder group)
    {
        // Grupo 100% admin: PII de clientes. Toda lectura/escritura exige membresía.
        var customers = group.MapGroup("/customers").RequirePermission(Permission.CustomersRead).RequirePermissionForWrites(Permission.CustomersWrite);

        // Página + total: la agenda tiene un cliente por comprador, así que crece
        // con las ventas. Buscar y paginar se hacen en la base.
        customers.MapGet("/", async (
            ITenantContext tenant, CustomersDbContext db, CancellationToken ct,
            string? q = null, int? limit = null, int? offset = null) =>
        {
            var (items, total) = await Search(db, tenant.TenantId.Value, q)
                .OrderByDescending(c => c.CreatedAtUtc)
                .PageAsync(offset, limit, ct);
            return Results.Ok(new { items = items.Select(ToDto), total });
        });

        // La agenda (con la misma búsqueda que la pantalla) como planilla, para
        // llevarla a otro sistema o a una campaña. Se escribe a medida que sale
        // de la base: no tiene el tope de una página.
        customers.MapGet("/export", (ITenantContext tenant, CustomersDbContext db, CancellationToken ct, string? q = null) =>
            Api.Fiscal.VatBookCsv.Download(
                $"clientes-{DateTime.UtcNow.AddHours(-3):yyyy-MM-dd}.csv",
                "Nombre;Email;Teléfono;Dirección;Notas;Alta",
                Search(db, tenant.TenantId.Value, q)
                    .OrderByDescending(c => c.CreatedAtUtc)
                    .ThenBy(c => c.Id)
                    .AsAsyncEnumerable()
                    .Select(c => (IEnumerable<string?>)
                    [
                        Api.Fiscal.VatBookCsv.Text(c.Name),
                        Api.Fiscal.VatBookCsv.Text(c.Email),
                        Api.Fiscal.VatBookCsv.Text(c.Phone),
                        Api.Fiscal.VatBookCsv.Text(c.Address),
                        Api.Fiscal.VatBookCsv.Text(c.Notes),
                        Api.Fiscal.VatBookCsv.Date(c.CreatedAtUtc),
                    ]),
                ct));

        // Trae a la agenda a los compradores de las ventas anteriores. De acá en
        // más cada venta pagada deja su ficha sola (PaidOrderSideEffects); esto
        // es para el histórico que quedó afuera.
        customers.MapPost("/sync-from-orders", async (
            ITenantContext tenant, global::Orders.Infrastructure.Persistence.OrdersDbContext ordersDb,
            Api.Crm.CustomerDirectory directory, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var orders = await ordersDb.Orders.AsNoTracking()
                .Where(o => o.TenantId == tid && o.PaidAtUtc != null)
                .OrderByDescending(o => o.PaidAtUtc)
                .Take(5000)
                .ToListAsync(ct);

            var touched = 0;
            foreach (var order in orders)
                if (await directory.UpsertFromOrderAsync(order, ct))
                    touched++;

            return Results.Ok(new { imported = touched, scanned = orders.Count });
        }).RequirePermission(Permission.CustomersWrite);

        customers.MapPost("/", async (CustomerRequest req, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            var created = Customer.Create(tenant.TenantId.Value, req.Name, req.Email, req.Phone, req.Address, req.Notes);
            if (created.IsFailure) return created.Error.ToProblem();
            created.Value.SetPriceList(req.PriceListId);
            db.Customers.Add(created.Value);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/customers/{created.Value.Id}", ToDto(created.Value));
        });

        customers.MapPut("/{id:guid}", async (Guid id, CustomerRequest req, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.TenantId == tid && c.Id == id, ct);
            if (customer is null) return Results.NotFound();
            var result = customer.Update(req.Name, req.Email, req.Phone, req.Address, req.Notes);
            if (result.IsFailure) return result.Error.ToProblem();
            customer.SetPriceList(req.PriceListId);
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


    /// <summary>La búsqueda de la agenda: una sola para la página y para el export.</summary>
    private static IQueryable<Customer> Search(CustomersDbContext db, Guid tenantId, string? q)
    {
        var query = db.Customers.AsNoTracking().Where(c => c.TenantId == tenantId);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = $"%{q.Trim()}%";
            // Phone/Address están cifradas en reposo → no se pueden buscar (ni tendría
            // sentido el ILIKE sobre ciphertext). Búsqueda por nombre + email.
            query = query.Where(c => EF.Functions.ILike(c.Name, term)
                || (c.Email != null && EF.Functions.ILike(c.Email, term)));
        }
        return query;
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
    };
}

public sealed record CustomerRequest(
    string Name, string? Email, string? Phone, string? Address, string? Notes, Guid? PriceListId = null);
