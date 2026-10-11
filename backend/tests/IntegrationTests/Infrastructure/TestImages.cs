namespace IntegrationTests;

/// <summary>
/// Imágenes chiquitas pero válidas: el storage valida los magic bytes, así
/// que un archivo con extensión .png y otra cosa adentro se rechaza.
/// </summary>
public static class TestImages
{
    /// <summary>PNG de 1×1.</summary>
    public static readonly byte[] Png = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

    /// <summary>Cabecera JPEG (SOI + APP0 JFIF) y relleno: alcanza para el chequeo de tipo.</summary>
    public static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0xFF, 0xD9];

    public static HttpResponseMessage PngResponse() => new(System.Net.HttpStatusCode.OK)
    {
        Content = new ByteArrayContent(Png) { Headers = { ContentType = new("image/png") } },
    };
}
