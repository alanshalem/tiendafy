using Identity.Infrastructure;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Tenancy.Infrastructure.Persistence;

namespace Api.Startup;

/// <summary>
/// Dev: crea un usuario admin de prueba con membresía a TODAS las tiendas
/// existentes, para poder entrar con login local sin quedarte sin stores.
/// Credenciales en docs/usuarios-de-prueba.md. Idempotente.
/// </summary>
public static class DevAdminSeeder
{
    public const string Email = "admin@tiendafy.local";
    public const string Password = "password123";

    public static async Task SeedDevAdminAsync(this IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var idDb = scope.ServiceProvider.GetRequiredService<AppIdentityDbContext>();
        var tenants = scope.ServiceProvider.GetRequiredService<TenancyDbContext>();

        var user = await users.FindByEmailAsync(Email);
        if (user is null)
        {
            user = new AppUser { UserName = Email, Email = Email, EmailConfirmed = true, DisplayName = "Admin Dev" };
            var created = await users.CreateAsync(user, Password);
            if (!created.Succeeded) return;
        }

        var tenantIds = await tenants.Tenants.AsNoTracking().Select(t => t.Id).ToListAsync();
        var existing = (await idDb.TenantMemberships.Where(m => m.UserId == user.Id).Select(m => m.TenantId).ToListAsync()).ToHashSet();
        var added = false;
        foreach (var tid in tenantIds)
        {
            if (existing.Add(tid))
            {
                idDb.TenantMemberships.Add(TenantMembership.Create(user.Id, tid));
                added = true;
            }
        }
        if (added) await idDb.SaveChangesAsync();
    }
}
