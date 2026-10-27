using Microsoft.Extensions.Options;

namespace Api.Platform;

/// <summary>
/// Fuente de configuración en memoria alimentada desde la tabla
/// <c>platform_settings</c>. Se agrega al final de <c>Configuration.Sources</c>
/// para que lo guardado desde la pantalla de Configuración de la plataforma
/// pise en el acto a lo que vino de <c>.env.prod</c> o <c>appsettings.json</c>,
/// sin reiniciar el contenedor. Si una clave no está en la base (o se restaura),
/// cae automáticamente al valor de <c>.env.prod</c>.
/// </summary>
public sealed class PlatformConfigurationProvider : ConfigurationProvider
{
    private readonly Lock _sync = new();

    public void SetOverrides(IReadOnlyDictionary<string, string?> values)
    {
        lock (_sync)
        {
            var next = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
            foreach (var (k, v) in values)
            {
                if (v is not null)
                    next[k] = v;
            }
            Data = next;
        }
        OnReload();
    }

    public bool TryGetOverride(string key, out string? value)
    {
        lock (_sync)
        {
            return Data.TryGetValue(key, out value);
        }
    }
}

public sealed class PlatformConfigurationSource(PlatformConfigurationProvider provider) : IConfigurationSource
{
    public IConfigurationProvider Build(IConfigurationBuilder builder) => provider;
}

/// <summary>
/// Adaptador <see cref="IOptions{TOptions}"/> que lee siempre el valor actual de
/// <see cref="IOptionsMonitor{TOptions}"/>, para que los servicios que reciben
/// <c>IOptions&lt;T&gt;</c> vean en el acto los cambios guardados desde la
/// pantalla de Configuración de la plataforma.
/// </summary>
public sealed class LiveOptions<TOptions>(IOptionsMonitor<TOptions> monitor) : IOptions<TOptions>
    where TOptions : class
{
    public TOptions Value => monitor.CurrentValue;
}

