using System.Collections.Concurrent;

namespace Api.Ai;

/// <summary>
/// Una ejecución pesada de IA a la vez por (alcance, clave): el asistente por usuario, el trabajo
/// de catálogo por tienda. En memoria (la API corre en una sola instancia). Singleton.
/// </summary>
public sealed class AiConcurrency
{
    private readonly ConcurrentDictionary<(string Scope, string Key), Entry> _active = new();

    /// <summary>Entra o devuelve null si ya hay una ejecución con ese alcance y clave. Liberar con Dispose.</summary>
    public IDisposable? TryEnter(string scope, string key)
    {
        var entry = new Entry(this, (scope, key));
        return _active.TryAdd((scope, key), entry) ? entry : null;
    }

    private sealed class Entry(AiConcurrency owner, (string Scope, string Key) id) : IDisposable
    {
        // Solo saca del mapa a esta entrada: un Dispose repetido no libera a una posterior.
        public void Dispose() =>
            ((ICollection<KeyValuePair<(string Scope, string Key), Entry>>)owner._active)
                .Remove(new KeyValuePair<(string Scope, string Key), Entry>(id, this));
    }
}
