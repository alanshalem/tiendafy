using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Common;

namespace SharedKernel.Persistence;

/// <summary>
/// Boilerplate de persistencia compartido por los 16 módulos: registro del
/// DbContext (Npgsql + snake_case), opciones design-time para `dotnet ef`, y
/// la conversión estándar de <see cref="Money"/> a texto "minor|currency".
/// </summary>
public static class ModuleDb
{
    /// <summary>Registro estándar del DbContext de un módulo (connection string "Default").</summary>
    public static IServiceCollection AddModuleDbContext<TContext>(
        this IServiceCollection services, IConfiguration configuration)
        where TContext : DbContext
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Missing connection string 'Default'.");

        services.AddDbContext<TContext>(options =>
            options.UseNpgsql(connectionString).UseSnakeCaseNamingConvention());

        return services;
    }

    /// <summary>Opciones para las factories design-time de `dotnet ef` (env TIENDAFY_DB o localhost).</summary>
    public static DbContextOptions<TContext> DesignTimeOptions<TContext>()
        where TContext : DbContext
    {
        var connectionString = Environment.GetEnvironmentVariable("TIENDAFY_DB")
            ?? "Host=localhost;Port=5432;Database=tiendafy;Username=tiendafy;Password=tiendafy";

        return new DbContextOptionsBuilder<TContext>()
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .Options;
    }

    /// <summary>Conversión estándar de Money: "minorUnits|CUR" (mismo formato que ya está en la DB).</summary>
    public static readonly ValueConverter<Money, string> MoneyConverter = new(
        m => m.AmountInMinorUnits + "|" + m.Currency,
        s => ParseMoney(s));

    /// <summary>Variante nullable (columna NULL = sin valor), mismo formato.</summary>
    public static readonly ValueConverter<Money?, string?> NullableMoneyConverter = new(
        m => m == null ? null : m.Value.AmountInMinorUnits + "|" + m.Value.Currency,
        s => string.IsNullOrEmpty(s) ? null : ParseMoney(s));

    private static Money ParseMoney(string serialized)
    {
        var parts = serialized.Split('|');
        return new Money(long.Parse(parts[0]), parts[1]);
    }
}
