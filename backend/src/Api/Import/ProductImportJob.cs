namespace Api.Import;

public enum ImportStatus
{
    Queued = 0,
    Processing = 1,
    Completed = 2,
    Failed = 3,
}

/// <summary>Opciones que el merchant marca en el form de importación.</summary>
public sealed record ImportOptions(bool UpdateExisting, bool UpdateStock);

/// <summary>Error de una fila puntual — no aborta la corrida completa.</summary>
public sealed record ImportRowError(int Line, string Slug, string Message);

/// <summary>
/// Estado de un job de importación. Vive en memoria del proceso de la API
/// (un solo nodo en dev). No persiste entre reinicios — aceptable para el
/// flujo de carga masiva, que es interactivo y de corta duración.
/// </summary>
public sealed class ImportJob : IImportJob
{
    public required Guid Id { get; init; }
    public required Guid TenantId { get; init; }
    public required string Csv { get; init; }
    public required string FileName { get; init; }
    public required ImportOptions Options { get; init; }

    public ImportStatus Status { get; set; } = ImportStatus.Queued;
    public int TotalProducts { get; set; }
    public int Processed { get; set; }
    public int Created { get; set; }
    public int Updated { get; set; }
    public int Skipped { get; set; }
    public int ImagesImported { get; set; }
    public string? FailureMessage { get; set; }
    public DateTime CreatedAtUtc { get; init; } = DateTime.UtcNow;
    public DateTime? FinishedAtUtc { get; set; }

    private readonly List<ImportRowError> _errors = [];
    public IReadOnlyList<ImportRowError> Errors
    {
        get { lock (_errors) return _errors.ToList(); }
    }

    public void AddError(int line, string slug, string message)
    {
        lock (_errors)
        {
            // Tope defensivo: no acumular megabytes de errores en una corrida rota.
            if (_errors.Count < 500)
                _errors.Add(new ImportRowError(line, slug, message));
        }
    }

    public int ErrorCount
    {
        get { lock (_errors) return _errors.Count; }
    }
}
