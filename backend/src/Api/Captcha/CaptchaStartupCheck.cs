namespace Api.Captcha;

/// <summary>
/// Fuera de Development, arrancar sin <c>Captcha:Turnstile:Secret</c> deja
/// los formularios públicos sin anti-bots: <see cref="TurnstileVerifier"/>
/// deja pasar todo. No se tira la app abajo (cortaría las ventas por una
/// clave de captcha), pero se loguea como Critical al arrancar para que
/// salte en Sentry y en el log del deploy. En Development es lo normal.
/// </summary>
public sealed class CaptchaStartupCheck(
    ICaptchaVerifier captcha, IHostEnvironment environment, ILogger<CaptchaStartupCheck> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (!environment.IsDevelopment() && !captcha.Enabled)
            logger.LogCritical(
                "Falta Captcha:Turnstile:Secret (TURNSTILE_SECRET) en {Environment}: login, registro, contacto, " +
                "newsletter, reseñas y \"avisame\" quedan SIN captcha y aceptan cualquier pedido.",
                environment.EnvironmentName);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
