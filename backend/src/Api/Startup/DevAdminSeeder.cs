using Identity.Infrastructure;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Tenancy.Infrastructure.Persistence;

namespace Api.Startup;

/// <summary>
/// Dev: un usuario de prueba por cada rol, con membresía a TODAS las tiendas
/// existentes, para probar el panel como lo ve cada uno sin armar el equipo a
/// mano. Credenciales en docs/usuarios-de-prueba.md.
///
/// Corre al arrancar la API y es idempotente: crea las cuentas y membresías
/// que faltan y no toca las que existen (un rol cambiado desde el panel para
/// probar se respeta; alguien sacado de una tienda vuelve a entrar con su rol
/// de siempre). Las tiendas creadas después reciben al equipo al reiniciar.
/// </summary>
public static class DevAdminSeeder
{
    public const string Email = "admin@tiendafy.local";
    public const string SuperAdminEmail = "superadmin@tiendafy.local";
    public const string Password = "password123";

    /// <summary>Cada cuenta de prueba con su rol. El "admin" histórico es el dueño; el superadmin opera la plataforma.</summary>
    public static readonly IReadOnlyList<(string Email, string Name, string Role)> Team =
    [
        (Email, "Admin Dev", Roles.Owner),
        (SuperAdminEmail, "Superadmin de prueba", Roles.Owner),
        ("duenio@tiendafy.local", "Dueña de prueba", Roles.Owner),
        ("administrador@tiendafy.local", "Administrador de prueba", Roles.Admin),
        ("vendedor@tiendafy.local", "Vendedor de prueba", Roles.Vendedor),
        ("catalogo@tiendafy.local", "Catálogo de prueba", Roles.Catalogo),
        ("finanzas@tiendafy.local", "Finanzas de prueba", Roles.Finanzas),
        ("soporte@tiendafy.local", "Soporte de prueba", Roles.Soporte),
    ];

    public static async Task SeedDevAdminAsync(this IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var idDb = scope.ServiceProvider.GetRequiredService<AppIdentityDbContext>();
        var tenants = scope.ServiceProvider.GetRequiredService<TenancyDbContext>();

        var tenantIds = await tenants.Tenants.AsNoTracking().Select(t => t.Id).ToListAsync();

        foreach (var (email, name, role) in Team)
        {
            var isSuperAdmin = string.Equals(email, SuperAdminEmail, StringComparison.OrdinalIgnoreCase);
            var user = await users.FindByEmailAsync(email);
            if (user is null)
            {
                user = new AppUser
                {
                    UserName = email,
                    Email = email,
                    EmailConfirmed = true,
                    DisplayName = name,
                    IsSuperAdmin = isSuperAdmin,
                };
                if (!(await users.CreateAsync(user, Password)).Succeeded) continue;
            }
            else if (isSuperAdmin && !user.IsSuperAdmin)
            {
                user.IsSuperAdmin = true;
                await users.UpdateAsync(user);
            }

            var userId = user.Id;
            var existing = (await idDb.TenantMemberships.Where(m => m.UserId == userId)
                .Select(m => m.TenantId).ToListAsync()).ToHashSet();
            idDb.TenantMemberships.AddRange(tenantIds
                .Where(existing.Add)
                .Select(tid => TenantMembership.Create(userId, tid, role)));
        }

        await idDb.SaveChangesAsync();
    }
}
