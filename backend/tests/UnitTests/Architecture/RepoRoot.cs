namespace UnitTests.Architecture;

/// <summary>
/// La raíz del repo, buscada desde donde corre el test. Los tests de
/// arquitectura leen los .csproj del árbol, no el assembly compilado: la regla
/// que cuidan ("quién puede referenciar a quién") vive en esos archivos.
/// </summary>
internal static class RepoRoot
{
    public static readonly DirectoryInfo Path = Find();

    private static DirectoryInfo Find()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (Directory.Exists(System.IO.Path.Combine(dir.FullName, "backend", "src", "Modules")))
                return dir;
            dir = dir.Parent;
        }

        throw new InvalidOperationException(
            $"No se encontró la raíz del repo desde '{AppContext.BaseDirectory}'.");
    }

    public static string Modules => System.IO.Path.Combine(Path.FullName, "backend", "src", "Modules");
}
