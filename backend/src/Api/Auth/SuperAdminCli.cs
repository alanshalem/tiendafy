using Identity.Infrastructure;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Tenancy.Infrastructure.Persistence;

namespace Api.Auth;

/// <summary>Cómo terminó un <c>make-superadmin</c>.</summary>
public enum SuperAdminCliOutcome
{
    /// <summary>La cuenta no existía: se creó como superadministrador y dueña de todas las tiendas.</summary>
    Created,
    /// <summary>La cuenta ya existía: quedó como superadministrador y dueña de todas las tiendas.</summary>
    Promoted,
    /// <summary>La cuenta no existía y no se indicó contraseña para crearla.</summary>
    PasswordRequired,
    /// <summary>La contraseña no cumple las reglas o los datos son inválidos.</summary>
    ValidationFailed,
}

/// <summary>
/// Mantenimiento: <c>dotnet Api.dll make-superadmin &lt;email&gt; [contraseña] [nombre]</c>
/// crea o promueve la cuenta de superadministrador de la plataforma (la única que
/// puede ver y editar la pantalla de Configuración de la plataforma).
///
/// <para>
/// Así la cuenta demo o compartida (<c>admin@…</c>) queda como dueño normal de
/// las tiendas sin acceso a las llaves de la plataforma, y quien opera el
/// servidor entra con su propia cuenta de superadministrador.
/// </para>
/// </summary>
public static class SuperAdminCli
{
    public const string Command = "make-superadmin";

    public static async Task<(SuperAdminCliOutcome Outcome, string? Error)> RunAsync(
        IServiceProvider services,
        string email,
        string? password = null,
        string? displayName = null)
    {
        using var scope = services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var idDb = scope.ServiceProvider.GetRequiredService<AppIdentityDbContext>();
        var tenants = scope.ServiceProvider.GetRequiredService<TenancyDbContext>();

        var normalizedEmail = email.Trim();
        var user = await users.FindByEmailAsync(normalizedEmail);
        var created = false;

        if (user is null)
        {
            if (string.IsNullOrWhiteSpace(password))
                return (SuperAdminCliOutcome.PasswordRequired, "La cuenta no existe: pasá también una contraseña para crearla.");

            user = new AppUser
            {
                UserName = normalizedEmail,
                Email = normalizedEmail,
                EmailConfirmed = true,
                DisplayName = string.IsNullOrWhiteSpace(displayName) ? "Superadministrador" : displayName.Trim(),
                IsSuperAdmin = true,
            };

            var createResult = await users.CreateAsync(user, password);
            if (!createResult.Succeeded)
            {
                var msg = string.Join(" ", createResult.Errors.Select(e => e.Description));
                return (SuperAdminCliOutcome.ValidationFailed, msg);
            }
            created = true;
        }
        else
        {
            user.IsSuperAdmin = true;
            user.EmailConfirmed = true;
            if (!string.IsNullOrWhiteSpace(displayName))
                user.DisplayName = displayName.Trim();

            var updateResult = await users.UpdateAsync(user);
            if (!updateResult.Succeeded)
            {
                var msg = string.Join(" ", updateResult.Errors.Select(e => e.Description));
                return (SuperAdminCliOutcome.ValidationFailed, msg);
            }

            if (!string.IsNullOrWhiteSpace(password))
            {
                var token = await users.GeneratePasswordResetTokenAsync(user);
                var passResult = await users.ResetPasswordAsync(user, token, password);
                if (!passResult.Succeeded)
                {
                    var msg = string.Join(" ", passResult.Errors.Select(e => e.Description));
                    return (SuperAdminCliOutcome.ValidationFailed, msg);
                }
            }

            await users.SetLockoutEndDateAsync(user, null);
            await users.ResetAccessFailedCountAsync(user);
        }

        // Asegura membresía como dueño en todas las tiendas existentes.
        var tenantIds = await tenants.Tenants.AsNoTracking().Select(t => t.Id).ToListAsync();
        var existing = (await idDb.TenantMemberships.Where(m => m.UserId == user.Id)
            .Select(m => m.TenantId).ToListAsync()).ToHashSet();
        idDb.TenantMemberships.AddRange(tenantIds
            .Where(existing.Add)
            .Select(tid => TenantMembership.Create(user.Id, tid, Roles.Owner)));
        await idDb.SaveChangesAsync();

        return (created ? SuperAdminCliOutcome.Created : SuperAdminCliOutcome.Promoted, null);
    }
}

