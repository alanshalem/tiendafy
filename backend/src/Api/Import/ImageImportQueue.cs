namespace Api.Import;

/// <summary>Cola + registro de estado de los jobs de importación de imágenes.</summary>
public sealed class ImageImportQueue : JobQueue<ImageImportJob>
{
    public ImageImportJob Create(Guid tenantId, string tempDir, int totalFiles) =>
        Register(new ImageImportJob
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            TempDir = tempDir,
            TotalFiles = totalFiles,
        });
}
