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
}
