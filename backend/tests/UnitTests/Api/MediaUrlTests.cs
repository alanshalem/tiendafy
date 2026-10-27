using Media.Infrastructure;

namespace UnitTests.Api;

/// <summary>
/// Forma de las URLs públicas de media según el proveedor.
///
/// Importa porque son dos formas distintas y la misma cuenta se usa para
/// ARMAR la URL que queda guardada en el producto y para DEDUCIR la clave
/// cuando hay que borrar el objeto. Si se desincronizan, o las imágenes dan
/// 404 o el borrado no encuentra qué borrar y el bucket crece para siempre.
/// </summary>
public sealed class MediaUrlTests
{
    private static MediaOptions Minio() => new()
    {
        Endpoint = "http://localhost:9000",
        PublicBaseUrl = "http://localhost:9000",
        AccessKey = "x",
        SecretKey = "y",
    };

    private static MediaOptions R2() => new()
    {
        Endpoint = "https://abc123.r2.cloudflarestorage.com",
        PublicBaseUrl = "https://img.tiendafy.com.ar",
        AccessKey = "x",
        SecretKey = "y",
        Region = "auto",
        BucketInPublicUrl = false,
    };

    [Fact]
    public void Minio_sirve_en_base_bucket_key()
    {
        var url = Minio().PublicUrl("tenant/abc.jpg");
        Assert.Equal("http://localhost:9000/tiendafy-media/tenant/abc.jpg", url);
    }

    [Fact]
    public void R2_con_dominio_propio_sirve_el_objeto_en_la_raiz()
    {
        var url = R2().PublicUrl("tenant/abc.jpg");
        Assert.Equal("https://img.tiendafy.com.ar/tenant/abc.jpg", url);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void La_clave_vuelve_de_la_url_que_generamos(bool bucketInUrl)
    {
        var options = bucketInUrl ? Minio() : R2();
        const string key = "7f1c/abcdef.webp";
        Assert.Equal(key, options.KeyFromUrl(options.PublicUrl(key)));
    }

    [Fact]
    public void Una_url_ajena_no_devuelve_clave()
    {
        // Imagen re-hospedada de un proveedor: borrar por clave ahí sería borrar
        // un objeto que no es nuestro (o ninguno).
        Assert.Null(Minio().KeyFromUrl("https://cdn.proveedor.com/foto.jpg"));
        Assert.Null(R2().KeyFromUrl("https://cdn.proveedor.com/foto.jpg"));
    }

    [Fact]
    public void La_barra_final_del_dominio_no_duplica_la_barra()
    {
        var options = R2() with { PublicBaseUrl = "https://img.tiendafy.com.ar/" };
        Assert.Equal("https://img.tiendafy.com.ar/a/b.png", options.PublicUrl("a/b.png"));
        Assert.Equal("a/b.png", options.KeyFromUrl("https://img.tiendafy.com.ar/a/b.png"));
    }

    // ---- De qué tienda es una URL nuestra (borrar y agregar fotos) ----

    private static readonly Guid TenantA = Guid.Parse("0f8fad5b-d9cb-469f-a165-70867728950e");
    private static readonly Guid TenantB = Guid.Parse("7c9e6679-7425-40de-944b-e07fc1f90ae7");

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void La_clave_de_una_foto_propia_sale_solo_para_su_tienda(bool bucketInUrl)
    {
        var options = bucketInUrl ? Minio() : R2();
        var url = options.PublicUrl($"{TenantA}/abc.webp");

        Assert.Equal($"{TenantA}/abc.webp", options.TenantKeyFromUrl(TenantA, url));
        Assert.Null(options.TenantKeyFromUrl(TenantB, url));
        Assert.False(options.IsForeignMedia(TenantA, url));
        Assert.True(options.IsForeignMedia(TenantB, url));
    }

    [Theory]
    // Arranca con la tienda A pero sube a la carpeta de B.
    [InlineData("{base}/{A}/../{B}/foto.png")]
    [InlineData("{base}/{A}/./foto.png")]
    [InlineData("{base}/{A}//foto.png")]
    [InlineData("{base}/{A}/%2e%2e/{B}/foto.png")]
    [InlineData("{base}/{A}/foto.png?x=1")]
    [InlineData(@"{base}/{A}\..\{B}\foto.png")]
    // El nombre del bucket metido en otro host: no es una URL nuestra.
    [InlineData("https://evil.example/tiendafy-media/{A}/foto.png")]
    public void Una_url_armada_a_mano_no_da_una_clave_de_la_tienda(string template)
    {
        var options = Minio();
        var url = template
            .Replace("{base}", "http://localhost:9000/tiendafy-media", StringComparison.Ordinal)
            .Replace("{A}", TenantA.ToString(), StringComparison.Ordinal)
            .Replace("{B}", TenantB.ToString(), StringComparison.Ordinal);

        Assert.Null(options.TenantKeyFromUrl(TenantA, url));
    }

    [Fact]
    public void Una_url_de_otro_lado_no_es_media_ajena()
    {
        // Las fotos de un proveedor se pueden usar: no son de otra tienda nuestra.
        Assert.False(Minio().IsForeignMedia(TenantA, "https://cdn.proveedor.com/foto.jpg"));
        Assert.False(R2().IsForeignMedia(TenantA, "https://cdn.proveedor.com/foto.jpg"));
    }
}
