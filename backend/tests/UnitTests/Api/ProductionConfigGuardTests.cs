using Api.Startup;

namespace UnitTests.Api;

/// <summary>
/// La API sin ConnectionStrings__Default cae al appsettings.json, que trae la
/// contraseña del Postgres de desarrollo. En producción eso tiene que tumbar el
/// arranque, no hablar con una base de contraseña conocida.
/// </summary>
public sealed class ProductionConfigGuardTests
{
    [Theory]
    [InlineData("Host=127.0.0.1;Port=5432;Database=tiendafy;Username=tiendafy;Password=tiendafy")]
    [InlineData("Host=postgres;Database=tiendafy;Username=tiendafy;password=tiendafy")]
    [InlineData("Host=postgres;Username=tiendafy;Pwd=tiendafy;Database=tiendafy")]
    [InlineData("Host=postgres;Username=tiendafy;Password=\"tiendafy\";Database=tiendafy")]
    [InlineData("Host=postgres;Username=tiendafy; Password = tiendafy ;Database=tiendafy")]
    public void En_produccion_la_contrasena_de_desarrollo_tira_el_arranque(string connectionString)
    {
        var ex = Assert.Throws<InvalidOperationException>(() =>
            ProductionConfigGuard.RejectDevelopmentDatabasePassword(connectionString, isProduction: true));
        Assert.Contains("contraseña de desarrollo", ex.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("Host=postgres;Database=tiendafy;Username=tiendafy;Password=Xk29sd8fh3;Minimum Pool Size=5")]
    [InlineData("Host=postgres;Database=tiendafy;Username=tiendafy;Password=tiendafy-2026-larga")]
    [InlineData("Host=postgres;Database=tiendafy;Username=tiendafy;Password=Tiendafy")]
    [InlineData("Host=postgres;Database=tiendafy;Username=tiendafy")]
    [InlineData("")]
    [InlineData(null)]
    public void En_produccion_una_contrasena_real_pasa(string? connectionString) =>
        ProductionConfigGuard.RejectDevelopmentDatabasePassword(connectionString, isProduction: true);

    [Fact]
    public void Fuera_de_produccion_la_de_desarrollo_es_lo_normal() =>
        ProductionConfigGuard.RejectDevelopmentDatabasePassword(
            "Host=127.0.0.1;Database=tiendafy;Username=tiendafy;Password=tiendafy", isProduction: false);
}
