using System.Text.RegularExpressions;

namespace UnitTests.Architecture;

/// <summary>
/// Las fronteras entre módulos.
///
/// Hoy el monolito está realmente modularizado: las únicas dependencias
/// cruzadas son a un `.Contracts`, y ningún módulo conoce a la Api. Eso no lo
/// sostiene nada más que la costumbre — un `ProjectReference` de más compila,
/// pasa los tests, y recién se nota cuando alguien quiere mover un módulo y
/// descubre que se trajo medio sistema colgando.
///
/// Estas reglas son la red. No pretenden mejorar nada: congelan lo que ya está
/// bien, para que siga estándolo sin depender de que alguien lo revise.
/// </summary>
public sealed class ModuleBoundariesTests
{
    /// <summary>`&lt;ProjectReference Include="..." /&gt;` de un .csproj, normalizado a nombre de proyecto.</summary>
    private static IEnumerable<string> ReferencesOf(string csproj) =>
        Regex.Matches(File.ReadAllText(csproj), @"ProjectReference\s+Include=""([^""]+)""")
            .Select(m => Path.GetFileNameWithoutExtension(m.Groups[1].Value.Replace('\\', '/')));

    private static IEnumerable<(string Module, string Project, string Path)> AllProjects()
    {
        foreach (var csproj in Directory.EnumerateFiles(RepoRoot.Modules, "*.csproj", SearchOption.AllDirectories))
        {
            var module = Path.GetRelativePath(RepoRoot.Modules, csproj).Split(Path.DirectorySeparatorChar)[0];
            yield return (module, Path.GetFileNameWithoutExtension(csproj), csproj);
        }
    }

    private static HashSet<string> ModuleNames() =>
        Directory.EnumerateDirectories(RepoRoot.Modules).Select(d => new DirectoryInfo(d).Name).ToHashSet();

    [Fact]
    public void Un_modulo_solo_puede_depender_del_Contracts_de_otro()
    {
        var modules = ModuleNames();
        var violations = new List<string>();

        foreach (var (module, project, path) in AllProjects())
        {
            foreach (var reference in ReferencesOf(path))
            {
                // "Catalog.Contracts" → módulo "Catalog".
                var owner = reference.Split('.')[0];
                if (!modules.Contains(owner) || owner == module) continue;

                if (!reference.EndsWith(".Contracts", StringComparison.Ordinal))
                    violations.Add($"{project} → {reference}");
            }
        }

        Assert.True(violations.Count == 0,
            "Un módulo solo puede ver el .Contracts de otro; lo demás es acoplarse a su implementación:\n  "
            + string.Join("\n  ", violations));
    }

    [Fact]
    public void Ningun_modulo_conoce_a_la_Api()
    {
        // La Api es la composición: arma los módulos y los expone. Si un módulo
        // la referencia, la dependencia apunta al revés y el módulo deja de
        // poder existir sin ella.
        var violations = AllProjects()
            .SelectMany(p => ReferencesOf(p.Path).Select(r => (p.Project, Reference: r)))
            .Where(x => x.Reference is "Api")
            .Select(x => $"{x.Project} → {x.Reference}")
            .ToList();

        Assert.True(violations.Count == 0,
            "La dependencia va de la Api al módulo, nunca al revés:\n  " + string.Join("\n  ", violations));
    }

    [Fact]
    public void Un_Contracts_no_arrastra_persistencia()
    {
        // El .Contracts es lo que un módulo le muestra a otro: tipos y puertos.
        // Si se trae el .Infrastructure, quien lo consuma se lleva EF, Npgsql y
        // las entidades de la base de un módulo que no es el suyo.
        var violations = new List<string>();

        foreach (var (_, project, path) in AllProjects())
        {
            if (!project.EndsWith(".Contracts", StringComparison.Ordinal)) continue;

            violations.AddRange(ReferencesOf(path)
                .Where(r => r.EndsWith(".Infrastructure", StringComparison.Ordinal))
                .Select(r => $"{project} → {r}"));
        }

        Assert.True(violations.Count == 0,
            "Un .Contracts no puede depender de un .Infrastructure:\n  " + string.Join("\n  ", violations));
    }

    [Fact]
    public void La_regla_se_esta_midiendo_de_verdad()
    {
        // Un test de arquitectura que no encuentra proyectos pasa siempre y no
        // cuida nada. Esto falla si el layout del repo cambia y los de arriba
        // quedaron mirando una carpeta vacía.
        var projects = AllProjects().ToList();
        Assert.True(projects.Count > 30, $"Se esperaban los proyectos de los módulos; se encontraron {projects.Count}.");
        Assert.Contains(projects, p => p.Project.EndsWith(".Contracts", StringComparison.Ordinal));
    }
}
