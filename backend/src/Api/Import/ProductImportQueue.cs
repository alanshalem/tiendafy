namespace Api.Import;

/// <summary>
/// Cola de jobs de importación de productos (CSV). El endpoint crea+encola; el
/// <see cref="ProductImportWorker"/> consume.
/// </summary>
public sealed class ProductImportQueue : JobQueue<ImportJob>
{
    public ImportJob Create(Guid tenantId, string csv, string fileName, ImportOptions options, int totalProducts) =>
        Register(new ImportJob
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Csv = csv,
            FileName = fileName,
            Options = options,
            TotalProducts = totalProducts,
        });
}
