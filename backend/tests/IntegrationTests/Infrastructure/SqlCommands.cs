using System.Diagnostics;

namespace IntegrationTests;

/// <summary>
/// Cuenta los comandos SQL que ejecuta EF Core, escuchando su DiagnosticListener
/// (sin tocar cómo registra cada módulo su DbContext). Sirve para medir cuántas
/// consultas hace un endpoint: un N+1 se ve como una cuenta que crece con los
/// datos. Los tests de la colección "api" corren de a uno y sin workers, así
/// que lo que se cuenta entre dos lecturas es lo que hizo ese pedido.
/// </summary>
public static class SqlCommands
{
    private const string EfListener = "Microsoft.EntityFrameworkCore";
    private const string CommandExecuted = "Microsoft.EntityFrameworkCore.Database.Command.CommandExecuted";

    private static int _executed;
    private static readonly IDisposable Subscription = DiagnosticListener.AllListeners.Subscribe(new Listeners());

    /// <summary>Cuántos comandos ejecutó <paramref name="action"/>.</summary>
    public static async Task<int> CountAsync(Func<Task> action)
    {
        GC.KeepAlive(Subscription);
        var before = Volatile.Read(ref _executed);
        await action();
        return Volatile.Read(ref _executed) - before;
    }

    private sealed class Listeners : IObserver<DiagnosticListener>
    {
        public void OnNext(DiagnosticListener value)
        {
            if (value.Name == EfListener) value.Subscribe(new Events());
        }

        public void OnCompleted() { }

        public void OnError(Exception error) { }
    }

    private sealed class Events : IObserver<KeyValuePair<string, object?>>
    {
        public void OnNext(KeyValuePair<string, object?> value)
        {
            if (value.Key == CommandExecuted) Interlocked.Increment(ref _executed);
        }

        public void OnCompleted() { }

        public void OnError(Exception error) { }
    }
}
