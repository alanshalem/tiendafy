using Api.Shop;
using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Tenancy.Infrastructure.Persistence;

namespace Api.Startup;

/// <summary>
/// Dev: siembra compradores de prueba en cada tienda para poder testear login.
/// Credenciales en docs/usuarios-de-prueba.md. Idempotente.
/// </summary>
public static class ShopperSeeder
{
    private const string TestPassword = "password123";
    private static readonly (string Name, string Email)[] TestUsers =
    {
        ("Ana Test", "ana@test.com"),
        ("Bruno Test", "bruno@test.com"),
    };

    public static async Task SeedTestShoppersAsync(this IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var tenants = scope.ServiceProvider.GetRequiredService<TenancyDbContext>();
        var db = scope.ServiceProvider.GetRequiredService<CustomersDbContext>();

        var tenantIds = await tenants.Tenants.AsNoTracking().Select(t => t.Id).ToListAsync();
        var added = false;
        foreach (var tid in tenantIds)
        {
            foreach (var (name, email) in TestUsers)
            {
                if (await db.Customers.AnyAsync(c => c.TenantId == tid && c.Email == email)) continue;
                var created = Customer.CreateShopper(tid, name, email, emailVerified: true);
                if (created.IsFailure) continue;
                var customer = created.Value;
                customer.SetPasswordHash(ShopAuth.HashPassword(customer, TestPassword));
                db.Customers.Add(customer);
                added = true;
            }
        }
        if (added) await db.SaveChangesAsync();
    }
}
