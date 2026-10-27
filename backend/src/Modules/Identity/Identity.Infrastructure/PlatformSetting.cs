namespace Identity.Infrastructure;

/// <summary>
/// Un ajuste o credencial global de la plataforma guardado desde la pantalla
/// del superadministrador (<c>/plataforma</c>). Pisa en caliente a lo que diga
/// el archivo de entorno (<c>.env.prod</c>); si se borra la fila, vuelve a
/// regir el valor del entorno.
///
/// <para>
/// Las claves secretas (tokens, client secrets, API keys) se guardan cifradas
/// con DataProtection (purpose <c>Tiendafy.Platform.Secrets.v1</c>).
/// </para>
/// </summary>
public sealed class PlatformSetting
{
    public string Key { get; private set; } = string.Empty;
    public string Value { get; private set; } = string.Empty;
    public DateTime UpdatedAtUtc { get; private set; } = DateTime.UtcNow;
    public string? UpdatedByEmail { get; private set; }

    private PlatformSetting() { }

    public static PlatformSetting Create(string key, string value, string? updatedByEmail) => new()
    {
        Key = key,
        Value = value,
        UpdatedAtUtc = DateTime.UtcNow,
        UpdatedByEmail = updatedByEmail,
    };

    public void Update(string value, string? updatedByEmail)
    {
        Value = value;
        UpdatedAtUtc = DateTime.UtcNow;
        UpdatedByEmail = updatedByEmail;
    }
}

