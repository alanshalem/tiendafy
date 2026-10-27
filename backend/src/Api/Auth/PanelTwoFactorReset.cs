using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;

namespace Api.Auth;

/// <summary>Cómo terminó un <c>reset-2fa</c>.</summary>
public enum TwoFactorResetOutcome
{
    /// <summary>Tenía la verificación (o una a medio configurar) y se borró.</summary>
    Reset,
    /// <summary>La cuenta existe y no tenía nada que borrar.</summary>
    NotEnabled,
    /// <summary>No hay una cuenta del panel con ese email.</summary>
    NotFound,
}

/// <summary>
/// Mantenimiento: <c>dotnet Api.dll reset-2fa &lt;email&gt;</c> borra la
/// verificación en dos pasos de una persona del panel que perdió el teléfono y
/// los códigos de recuperación. La desactiva, borra la clave de la app y los
/// códigos, la desbloquea y cierra sus sesiones abiertas (cambia el sello de
/// seguridad). Si es dueña o administradora, al entrar la vuelve a configurar.
///
/// <para>
/// Lo corre quien opera la plataforma, en el servidor, después de confirmar
/// por otro medio que el pedido es de esa persona: es la única forma de entrar
/// sin el segundo paso.
/// </para>
/// </summary>
public static class PanelTwoFactorReset
{
    public const string Command = "reset-2fa";

    // Los mismos nombres que usa Identity (ver AppUserStore).
    private const string InternalLoginProvider = "[AspNetUserStore]";

    public static async Task<TwoFactorResetOutcome> RunAsync(IServiceProvider services, string email)
    {
        using var scope = services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var user = await users.FindByEmailAsync(email.Trim());
        if (user is null) return TwoFactorResetOutcome.NotFound;

        var had = user.TwoFactorEnabled || await users.GetAuthenticatorKeyAsync(user) is not null
            || await users.CountRecoveryCodesAsync(user) > 0;

        await users.SetTwoFactorEnabledAsync(user, false);
        await users.RemoveAuthenticationTokenAsync(user, InternalLoginProvider, "AuthenticatorKey");
        await users.RemoveAuthenticationTokenAsync(user, InternalLoginProvider, "RecoveryCodes");
        // Perdió el teléfono y probó códigos hasta bloquearse: que pueda entrar ya.
        await users.SetLockoutEndDateAsync(user, null);
        await users.ResetAccessFailedCountAsync(user);
        // Una sesión abierta en el teléfono perdido no sigue andando.
        await users.UpdateSecurityStampAsync(user);

        return had ? TwoFactorResetOutcome.Reset : TwoFactorResetOutcome.NotEnabled;
    }
}
