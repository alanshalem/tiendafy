using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using SharedKernel.Persistence;

namespace UnitTests.Architecture;

/// <summary>
/// El filtro multi-tenant, revisado por máquina.
///
/// Cada DbContext escribe su `HasQueryFilter` a mano, entidad por entidad, en
/// veinte y pico de módulos. Alcanza con que alguien agregue una entidad nueva
/// con TenantId y se olvide de la línea: la entidad queda sin filtrar y las
/// consultas de una tienda ven las filas de las otras. No falla nada, no avisa
/// nadie, y se descubre cuando un comercio ve datos ajenos.
///
/// Este test recorre el modelo de EF de TODOS los contextos y exige el filtro
/// en cada entidad que tenga TenantId. Las excepciones a propósito se declaran
/// abajo con su motivo: una entidad sin filtro tiene que ser una decisión
/// escrita, no un olvido.
///
/// No necesita base: construir el modelo de EF es offline.
/// </summary>
public sealed class TenantQueryFilterTests
{
    /// <summary>
    /// Entidades con TenantId que a propósito NO llevan filtro, y por qué.
    /// Cada una es una decisión, no una excepción de conveniencia.
    /// </summary>
    private static readonly Dictionary<string, string> SinFiltroAProposito = new()
    {
        ["Tenant"] =
            "Es la tienda misma, no una fila que pertenezca a una tienda. Filtrarla "
            + "por la tienda activa rompería el listado de tiendas del grupo y la "
            + "resolución por host, que corre justamente antes de saber cuál es.",

        ["TenantMembership"] =
            "Mapea usuario → tienda: es lo que decide a qué tiendas entrás. "
            + "Filtrarla por la tienda activa haría imposible listar las demás.",
    };

    private static IEnumerable<Type> ContextTypes()
    {
        // Los contextos viven en los .Infrastructure de cada módulo; se llega a
        // todos por el grafo de referencias de la Api, que es quien los compone.
        var api = typeof(global::Api.Workers.InboxDrain).Assembly;
        var assemblies = api.GetReferencedAssemblies()
            .Select(Assembly.Load)
            .Append(api)
            .ToList();

        return assemblies
            .SelectMany(a => a.GetTypes())
            .Where(t => t is { IsAbstract: false, IsGenericTypeDefinition: false } && t.IsSubclassOf(typeof(DbContext)))
            .Distinct()
            .OrderBy(t => t.Name);
    }

    /// <summary>
    /// Instancia el contexto con las opciones de design-time y sin tenant en
    /// scope (los contextos aceptan `ITenantContext? tenant = null`). Alcanza
    /// para construir el modelo: no se abre ninguna conexión.
    /// </summary>
    private static DbContext Instantiate(Type contextType)
    {
        var options = typeof(ModuleDb)
            .GetMethod(nameof(ModuleDb.DesignTimeOptions))!
            .MakeGenericMethod(contextType)
            .Invoke(null, null);

        var ctor = contextType.GetConstructors()
            .FirstOrDefault(c => c.GetParameters().FirstOrDefault()?.ParameterType.IsAssignableFrom(options!.GetType()) == true)
            ?? throw new InvalidOperationException($"{contextType.Name} no tiene un ctor que reciba sus DbContextOptions.");

        var args = ctor.GetParameters()
            .Select((p, i) => i == 0 ? options : p.HasDefaultValue ? p.DefaultValue : null)
            .ToArray();

        return (DbContext)ctor.Invoke(args);
    }

    /// <summary>Entidades raíz del modelo (las owned heredan el filtro de su dueño).</summary>
    private static IEnumerable<IEntityType> RootEntities(DbContext context) =>
        context.Model.GetEntityTypes().Where(e => !e.IsOwned() && e.BaseType is null);

    private static bool HasTenantId(IEntityType entity) =>
        entity.GetProperties().Any(p => p.Name is "TenantId");

    [Fact]
    public void Toda_entidad_con_TenantId_tiene_filtro_global()
    {
        var sinFiltro = new List<string>();

        foreach (var contextType in ContextTypes())
        {
            using var context = Instantiate(contextType);

            foreach (var entity in RootEntities(context))
            {
                if (!HasTenantId(entity)) continue;
                if (SinFiltroAProposito.ContainsKey(entity.ClrType.Name)) continue;
                if (entity.GetDeclaredQueryFilters().Count > 0) continue;

                sinFiltro.Add($"{contextType.Name}.{entity.ClrType.Name}");
            }
        }

        Assert.True(sinFiltro.Count == 0,
            "Estas entidades tienen TenantId y ningún filtro global: una consulta sin Where explícito "
            + "devuelve filas de otras tiendas.\n  "
            + string.Join("\n  ", sinFiltro)
            + "\n\nSi la falta de filtro es a propósito, declarala en SinFiltroAProposito con el motivo.");
    }

    [Fact]
    public void Las_excepciones_declaradas_siguen_existiendo()
    {
        // Una excepción que ya no corresponde es peor que ninguna: tapa el
        // próximo olvido con el mismo nombre.
        var vivas = ContextTypes()
            .SelectMany(t =>
            {
                using var context = Instantiate(t);
                return RootEntities(context).Select(e => e.ClrType.Name).ToList();
            })
            .ToHashSet();

        var muertas = SinFiltroAProposito.Keys.Where(k => !vivas.Contains(k)).ToList();

        Assert.True(muertas.Count == 0,
            "Estas excepciones ya no corresponden a ninguna entidad; sacalas:\n  " + string.Join("\n  ", muertas));
    }

    [Fact]
    public void El_test_esta_mirando_los_contextos_de_verdad()
    {
        // Si la reflexión deja de encontrar los contextos, los dos tests de
        // arriba pasan sin revisar nada.
        var contexts = ContextTypes().ToList();
        Assert.True(contexts.Count >= 15, $"Se esperaban los contextos de los módulos; se encontraron {contexts.Count}.");

        var conTenant = contexts.Sum(t =>
        {
            using var context = Instantiate(t);
            return RootEntities(context).Count(HasTenantId);
        });
        Assert.True(conTenant > 40, $"Se esperaban decenas de entidades con TenantId; se contaron {conTenant}.");
    }
}
