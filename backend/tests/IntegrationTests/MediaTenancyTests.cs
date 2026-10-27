using System.Net;
using System.Net.Http.Headers;
using Catalog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Las fotos de todas las tiendas viven en el mismo bucket, separadas solo
/// por la carpeta de cada tienda en la clave. Una tienda no puede usar ni
/// borrar los objetos de otra.
/// </summary>
[Collection("api")]
public sealed class MediaTenancyTests
{
    private readonly ApiFactory _factory;

    public MediaTenancyTests(ApiFactory factory) => _factory = factory;

    private const string Bucket = $"{ApiFactory.Storage}/tiendafy-media/";

    [Fact]
    public async Task Una_tienda_no_usa_ni_borra_las_fotos_de_otra()
    {
        var a = await Merchant.CreateAsync(_factory, "mda");
        var b = await Merchant.CreateAsync(_factory, "mdb");
        var photoOfB = await UploadAsync(b, "de-b.png");
        var photoOfA = await UploadAsync(a, "de-a.png");
        Assert.StartsWith($"{Bucket}{b.TenantId}/", photoOfB, StringComparison.Ordinal);

        var (productId, _) = await a.CreateProductAsync("Remera", stock: 0);

        // Agregar como foto la URL de un objeto de B: no.
        var rejected = await a.SendAsync(HttpMethod.Post, $"/api/v1/products/{productId}/images", new { url = photoOfB });
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.Contains("no es de tu tienda", await rejected.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        // Una propia, o la de un proveedor, sí.
        await a.PostAsync($"/api/v1/products/{productId}/images", new { url = photoOfA });
        await a.PostAsync($"/api/v1/products/{productId}/images", new { url = "https://cdn.proveedor.example/remera.jpg" });

        // Una galería que ya tenía la foto de B (cargada antes de este control):
        // borrar el catálogo de A no borra el objeto de B.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
            var product = await db.Products.IgnoreQueryFilters().Include(p => p.Images).SingleAsync(p => p.Id == productId);
            Assert.True(product.AddImage(photoOfB, null).IsSuccess);
            await db.SaveChangesAsync();
        }

        await a.ExpectOkAsync(HttpMethod.Delete, "/api/v1/products");

        var deleted = _factory.ExternalHttp.SentTo(Bucket)
            .Where(r => r.Method == HttpMethod.Delete)
            .Select(r => r.Uri.ToString())
            .ToList();
        Assert.Contains(photoOfA, deleted);
        Assert.DoesNotContain(photoOfB, deleted);
        Assert.DoesNotContain(deleted, u => u.Contains("proveedor", StringComparison.Ordinal));
        Assert.Contains(_factory.Logs.Lines, l => l.Contains("no se borra", StringComparison.Ordinal) && l.Contains(photoOfB, StringComparison.Ordinal));
    }

    private static async Task<string> UploadAsync(Merchant merchant, string fileName)
    {
        using var form = new MultipartFormDataContent
        {
            { new ByteArrayContent(TestImages.Png) { Headers = { ContentType = new MediaTypeHeaderValue("image/png") } }, "file", fileName },
        };
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/media") { Content = form };
        req.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        var res = await merchant.Client.SendAsync(req);
        Assert.True(res.IsSuccessStatusCode, await res.Content.ReadAsStringAsync());
        return (await res.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("url").GetString()!;
    }
}
