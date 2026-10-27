using Identity.Infrastructure;

namespace Api.Auth;

/// <summary>
/// La verificación en dos pasos obligatoria: quien es dueño o administrador
/// de alguna tienda (<see cref="Roles.RequireTwoFactor"/>) no usa el panel
/// sin tenerla activa. Con la contraseña de uno de ellos se maneja la tienda
/// entera (cobros, precios, el equipo): la contraseña sola no alcanza.
///
/// <para>
/// <c>Auth:RequireTwoFactorForAdmins</c>, prendida si no se configura
/// (producción y staging). Apagada en <c>appsettings.Development.json</c>: el
/// seed de dev, el e2e y los tests de integración entran con contraseña.
/// </para>
///
/// <para>
/// Lo hacen cumplir el login (deja configurarla antes de abrir la sesión),
/// <see cref="Middleware.TwoFactorSetupMiddleware"/> (las sesiones abiertas de
/// antes) y el endpoint de desactivarla.
/// </para>
/// </summary>
public sealed class TwoFactorRequirement(IConfiguration cfg, IMembershipService memberships)
{
    public const string ConfigKey = "Auth:RequireTwoFactorForAdmins";

    public bool Enabled => cfg.GetValue(ConfigKey, true);

    /// <summary>Si a esta persona se le exige (tenga o no la verificación activa).</summary>
    public async Task<bool> AppliesToAsync(Guid userId, CancellationToken ct = default) =>
        Enabled && await memberships.HasAnyRoleAsync(userId, Roles.RequireTwoFactor, ct);

    /// <summary>Si se le exige y todavía no la activó.</summary>
    public async Task<bool> MissingAsync(AppUser user, CancellationToken ct = default) =>
        !user.TwoFactorEnabled && await AppliesToAsync(user.Id, ct);

    /// <summary>El 403 de "configurá la verificación en dos pasos" (lo reconoce el panel por el título).</summary>
    public static IResult SetupRequired() =>
        Results.Problem(title: "Auth.TwoFactorSetupRequired",
            detail: "Para dueños y administradores la verificación en dos pasos es obligatoria. Activala para seguir.",
            statusCode: StatusCodes.Status403Forbidden);
}
