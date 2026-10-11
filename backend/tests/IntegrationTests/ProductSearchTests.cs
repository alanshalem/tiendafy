
namespace IntegrationTests;

/// <summary>
/// Buscar productos como escribe una persona, contra Postgres real.
///
/// Antes la búsqueda era el texto entero, contiguo y sensible a tildes:
/// "camion" no encontraba "Camión" y "rojo camión" no encontraba nada. Ahora
/// cada palabra tiene que aparecer, en cualquier orden y sin importar tildes.
/// La parte que más importa es la última: es un superconjunto estricto, así
/// que nada de lo que antes se encontraba deja de encontrarse.
///
/// Corre contra la base porque las tildes las saca unaccent, de Postgres.
/// </summary>
[Collection("api")]
public sealed class ProductSearchTests
{
    private readonly ApiFactory _factory;

    public ProductSearchTests(ApiFactory factory) => _factory = factory;

    private const string Camion = "Camión de juguete Rojo";
    private const string Remera = "Remera Azul Lisa";

    [Theory]
    [InlineData("camion", Camion)]          // sin tilde encuentra con tilde
    [InlineData("CAMIÓN", Camion)]          // y con tilde y en mayúsculas
    [InlineData("rojo camion", Camion)]     // palabras en cualquier orden
    [InlineData("azul remera", Remera)]
    [InlineData("Camión de juguete", Camion)] // lo que ya andaba: el texto contiguo
    public async Task El_panel_encuentra_lo_que_escribe_una_persona(string q, string esperado)
    {
        var merchant = await StoreWithProductsAsync();

        var nombres = await NamesAsync(merchant, $"/api/v1/products?offset=0&limit=50&q={Uri.EscapeDataString(q)}");

        Assert.Contains(esperado, nombres);
    }

    [Fact]
    public async Task Todas_las_palabras_tienen_que_estar()
    {
        var merchant = await StoreWithProductsAsync();

        var nombres = await NamesAsync(merchant, "/api/v1/products?offset=0&limit=50&q=camion%20azul");

        Assert.DoesNotContain(Camion, nombres);
        Assert.DoesNotContain(Remera, nombres);
    }

    [Fact]
    public async Task El_panel_tambien_encuentra_por_SKU()
    {
        var merchant = await StoreWithProductsAsync();

        var nombres = await NamesAsync(merchant, "/api/v1/products?offset=0&limit=50&q=REM-AZ");

        Assert.Contains(Remera, nombres);
    }

    [Fact]
    public async Task La_tienda_busca_sin_tildes_y_no_por_SKU()
    {
        var merchant = await StoreWithProductsAsync();

        var porNombre = await NamesAsync(merchant, "/api/v1/products/search?q=rojo%20camion");
        var porSku = await NamesAsync(merchant, "/api/v1/products/search?q=REM-AZ");

        Assert.Contains(Camion, porNombre);
        Assert.Empty(porSku);
    }

    // ---------------------------------------------------------------- helpers

    private async Task<Merchant> StoreWithProductsAsync()
    {
        var merchant = await Merchant.CreateAsync(_factory, "src");
        await merchant.CreateProductAsync(Camion, sku: "CAM-RJ-01", stock: 0);
        await merchant.CreateProductAsync(Remera, sku: "REM-AZ-01", stock: 0);
        return merchant;
    }

    private static async Task<List<string>> NamesAsync(Merchant merchant, string path)
    {
        var body = await merchant.GetAsync(path);
        return [.. body.GetProperty("items").EnumerateArray().Select(p => p.GetProperty("name").GetString()!)];
    }
}
