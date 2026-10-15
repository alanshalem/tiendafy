using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// La forma de los listados del panel, contra la API real.
///
/// Todos devuelven lo mismo —<c>items</c> y <c>total</c>— y el panel pagina con
/// eso. La mecánica de paginar se unificó en un helper, pero la respuesta de
/// cada endpoint la sigue armando él: este test es lo que garantiza que
/// unificar la mecánica no le haya cambiado el contrato a ninguno, ahora ni
/// cuando a alguien se le ocurra "emprolijar" las respuestas.
///
/// Y de paso cubre el techo de página: pedir cien mil filas no puede traerlas.
/// </summary>
[Collection("api")]
public sealed class ListContractTests
{
    private readonly ApiFactory _factory;

    public ListContractTests(ApiFactory factory) => _factory = factory;

    /// <summary>Los listados que comparten la mecánica de paginado.</summary>
    private static readonly string[] Paths =
    [
        "/api/v1/coupons",
        "/api/v1/customers",
        "/api/v1/quotes",
        "/api/v1/contact/messages",
        "/api/v1/purchasing/purchase-orders",
        "/api/v1/finance/movements",
        "/api/v1/finance/receipts",
        "/api/v1/finance/balances",
        "/api/v1/pages",
        "/api/v1/products/kits",
        "/api/v1/theme/history",
        "/api/v1/support/conversations",
    ];

    public static TheoryData<string> Listados() => new(Paths);

    [Theory]
    [MemberData(nameof(Listados))]
    public async Task Un_listado_devuelve_items_y_total(string path)
    {
        var merchant = await Merchant.CreateAsync(_factory, "lst");

        var body = await merchant.GetAsync(path);

        Assert.True(body.TryGetProperty("items", out var items), $"{path} no devolvió 'items'");
        Assert.Equal(JsonValueKind.Array, items.ValueKind);
        Assert.True(body.TryGetProperty("total", out var total), $"{path} no devolvió 'total'");
        Assert.Equal(JsonValueKind.Number, total.ValueKind);
    }

    [Theory]
    [MemberData(nameof(Listados))]
    public async Task Pedir_cien_mil_filas_no_las_trae(string path)
    {
        var merchant = await Merchant.CreateAsync(_factory, "cap");

        var sep = path.Contains('?') ? '&' : '?';
        var body = await merchant.GetAsync($"{path}{sep}limit=100000&offset=-5");

        // La tienda está vacía, así que lo que se prueba es que no explote ni
        // rechace: el clamp pasa a ser el techo real y el offset negativo es
        // el principio. (El límite en sí lo cubre PagingTests, sin base.)
        Assert.Equal(JsonValueKind.Array, body.GetProperty("items").ValueKind);
        Assert.Equal(0, body.GetProperty("total").GetInt32());
    }
}
