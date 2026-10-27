using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Identity.Infrastructure;

/// <summary>
/// El UserManager del panel. Lo único que agrega: si una búsqueda por email o
/// usuario no encuentra a nadie con la clave nueva (NFKC, ver
/// <see cref="PanelLookupNormalizer"/>), prueba con la de antes (solo
/// mayúsculas) y, si la cuenta aparece, le guarda la clave nueva. Así quien se
/// dio de alta con un email no ASCII antes del cambio sigue entrando, y
/// después de la primera vez ya se lo encuentra directo.
///
/// <para>
/// Para ASCII las dos claves son iguales y no hay segunda consulta: el tiempo
/// de respuesta no cambia según exista o no la cuenta.
/// </para>
/// </summary>
public sealed class AppUserManager(
    IUserStore<AppUser> store,
    IOptions<IdentityOptions> optionsAccessor,
    IPasswordHasher<AppUser> passwordHasher,
    IEnumerable<IUserValidator<AppUser>> userValidators,
    IEnumerable<IPasswordValidator<AppUser>> passwordValidators,
    ILookupNormalizer keyNormalizer,
    IdentityErrorDescriber errors,
    IServiceProvider services,
    ILogger<UserManager<AppUser>> logger)
    : UserManager<AppUser>(store, optionsAccessor, passwordHasher, userValidators, passwordValidators,
        keyNormalizer, errors, services, logger)
{
    public override async Task<AppUser?> FindByEmailAsync(string email)
    {
        var user = await base.FindByEmailAsync(email);
        if (user is not null || Store is not IUserEmailStore<AppUser> emails) return user;

        var legacy = PanelLookupNormalizer.LegacyNormalize(email);
        if (legacy is null || legacy == NormalizeEmail(email)) return null;
        user = await emails.FindByEmailAsync(legacy, CancellationToken);
        return user is null ? null : await RenormalizeAsync(user);
    }

    public override async Task<AppUser?> FindByNameAsync(string userName)
    {
        var user = await base.FindByNameAsync(userName);
        if (user is not null) return user;

        var legacy = PanelLookupNormalizer.LegacyNormalize(userName);
        if (legacy is null || legacy == NormalizeName(userName)) return null;
        user = await Store.FindByNameAsync(legacy, CancellationToken);
        return user is null ? null : await RenormalizeAsync(user);
    }

    /// <summary>
    /// Guarda las claves nuevas directo en el store: <c>UpdateAsync</c>
    /// validaría el email único buscándolo con este mismo método.
    /// </summary>
    private async Task<AppUser> RenormalizeAsync(AppUser user)
    {
        user.NormalizedEmail = NormalizeEmail(user.Email);
        user.NormalizedUserName = NormalizeName(user.UserName);
        await Store.UpdateAsync(user, CancellationToken);
        return user;
    }
}
