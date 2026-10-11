using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;

namespace Api.Auth;

/// <summary>
/// Un payload JSON firmado y cifrado bajo un purpose: lo que viaja por una URL
/// o pasa por el navegador sin que nadie pueda leerlo ni cambiarlo. Es el motor
/// de los links de baja y de tracking de las campañas y de las cotizaciones de
/// envío.
///
/// <para>
/// Antes estaba escrito tres veces —una con vencimiento, dos sin—, cada una con
/// su serialización, su try/catch y su validación. Lo que cambia entre ellas
/// es el purpose, si vence, y qué hace válido a un payload; eso es lo que se
/// configura acá.
/// </para>
///
/// <para>
/// <b>Compatibilidad.</b> El purpose y la presencia o no de vencimiento
/// definen el formato del token: cambiar cualquiera de los dos invalida todo
/// lo ya emitido —un link de baja mandado hace meses tiene que seguir
/// andando—. Por eso cada caller declara los suyos y nunca se derivan.
/// </para>
/// </summary>
/// <param name="purpose">Purpose de DataProtection. Nunca se cambia una vez en uso.</param>
/// <param name="lifetime">Vigencia del token; null = no vence.</param>
public sealed class SignedToken<T>(string purpose, TimeSpan? lifetime = null) where T : class
{
    public string Protect(IDataProtectionProvider dp, T payload)
    {
        var json = JsonSerializer.Serialize(payload);
        var protector = dp.CreateProtector(purpose);

        return lifetime is { } ttl
            ? protector.ToTimeLimitedDataProtector().Protect(json, ttl)
            : protector.Protect(json);
    }

    /// <summary>
    /// El payload, o null si el token está adulterado, vencido, no se puede
    /// leer o no pasa <paramref name="isValid"/>. Nunca tira: un token malo es
    /// un dato de entrada, no un error del servidor.
    /// </summary>
    public T? Unprotect(IDataProtectionProvider dp, string token, Func<T, bool>? isValid = null)
    {
        try
        {
            var protector = dp.CreateProtector(purpose);
            var json = lifetime is null
                ? protector.Unprotect(token)
                : protector.ToTimeLimitedDataProtector().Unprotect(token);

            var payload = JsonSerializer.Deserialize<T>(json);
            return payload is not null && (isValid?.Invoke(payload) ?? true) ? payload : null;
        }
        catch (Exception)
        {
            return null;
        }
    }
}
