using System.IO.Compression;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// La API comprime el JSON para quien lo acepta (Brotli, o Gzip), y solo
/// para quien lo acepta: el server de la tienda y los tests que no mandan
/// Accept-Encoding siguen recibiendo el JSON tal cual.
/// </summary>
[Collection("api")]
public sealed class ResponseCompressionTests
{
    private readonly ApiFactory _factory;

    public ResponseCompressionTests(ApiFactory factory) => _factory = factory;

    private static async Task<HttpResponseMessage> GetAsync(Merchant store, HttpClient client, string path, string? acceptEncoding)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, path);
        req.Headers.Add("X-Tenant-Id", store.TenantId.ToString());
        if (acceptEncoding is not null) req.Headers.AcceptEncoding.ParseAdd(acceptEncoding);
        return await client.SendAsync(req);
    }

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage res)
    {
        await using var raw = await res.Content.ReadAsStreamAsync();
        Stream body = res.Content.Headers.ContentEncoding.FirstOrDefault() switch
        {
            "br" => new BrotliStream(raw, CompressionMode.Decompress),
            "gzip" => new GZipStream(raw, CompressionMode.Decompress),
            _ => raw,
        };
        await using (body)
            return await JsonSerializer.DeserializeAsync<JsonElement>(body);
    }

    [Theory]
    [InlineData("br, gzip", "br")]
    [InlineData("gzip", "gzip")]
    public async Task El_catalogo_sale_comprimido_para_quien_lo_acepta(string accept, string expected)
    {
        var store = await SeededStore.GetAsync(_factory);

        var res = await GetAsync(store, store.Anonymous(), "/api/v1/products?status=ACTIVE&limit=24", accept);

        Assert.Equal(System.Net.HttpStatusCode.OK, res.StatusCode);
        Assert.Equal([expected], res.Content.Headers.ContentEncoding);
        Assert.Contains("Accept-Encoding", res.Headers.Vary);
        var json = await ReadJsonAsync(res);
        Assert.True(json.GetProperty("items").GetArrayLength() > 0);
    }

    [Fact]
    public async Task Sin_Accept_Encoding_va_sin_comprimir()
    {
        var store = await SeededStore.GetAsync(_factory);

        var res = await GetAsync(store, store.Anonymous(), "/api/v1/products?status=ACTIVE&limit=24", null);

        Assert.Empty(res.Content.Headers.ContentEncoding);
        Assert.True((await ReadJsonAsync(res)).GetProperty("items").GetArrayLength() > 0);
    }

    [Fact]
    public async Task La_sesion_no_se_comprime_aunque_se_acepte()
    {
        var store = await SeededStore.GetAsync(_factory);

        var res = await GetAsync(store, store.Client, "/api/v1/auth/me", "br, gzip");

        Assert.Equal(System.Net.HttpStatusCode.OK, res.StatusCode);
        Assert.Empty(res.Content.Headers.ContentEncoding);
    }
}
