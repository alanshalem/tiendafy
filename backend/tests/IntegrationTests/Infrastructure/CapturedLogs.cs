using Microsoft.Extensions.Logging;

namespace IntegrationTests;

/// <summary>Todo lo que loguea la API durante los tests, para afirmar qué NO se loguea (claves, cuerpos de error).</summary>
public sealed class CapturedLogs : ILoggerProvider
{
    private readonly object _gate = new();
    private readonly List<string> _lines = [];

    /// <summary>Cada línea con su excepción completa (tipo, mensaje, interna y traza).</summary>
    public IReadOnlyList<string> Lines
    {
        get { lock (_gate) return [.. _lines]; }
    }

    public ILogger CreateLogger(string categoryName) => new Logger(this, categoryName);

    public void Dispose() { }

    /// <summary>
    /// Serilog (<c>UseSerilog</c>) reemplaza el <see cref="ILoggerFactory"/> y no mira los
    /// <see cref="ILoggerProvider"/> registrados: se envuelve la fábrica real para que cada
    /// logger escriba en los dos lados.
    /// </summary>
    public ILoggerFactory Tee(ILoggerFactory inner) => new TeeFactory(inner, this);

    private sealed class TeeFactory(ILoggerFactory inner, CapturedLogs logs) : ILoggerFactory
    {
        public ILogger CreateLogger(string categoryName) => new TeeLogger(inner.CreateLogger(categoryName), logs.CreateLogger(categoryName));

        public void AddProvider(ILoggerProvider provider) => inner.AddProvider(provider);

        public void Dispose() => inner.Dispose();
    }

    private sealed class TeeLogger(ILogger first, ILogger second) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => first.BeginScope(state);

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (first.IsEnabled(logLevel)) first.Log(logLevel, eventId, state, exception, formatter);
            second.Log(logLevel, eventId, state, exception, formatter);
        }
    }

    private sealed class Logger(CapturedLogs owner, string category) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            var line = $"{category}: {formatter(state, exception)} {exception}";
            lock (owner._gate) owner._lines.Add(line);
        }
    }
}
