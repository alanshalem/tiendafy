namespace Api.Import;

/// <summary>
/// Estado de un job de importación masiva de imágenes. En memoria del proceso,
/// igual que el import de productos. Las imágenes subidas se guardan en un dir
/// temporal que el worker procesa y limpia al terminar.
/// </summary>
public sealed class ImageImportJob : IImportJob
{
    public required Guid Id { get; init; }
    public required Guid TenantId { get; init; }
    public required string TempDir { get; init; }

    public ImportStatus Status { get; set; } = ImportStatus.Queued;
    public int TotalFiles { get; set; }
    public int Processed { get; set; }
    public int MatchedProducts { get; set; }
    public int ImagesAdded { get; set; }
    public int UnmatchedFiles { get; set; }
    public string? FailureMessage { get; set; }
    public DateTime CreatedAtUtc { get; init; } = DateTime.UtcNow;
    public DateTime? FinishedAtUtc { get; set; }

    private readonly List<string> _unmatched = [];
    public IReadOnlyList<string> UnmatchedSample
    {
        get { lock (_unmatched) return _unmatched.ToList(); }
    }

    public void AddUnmatched(string fileName)
    {
        UnmatchedFiles++;
        lock (_unmatched)
        {
            if (_unmatched.Count < 50) _unmatched.Add(fileName);
        }
    }
}
