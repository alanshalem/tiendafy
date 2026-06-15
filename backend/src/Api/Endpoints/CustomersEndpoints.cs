using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

public static class CustomersEndpoints
{
    public static RouteGroupBuilder MapCustomerEndpoints(this RouteGroupBuilder group)
    {
        var customers = group.MapGroup("/customers");

        customers.MapGet("/", async (ITenantContext tenant, CustomersDbContext db, CancellationToken ct, string? q = null) =>
        {
            if (!tenant.HasTenant) return Bad();
            var tid = tenant.TenantId.Value;
            var query = db.Customers.AsNoTracking().Where(c => c.TenantId == tid);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = $"%{q.Trim()}%";
                query = query.Where(c => EF.Functions.ILike(c.Name, term)
                    || (c.Email != null && EF.Functions.ILike(c.Email, term))
                    || (c.Phone != null && EF.Functions.ILike(c.Phone, term)));
            }
            var items = await query.OrderByDescending(c => c.CreatedAtUtc).ToListAsync(ct);
            return Results.Ok(new { items = items.Select(ToDto) });
        });

        customers.MapPost("/", async (CustomerRequest req, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return Bad();
            var created = Customer.Create(tenant.TenantId.Value, req.Name, req.Email, req.Phone, req.Address, req.Notes);
            if (created.IsFailure) return created.Error.ToProblem();
            db.Customers.Add(created.Value);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/customers/{created.Value.Id}", ToDto(created.Value));
        });

        customers.MapPut("/{id:guid}", async (Guid id, CustomerRequest req, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return Bad();
            var tid = tenant.TenantId.Value;
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.TenantId == tid && c.Id == id, ct);
            if (customer is null) return Results.NotFound();
            var result = customer.Update(req.Name, req.Email, req.Phone, req.Address, req.Notes);
            if (result.IsFailure) return result.Error.ToProblem();
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(customer));
        });

        customers.MapDelete("/{id:guid}", async (Guid id, ITenantContext tenant, CustomersDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return Bad();
            var tid = tenant.TenantId.Value;
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.TenantId == tid && c.Id == id, ct);
            if (customer is null) return Results.NotFound();
            db.Customers.Remove(customer);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return group;
    }

    private static IResult Bad() => Results.BadRequest(new { error = "Missing X-Tenant-Id header." });

    private static object ToDto(Customer c) => new
    {
        c.Id, c.Name, c.Email, c.Phone, c.Address, c.Notes, c.CreatedAtUtc,
    };
}

public sealed record CustomerRequest(string Name, string? Email, string? Phone, string? Address, string? Notes);
