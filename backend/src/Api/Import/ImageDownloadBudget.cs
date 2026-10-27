namespace Api.Import;

/// <summary>
/// Cuánto puede tardar y bajar un job de importación de productos por las URLs
/// de imágenes de la planilla. El worker es uno solo para todas las tiendas y
/// procesa en serie: sin tope, una planilla con miles de URLs lentas lo dejaba
/// ocupado horas y las importaciones de las demás tiendas esperaban.
///
/// Lo que no entra en el presupuesto no se descarga: la imagen queda con la URL
/// original, igual que cuando una descarga falla.
/// </summary>
public sealed class ImageDownloadBudget
{
    /// <summary>Descargas por job.</summary>
    public const int DefaultMaxDownloads = 2_000;

    /// <summary>Tiempo total del job dedicado a descargar.</summary>
    public static readonly TimeSpan DefaultJobTime = TimeSpan.FromMinutes(20);

    /// <summary>Tiempo por fila (producto) dedicado a descargar.</summary>
    public static readonly TimeSpan DefaultRowTime = TimeSpan.FromSeconds(90);

    private readonly int _maxDownloads;
    private readonly TimeSpan _jobTime;
    private readonly TimeSpan _rowTime;
    private readonly TimeProvider _clock;
    private readonly long _jobStart;
    private long _rowStart;
    private int _downloads;

    public ImageDownloadBudget(
        int maxDownloads = DefaultMaxDownloads,
        TimeSpan? jobTime = null,
        TimeSpan? rowTime = null,
        TimeProvider? clock = null)
    {
        _maxDownloads = maxDownloads;
        _jobTime = jobTime ?? DefaultJobTime;
        _rowTime = rowTime ?? DefaultRowTime;
        _clock = clock ?? TimeProvider.System;
        _jobStart = _clock.GetTimestamp();
        _rowStart = _jobStart;
    }

    public int Downloads => _downloads;

    /// <summary>Arranca el reloj de la fila de la planilla que se va a procesar.</summary>
    public void BeginRow() => _rowStart = _clock.GetTimestamp();

    /// <summary>¿Se puede intentar otra descarga? Si sí, la cuenta.</summary>
    public bool TryTake()
    {
        var now = _clock.GetTimestamp();
        if (_downloads >= _maxDownloads) return false;
        if (_clock.GetElapsedTime(_jobStart, now) >= _jobTime) return false;
        if (_clock.GetElapsedTime(_rowStart, now) >= _rowTime) return false;
        _downloads++;
        return true;
    }
}
