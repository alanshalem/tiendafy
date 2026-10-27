using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Los topes de la importación masiva: lo que entra por la subida de fotos
/// (y lo que descomprime un .zip) y lo que se baja de las URLs de la planilla.
/// Sin ellos, un pedido o una URL podían llenar el disco o la memoria del
/// servidor.
/// </summary>
[Collection("api")]
public sealed class ProductImportLimitsTests
{
    private readonly ApiFactory _factory;

    public ProductImportLimitsTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Un_zip_con_rutas_hacia_afuera_se_rechaza_entero()
    {
        var merchant = await Merchant.CreateAsync(_factory, "zip");

        using var form = new MultipartFormDataContent
        {
            { new ByteArrayContent(Zip(("buena.png", TestImages.Png), ("../../fuera.png", TestImages.Png))), "files", "fotos.zip" },
        };
        var res = await SendAsync(merchant, form);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Contains("Import.ZipBadPath", await res.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Una_subida_que_declara_mas_del_tope_se_corta_antes_de_leerla()
    {
        var merchant = await Merchant.CreateAsync(_factory, "big");

        using var form = new MultipartFormDataContent
        {
            { new ByteArrayContent(TestImages.Png) { Headers = { ContentType = new MediaTypeHeaderValue("image/png") } }, "files", "foto.png" },
        };
        await form.LoadIntoBufferAsync();
        form.Headers.ContentLength = 2L * 1024 * 1024 * 1024; // 2 GB declarados
        var res = await SendAsync(merchant, form);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, res.StatusCode);
    }

    [Fact]
    public async Task Una_foto_de_la_planilla_que_pesa_de_mas_no_se_baja_entera()
    {
        var merchant = await Merchant.CreateAsync(_factory, "dlc");
        var tag = merchant.Subdomain;

        // Las dos pesan 6 MB (el máximo de una imagen es 5): una lo dice, la
        // otra declara 100 bytes. Ninguna se re-hospeda, y de ninguna se lee
        // más que el máximo.
        var big = new byte[6 * 1024 * 1024];
        TestImages.Png.CopyTo(big, 0);
        var honest = new CountingStream(big);
        var liar = new CountingStream(big);
        _factory.ExternalHttp.On(HttpMethod.Get, "https://203.0.113.20/", (_, _) => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StreamContent(honest) { Headers = { ContentType = new("image/png"), ContentLength = big.Length } },
        });
        _factory.ExternalHttp.On(HttpMethod.Get, "https://203.0.113.21/", (_, _) => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StreamContent(liar) { Headers = { ContentType = new("image/png"), ContentLength = 100 } },
        });
        _factory.ExternalHttp.On(HttpMethod.Get, "https://203.0.113.22/", (_, _) => TestImages.PngResponse());

        var csv = string.Join("\n",
            "Identificador de URL;Nombre;Precio;SKU;Mostrar en tienda;Imágenes",
            $"pesada-{tag};Pesada;1000;PES-{tag};SI;https://203.0.113.20/pesada.png",
            $"mentirosa-{tag};Mentirosa;1000;MEN-{tag};SI;https://203.0.113.21/mentirosa.png",
            $"liviana-{tag};Liviana;1000;LIV-{tag};SI;https://203.0.113.22/liviana.png");

        using var form = new MultipartFormDataContent
        {
            { new StringContent(csv), "file", "productos.csv" },
            { new StringContent("true"), "updateExisting" },
            { new StringContent("false"), "updateStock" },
        };
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/products/import") { Content = form };
        req.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        var accepted = await merchant.Client.SendAsync(req);
        Assert.Equal(HttpStatusCode.Accepted, accepted.StatusCode);
        var jobId = (await accepted.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("jobId").GetString();

        JsonElement job;
        var deadline = DateTime.UtcNow.AddSeconds(60);
        do
        {
            await Task.Delay(200);
            job = await merchant.GetAsync($"/api/v1/products/import/{jobId}");
        }
        while (job.GetProperty("status").GetString() is "queued" or "processing" && DateTime.UtcNow < deadline);
        Assert.Equal("completed", job.GetProperty("status").GetString());

        async Task<string> ImageOf(string slug) =>
            (await merchant.GetAsync($"/api/v1/products/by-slug/{slug}-{tag}")).GetProperty("images")[0].GetProperty("url").GetString()!;

        // Las pesadas quedan con la URL de origen (como cualquier descarga que falla); la liviana, en el storage.
        Assert.Equal("https://203.0.113.20/pesada.png", await ImageOf("pesada"));
        Assert.Equal("https://203.0.113.21/mentirosa.png", await ImageOf("mentirosa"));
        Assert.StartsWith(ApiFactory.Storage, await ImageOf("liviana"), StringComparison.Ordinal);
        Assert.Equal(0, honest.BytesRead);
        Assert.InRange(liar.BytesRead, 5 * 1024 * 1024, 5 * 1024 * 1024 + 81_920);
    }

    private static Task<HttpResponseMessage> SendAsync(Merchant merchant, HttpContent form)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/products/images/import") { Content = form };
        req.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        return merchant.Client.SendAsync(req);
    }

    private static byte[] Zip(params (string Name, byte[] Content)[] entries)
    {
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
            foreach (var (name, content) in entries)
            {
                using var s = zip.CreateEntry(name).Open();
                s.Write(content);
            }
        return ms.ToArray();
    }

    /// <summary>El cuerpo de una respuesta, contando cuánto se leyó de él.</summary>
    private sealed class CountingStream(byte[] data) : MemoryStream(data, writable: false)
    {
        public long BytesRead { get; private set; }

        public override int Read(byte[] buffer, int offset, int count)
        {
            var read = base.Read(buffer, offset, count);
            BytesRead += read;
            return read;
        }

        // En una clase derivada, MemoryStream manda las otras lecturas (Span,
        // asíncronas) a esta: contarlas también las contaría dos veces.
    }
}
