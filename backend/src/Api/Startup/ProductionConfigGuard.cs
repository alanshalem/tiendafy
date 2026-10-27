using System.Data.Common;

namespace Api.Startup;

/// <summary>
/// Chequeos de arranque que en producción tumban la app en vez de avisar: una
/// configuración de desarrollo que llega al servidor es peor que una app caída.
/// </summary>
public static class ProductionConfigGuard
{
    /// <summary>La contraseña con que viene el Postgres de desarrollo (appsettings.json, docker-compose.dev.yml).</summary>
    public const string DevelopmentDatabasePassword = "tiendafy";

    /// <summary>
    /// En producción, la cadena de conexión no puede traer la contraseña de
    /// desarrollo. El compose siempre pisa <c>ConnectionStrings__Default</c>, pero
    /// si alguien levanta la API sin ese entorno, caería al valor de
    /// <c>appsettings.json</c> y hablaría con una base de contraseña conocida.
    /// </summary>
    public static void RejectDevelopmentDatabasePassword(string? connectionString, bool isProduction)
    {
        if (!isProduction || string.IsNullOrWhiteSpace(connectionString)) return;

        string? password = null;
        try
        {
            var builder = new DbConnectionStringBuilder { ConnectionString = connectionString };
            foreach (var key in new[] { "Password", "Pwd" })
                if (builder.TryGetValue(key, out var value))
                    password = value?.ToString();
        }
        catch (ArgumentException)
        {
            // Una cadena que no se puede leer la rechaza Npgsql al conectar.
            return;
        }

        if (string.Equals(password, DevelopmentDatabasePassword, StringComparison.Ordinal))
            throw new InvalidOperationException(
                "La cadena de conexión (ConnectionStrings:Default) usa la contraseña de desarrollo de la base " +
                "en Production. Definí ConnectionStrings__Default con la contraseña real (el compose la arma " +
                "con POSTGRES_PASSWORD).");
    }
}
