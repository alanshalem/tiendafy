namespace Api.Import;

/// <summary>
/// Cola + registro de estado de los jobs de importación de imágenes.
///
/// Cada job deja en el disco las fotos subidas hasta que el worker (uno solo,
/// en serie) lo procesa. Sin tope de jobs pendientes, un par de pedidos seguidos
/// llenaban el disco con hasta 2 GB descomprimidos cada uno: por eso hay un
/// máximo por tienda y otro global.
/// </summary>
public sealed class ImageImportQueue : JobQueue<ImageImportJob>
{
    /// <summary>Jobs de imágenes sin terminar que puede tener una tienda.</summary>
    public const int MaxPendingPerTenant = 2;

    /// <summary>Jobs de imágenes sin terminar entre todas las tiendas.</summary>
    public const int MaxPendingGlobal = 8;

    private readonly object _admission = new();

    /// <summary>¿Hay lugar para un job más de esta tienda? (Chequeo barato, antes de leer la subida.)</summary>
    public bool HasRoom(Guid tenantId)
    {
        lock (_admission)
            return PendingCount(null) < MaxPendingGlobal && PendingCount(tenantId) < MaxPendingPerTenant;
    }

    /// <summary>
    /// Registra el job si hay lugar; null si la tienda o el servidor ya tienen
    /// demasiados pendientes. El chequeo y el alta van juntos: dos pedidos
    /// simultáneos no pueden colarse los dos.
    /// </summary>
    public ImageImportJob? TryCreate(Guid tenantId, string tempDir, int totalFiles)
    {
        lock (_admission)
        {
            if (PendingCount(null) >= MaxPendingGlobal || PendingCount(tenantId) >= MaxPendingPerTenant)
                return null;

            return Register(new ImageImportJob
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                TempDir = tempDir,
                TotalFiles = totalFiles,
            });
        }
    }
}
