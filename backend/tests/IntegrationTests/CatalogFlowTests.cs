using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// El catálogo desde el panel: editar un producto entero, la operación del
/// depósito (kits, escáner, etiquetas, costos, repreciar) y la carga masiva
/// (CSV de productos, imágenes sueltas o en .zip, exportación).
///
/// <para>
/// Las imágenes se suben a un S3 simulado en <see cref="FakeHttp"/> con el
/// cliente de AWS real: la validación de tipo y de magic bytes, la clave del
/// objeto y la URL pública son las de producción.
/// </para>
/// </summary>
[Collection("api")]
public sealed class CatalogFlowTests
{
    private readonly ApiFactory _factory;

    public CatalogFlowTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Editar_un_producto_de_punta_a_punta()
    {
        var merchant = await Merchant.CreateAsync(_factory, "cat");
        var shopper = new Shopper(merchant);

        // Con opciones: Talle × Color.
        var created = await merchant.PostAsync("/api/v1/products", new
        {
            name = "Remera Básica",
            description = "Algodón peinado",
            options = new[] { new { name = "Talle", values = new[] { "S", "M" } }, new { name = "Color", values = new[] { "Negro" } } },
            variants = new[]
            {
                new { sku = $"REM-S-{merchant.Subdomain}", optionValues = new[] { "S", "Negro" }, priceAmount = 10_000_00L, currency = "ARS", compareAtAmount = (long?)12_000_00L },
                new { sku = $"REM-M-{merchant.Subdomain}", optionValues = new[] { "M", "Negro" }, priceAmount = 10_000_00L, currency = "ARS", compareAtAmount = (long?)null },
            },
        });
        var id = created.GetProperty("id").GetGuid();
        var variantId = created.GetProperty("variants")[0].GetProperty("id").GetGuid();
        var slug = created.GetProperty("slug").GetString()!;

        // Borrador: la tienda todavía no lo ve.
        Assert.Equal(HttpStatusCode.NotFound, (await shopper.SendAsync(HttpMethod.Get, $"/api/v1/products/by-slug/{slug}")).StatusCode);

        // Datos, SEO y marca.
        var edited = await merchant.PatchAsync($"/api/v1/products/{id}", new
        {
            name = "Remera Básica Premium",
            description = "<p>Algodón peinado 24/1</p>",
            seoTitle = "Remera premium",
            seoDescription = "La remera que dura",
            brand = "Tiendafy",
        });
        Assert.Equal("Remera Básica Premium", edited.GetProperty("name").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Patch, $"/api/v1/products/{id}", new { name = "" })).StatusCode);

        // Imágenes: subir al storage, agregar, reordenar, borrar.
        var urls = new List<string>();
        for (var i = 0; i < 2; i++)
            urls.Add(await UploadAsync(merchant, TestImages.Png, "image/png", $"foto{i}.png"));
        Assert.All(urls, u => Assert.StartsWith($"{ApiFactory.Storage}/tiendafy-media/", u));
        foreach (var url in urls)
            await merchant.PostAsync($"/api/v1/products/{id}/images", new { url, altText = "Remera" });
        var withImages = await merchant.GetAsync($"/api/v1/products/{id}");
        var imageIds = withImages.GetProperty("images").EnumerateArray().Select(i => i.GetProperty("id").GetGuid()).ToList();
        var reordered = await merchant.PutAsync($"/api/v1/products/{id}/images/reorder", new { imageIds = imageIds.AsEnumerable().Reverse() });
        Assert.Equal(imageIds[1], reordered.GetProperty("images")[0].GetProperty("id").GetGuid());
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/products/{id}/images/{imageIds[0]}");

        // SVG (logos): se guarda saneado, sin scripts ni manejadores de eventos.
        var svg = """<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><rect width="1" height="1"/></a><foreignObject><div/></foreignObject></svg>"""u8.ToArray();
        await UploadAsync(merchant, svg, "image/svg+xml", "logo.svg");
        var uploadedSvg = _factory.ExternalHttp.SentTo($"{ApiFactory.Storage}/tiendafy-media/").Last(r => r.Method == HttpMethod.Put).Body!;
        Assert.Contains("<rect", uploadedSvg);
        Assert.DoesNotContain("<script", uploadedSvg);
        Assert.DoesNotContain("onload", uploadedSvg);
        Assert.DoesNotContain("javascript:", uploadedSvg);
        Assert.DoesNotContain("foreignObject", uploadedSvg);
        Assert.Equal(HttpStatusCode.BadRequest, (await UploadRawAsync(merchant, "no es svg"u8.ToArray(), "image/svg+xml", "x.svg")).StatusCode);

        // El storage rechaza lo que no es una imagen de verdad.
        Assert.Equal(HttpStatusCode.BadRequest, (await UploadRawAsync(merchant, "no soy un png"u8.ToArray(), "image/png", "x.png")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await UploadRawAsync(merchant, TestImages.Png, "application/pdf", "x.pdf")).StatusCode);

        // Precio de una variante, publicar, archivar, volver a publicar.
        var repriced = await merchant.PatchAsync($"/api/v1/products/{id}/variants/{variantId}/price",
            new { priceAmount = 11_000_00L, currency = "ARS", compareAtAmount = 13_000_00L });
        Assert.Equal(11_000_00, repriced.GetProperty("variants").EnumerateArray()
            .Single(v => v.GetProperty("id").GetGuid() == variantId).GetProperty("price").GetProperty("amount").GetInt64());
        await merchant.PostAsync($"/api/v1/products/{id}/publish", new { });
        var visible = await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/products/by-slug/{slug}");
        Assert.Equal("Remera Básica Premium", visible.GetProperty("name").GetString());
        await merchant.PostAsync($"/api/v1/products/{id}/archive", new { });
        Assert.Equal(HttpStatusCode.NotFound, (await shopper.SendAsync(HttpMethod.Get, $"/api/v1/products/by-slug/{slug}")).StatusCode);
        await merchant.PostAsync($"/api/v1/products/{id}/publish", new { });

        // Categorías y ficha técnica.
        var category = await merchant.PostAsync("/api/v1/categories", new { name = "Remeras" });
        var categoryId = category.GetProperty("id").GetGuid();
        var sub = await merchant.PostAsync("/api/v1/categories", new { name = "Lisas", parentId = categoryId });
        await merchant.PutAsync($"/api/v1/categories/{sub.GetProperty("id").GetGuid()}", new { name = "Lisas y básicas" });
        var withCategory = await merchant.PutAsync($"/api/v1/products/{id}/categories", new { categoryIds = new[] { categoryId } });
        Assert.Contains(categoryId, withCategory.GetProperty("categoryIds").EnumerateArray().Select(c => c.GetGuid()));

        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/spec-definitions", new { name = "" })).StatusCode);
        var material = await merchant.PostAsync("/api/v1/spec-definitions", new
        {
            name = "Material",
            type = "TEXT",
            unit = (string?)null,
            options = (string[]?)null,
            categoryIds = new[] { categoryId },
            showOnProduct = true,
            filterable = true,
            meliAttributeId = "MATERIAL",
            sortOrder = 1,
        });
        var weight = await merchant.PostAsync("/api/v1/spec-definitions", new
        {
            name = "Peso",
            type = "NUMBER",
            unit = "g",
            showOnProduct = true,
            filterable = false,
            sortOrder = 2,
        });
        var fit = await merchant.PostAsync("/api/v1/spec-definitions", new
        {
            name = "Calce",
            type = "SELECT",
            options = new[] { "Regular", "Oversize" },
            showOnProduct = true,
            filterable = true,
            sortOrder = 3,
        });
        await merchant.PutAsync($"/api/v1/spec-definitions/{weight.GetProperty("id").GetGuid()}", new
        {
            name = "Peso neto",
            type = "NUMBER",
            unit = "g",
            showOnProduct = false,
            filterable = false,
            sortOrder = 2,
        });
        var specs = await merchant.PutAsync($"/api/v1/products/{id}/specs", new
        {
            values = new object[]
            {
                new { definitionId = material.GetProperty("id").GetGuid(), value = "Algodón" },
                new { definitionId = fit.GetProperty("id").GetGuid(), value = "Oversize" },
                new { definitionId = Guid.NewGuid(), value = "inventado" }, // no existe: se ignora
            },
        });
        Assert.Equal(2, specs.GetProperty("specs").GetArrayLength());
        Assert.Equal(3, (await merchant.GetAsync("/api/v1/spec-definitions")).GetProperty("items").GetArrayLength());
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/spec-definitions/{weight.GetProperty("id").GetGuid()}");

        // La tienda filtra por categoría y por ficha.
        var byCategory = await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/products?status=ACTIVE&categoryId={categoryId}");
        Assert.Single(byCategory.GetProperty("items").EnumerateArray());

        // Duplicar crea un borrador aparte.
        var copy = await merchant.PostAsync($"/api/v1/products/{id}/duplicate", new { });
        Assert.NotEqual(id, copy.GetProperty("id").GetGuid());
        Assert.NotEqual(slug, copy.GetProperty("slug").GetString());

        // Borrar uno, y lo que no existe.
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/products/{copy.GetProperty("id").GetGuid()}");
        var missing = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Delete, $"/api/v1/products/{missing}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/products/{missing}/categories", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/products/{missing}/specs", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/products/{missing}/publish")).StatusCode);

        // Categorías: borrar la hija.
        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/categories/{sub.GetProperty("id").GetGuid()}");
    }

    [Fact]
    public async Task Deposito_kits_costos_y_repreciar()
    {
        var merchant = await Merchant.CreateAsync(_factory, "dep");
        var (barProduct, bar) = await merchant.CreateProductAsync("Barra 20kg", priceMinor: 100_000_00, stock: 5, sku: $"BAR-{merchant.Subdomain}");
        var (discProduct, disc) = await merchant.CreateProductAsync("Disco 10kg", priceMinor: 30_000_00, stock: 20, sku: $"DIS-{merchant.Subdomain}");
        // El kit tiene su propio stock (lo reserva el checkout) y además descuenta sus componentes.
        var (kitProduct, kit) = await merchant.CreateProductAsync("Combo barra + 2 discos", priceMinor: 150_000_00, stock: 5, sku: $"KIT-{merchant.Subdomain}");

        // Costos de los componentes.
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/products/{barProduct}/costs",
            new { costs = new[] { new { variantId = bar, costAmount = (long?)60_000_00 } }, currency = "ARS" });
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/products/{discProduct}/costs",
            new { costs = new[] { new { variantId = disc, costAmount = (long?)15_000_00 } }, currency = "ARS" });
        var costs = await merchant.GetAsync($"/api/v1/products/{barProduct}/costs");
        Assert.Equal(60_000_00, costs.GetProperty("items")[0].GetProperty("costAmount").GetInt64());
        var bulk = await merchant.GetAsync($"/api/v1/products/costs?ids={barProduct},{discProduct},no-es-un-id");
        Assert.Equal(2, bulk.GetProperty("items").GetArrayLength());

        // Kit: validaciones y armado.
        foreach (var bad in new object[]
        {
            new { components = new[] { new { componentVariantId = disc, quantity = 0 } } },
            new { components = new[] { new { componentVariantId = kit, quantity = 1 } } },
            new { components = new[] { new { componentVariantId = disc, quantity = 1 }, new { componentVariantId = disc, quantity = 1 } } },
        })
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/products/variants/{kit}/kit", bad)).StatusCode);
        }
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/products/variants/{kit}/kit",
            new { components = new[] { new { componentVariantId = Guid.NewGuid(), quantity = 1 } } })).StatusCode);

        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/products/variants/{kit}/kit", new
        {
            components = new[] { new { componentVariantId = bar, quantity = 1 }, new { componentVariantId = disc, quantity = 2 } },
        });
        // Sin kits anidados.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, $"/api/v1/products/variants/{bar}/kit",
            new { components = new[] { new { componentVariantId = kit, quantity = 1 } } })).StatusCode);

        var kits = await merchant.GetAsync("/api/v1/products/kits");
        Assert.Equal(2, kits.GetProperty("items")[0].GetProperty("components").GetArrayLength());
        var suggested = await merchant.GetAsync("/api/v1/products/kits/suggested-costs");
        Assert.Equal(90_000_00, suggested.GetProperty("items")[0].GetProperty("suggestedCostMinor").GetInt64()); // 60k + 2×15k

        // Vender el kit descuenta sus componentes; devolverlo con reingreso los repone.
        var sale = await merchant.PostAsync("/api/v1/orders/manual", new { items = new[] { new { variantId = kit, quantity = 2 } }, paymentMethod = "cash" });
        Assert.Equal(3, await merchant.AvailableAsync(bar));
        Assert.Equal(16, await merchant.AvailableAsync(disc));
        await merchant.PostAsync($"/api/v1/orders/{sale.GetProperty("id").GetGuid()}/refund", new { reason = "Devolución", restock = true });
        Assert.Equal(5, await merchant.AvailableAsync(bar));
        Assert.Equal(20, await merchant.AvailableAsync(disc));
        Assert.Equal(5, await merchant.AvailableAsync(kit));
        await merchant.PostAsync("/api/v1/orders/manual", new { items = new[] { new { variantId = kit, quantity = 2 } }, paymentMethod = "cash" });

        // Escáner: por SKU, después por el EAN asignado.
        var bySku = await merchant.GetAsync($"/api/v1/products/by-code/BAR-{merchant.Subdomain}");
        Assert.Equal(bar, bySku.GetProperty("variantId").GetGuid());
        var ean = $"779{Random.Shared.NextInt64(1_000_000_000, 9_999_999_999)}";
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/products/{barProduct}/variants/{bar}/barcode", new { barcode = ean });
        Assert.Equal(3, (await merchant.GetAsync($"/api/v1/products/by-code/{ean}")).GetProperty("available").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Get, "/api/v1/products/by-code/0000000000000")).StatusCode);

        // Etiquetas para imprimir.
        var labels = await merchant.ExpectOkAsync(HttpMethod.Get, $"/api/v1/products/labels?variantIds={bar},{disc}");
        Assert.Equal("application/pdf", labels.Content.Headers.ContentType?.MediaType);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Get, "/api/v1/products/labels?variantIds=x")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/products/labels?variantIds={Guid.NewGuid()}")).StatusCode);

        // Repreciar +10 % con redondeo comercial a una categoría.
        var category = await merchant.PostAsync("/api/v1/categories", new { name = "Pesas" });
        var categoryId = category.GetProperty("id").GetGuid();
        await merchant.PutAsync($"/api/v1/products/{discProduct}/categories", new { categoryIds = new[] { categoryId } });
        var repriced = await merchant.PostAsync("/api/v1/products/reprice", new { percent = 10m, categoryId, rounding = "100" });
        Assert.Equal(1, repriced.GetProperty("products").GetInt32());
        var disco = await merchant.GetAsync($"/api/v1/products/{discProduct}");
        Assert.True(disco.GetProperty("variants")[0].GetProperty("price").GetProperty("amount").GetInt64() >= 33_000_00);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/products/reprice",
            new { percent = 10m, categoryId = Guid.NewGuid() })).StatusCode);

        // Salud del catálogo: los tres con costo, ninguno con imagen.
        var health = await merchant.GetAsync("/api/v1/products/health");
        Assert.Equal(3, health.GetProperty("withoutImage").GetInt32());

        // Borrar todo el catálogo de la tienda.
        var wipe = await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/products");
        Assert.Equal(3, (await wipe.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("deleted").GetInt32());
    }

    [Fact]
    public async Task Importar_y_exportar_productos_e_imagenes()
    {
        var merchant = await Merchant.CreateAsync(_factory, "imp");
        var tag = merchant.Subdomain;

        // Las imágenes del CSV se bajan (de una IP pública: la defensa anti-SSRF
        // no deja ir a la red interna) y se suben al storage propio.
        _factory.ExternalHttp.On(HttpMethod.Get, "https://203.0.113.10/", (_, _) => TestImages.PngResponse());

        var csv = string.Join("\n",
            string.Join(";", "Identificador de URL", "Nombre", "Categorías", "Nombre de propiedad 1", "Valor de propiedad 1",
                "Precio", "Precio promocional", "Costo", "Stock", "SKU", "Código de barras", "Mostrar en tienda", "Descripción", "Imágenes", "Marca"),
            string.Join(";", $"buzo-{tag}", "Buzo canguro", "Indumentaria > Buzos", "Talle", "S", "25000", "28000", "12000", "7", $"BUZ-S-{tag}", "", "SI",
                "\"Frisa \"\"premium\"\";\nlavar en frío\"", "https://203.0.113.10/buzo.png", "Marca X"),
            string.Join(";", $"buzo-{tag}", "", "", "Talle", "M", "25000", "", "12000", "3", $"BUZ-M-{tag}", "", "", "", "", ""),
            string.Join(";", $"gorra-{tag}", "Gorra", "Accesorios", "", "", "9.900,50", "", "", "10", $"GOR-{tag}", "7790000000017", "NO", "",
                "http://169.254.169.254/latest/meta-data", ""),
            string.Join(";", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "")); // fila vacía: se ignora

        var job = await ImportAsync(merchant, csv, updateExisting: true);
        Assert.Equal("completed", job.GetProperty("status").GetString());
        Assert.Equal(2, job.GetProperty("created").GetInt32());

        var buzo = await merchant.GetAsync($"/api/v1/products/by-slug/buzo-{tag}");
        Assert.Equal(2, buzo.GetProperty("variants").GetArrayLength());
        Assert.Contains("\"premium\"", buzo.GetProperty("description").GetString());
        Assert.StartsWith(ApiFactory.Storage, buzo.GetProperty("images")[0].GetProperty("url").GetString());
        var buzoS = buzo.GetProperty("variants").EnumerateArray().Single(v => v.GetProperty("sku").GetString() == $"BUZ-S-{tag}");
        Assert.Equal(7, await merchant.AvailableAsync(buzoS.GetProperty("id").GetGuid()));

        // La gorra quedó oculta y sin la imagen de la red interna.
        var gorra = (await merchant.GetAsync($"/api/v1/products?q=GOR-{tag}&limit=5")).GetProperty("items")
            .EnumerateArray().Single();
        Assert.Equal(0, gorra.GetProperty("images").GetArrayLength());
        Assert.NotEqual("ACTIVE", gorra.GetProperty("status").GetString());
        Assert.Equal(990050, gorra.GetProperty("variants")[0].GetProperty("price").GetProperty("amount").GetInt64());

        // Volver a importar actualiza en vez de duplicar; sin "actualizar", saltea.
        var again = await ImportAsync(merchant, csv.Replace("25000", "26000"), updateExisting: true);
        Assert.Equal(2, again.GetProperty("updated").GetInt32());
        var skip = await ImportAsync(merchant, csv, updateExisting: false);
        Assert.Equal(2, skip.GetProperty("skipped").GetInt32());

        // Imágenes por nombre de archivo = slug (sueltas y en .zip).
        using var form = new MultipartFormDataContent
        {
            { new ByteArrayContent(TestImages.Png) { Headers = { ContentType = new MediaTypeHeaderValue("image/png") } }, "files", $"gorra-{tag}.png" },
            { new ByteArrayContent(Zip(($"buzo-{tag}-2.jpg", TestImages.Jpeg), ("nadie.png", TestImages.Png))), "files", "fotos.zip" },
        };
        var images = await merchant.Client.SendAsync(WithTenant(merchant, HttpMethod.Post, "/api/v1/products/images/import", form));
        Assert.Equal(HttpStatusCode.Accepted, images.StatusCode);
        var imagesJob = await PollAsync(merchant, $"/api/v1/products/images/import/{(await images.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("jobId")}");
        Assert.Equal(2, imagesJob.GetProperty("matchedProducts").GetInt32());
        Assert.Equal(1, imagesJob.GetProperty("unmatchedFiles").GetInt32());

        // Exportar devuelve lo mismo que se cargó.
        var export = await merchant.ExpectOkAsync(HttpMethod.Get, "/api/v1/products/export");
        var text = await export.Content.ReadAsStringAsync();
        Assert.Contains($"BUZ-M-{tag}", text);
        Assert.Contains("Indumentaria > Buzos", text);

        // Errores del endpoint.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/products/import", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/products/import/{Guid.NewGuid()}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/products/images/import/{Guid.NewGuid()}")).StatusCode);
        using var noImages = new MultipartFormDataContent { { new StringContent("hola"), "files", "leeme.txt" } };
        Assert.Equal(HttpStatusCode.BadRequest,
            (await merchant.Client.SendAsync(WithTenant(merchant, HttpMethod.Post, "/api/v1/products/images/import", noImages))).StatusCode);
    }

    [Fact]
    public async Task Importar_con_filas_con_problemas_no_frena_el_resto()
    {
        var merchant = await Merchant.CreateAsync(_factory, "ime");
        var tag = merchant.Subdomain;
        // Ya cargado: una fila sin identificador con el mismo nombre es el mismo producto.
        await merchant.CreateProductAsync($"Taza {tag}", sku: $"TAZ-{tag}");

        // Imágenes: una que el servidor de origen rechaza, otra que corta la conexión.
        _factory.ExternalHttp.On(HttpMethod.Get, "https://203.0.113.20/caida.png",
            (_, _) => new HttpResponseMessage(HttpStatusCode.InternalServerError));
        _factory.ExternalHttp.On(HttpMethod.Get, "https://203.0.113.20/corta.png",
            (_, _) => throw new HttpRequestException("conexión cortada"));

        static string Row(params string[] cells) => string.Join(";", cells);
        var csv = string.Join("\n",
            Row("Identificador de URL", "Nombre", "Nombre de propiedad 1", "Valor de propiedad 1", "Precio", "Stock", "SKU", "Imágenes"),
            // Sin identificador: se reconoce por el nombre y, sin "actualizar", se saltea.
            Row("", $"Taza {tag}", "", "", "5000", "2", "", ""),
            Row($"vaso-{tag}", "Vaso", "", "", "3000", "4", $"VAS-{tag}", "https://203.0.113.20/caida.png"),
            // Sin nombre: el producto no se puede crear; queda como error de la fila.
            Row($"sin-nombre-{tag}", "", "", "", "5000", "1", $"SN-{tag}", ""),
            // Dos variantes con el mismo SKU: la segunda falla, la primera queda.
            Row($"remera-{tag}", "Remera", "Talle", "S", "8000", "3", $"REM-{tag}", "https://203.0.113.20/corta.png"),
            Row($"remera-{tag}", "", "Talle", "M", "8000", "3", $"REM-{tag}", ""));

        var job = await ImportAsync(merchant, csv, updateExisting: false);
        Assert.Equal("completed", job.GetProperty("status").GetString());
        Assert.Equal(2, job.GetProperty("created").GetInt32());
        Assert.Equal(1, job.GetProperty("skipped").GetInt32());
        var errors = job.GetProperty("errors").EnumerateArray().Select(e => e.GetProperty("message").GetString()!).ToList();
        Assert.Contains(errors, e => e.Contains($"REM-{tag}", StringComparison.Ordinal));
        Assert.Contains(errors, e => e.Contains("Name", StringComparison.Ordinal));

        // Si la imagen no se pudo bajar, se conserva la URL original en vez de perderla.
        var vaso = await merchant.GetAsync($"/api/v1/products/by-slug/vaso-{tag}");
        Assert.Equal("https://203.0.113.20/caida.png", vaso.GetProperty("images")[0].GetProperty("url").GetString());

        var remera = await merchant.GetAsync($"/api/v1/products/by-slug/remera-{tag}");
        Assert.Equal(1, remera.GetProperty("variants").GetArrayLength());
        Assert.Equal("https://203.0.113.20/corta.png", remera.GetProperty("images")[0].GetProperty("url").GetString());
    }

    [Fact]
    public async Task Importar_imagenes_con_un_csv_de_mapeo_y_por_SKU()
    {
        var merchant = await Merchant.CreateAsync(_factory, "imm");
        var tag = merchant.Subdomain;
        var (mate, _) = await merchant.CreateProductAsync($"Mate {tag}", sku: $"MATE-{tag}");
        var mateSlug = (await merchant.GetAsync($"/api/v1/products/{mate}")).GetProperty("slug").GetString()!;
        await merchant.CreateProductAsync($"Bombilla {tag}", sku: $"BOMB-{tag}");

        // Con mapeo: identificador → archivos (en orden), lo que no existe queda sin asociar.
        var mapping = $"Identificador de URL;Archivos\n{mateSlug};frente.png | perfil.webp | falta.png\notro-{tag};x.png\n";
        using var withMapping = new MultipartFormDataContent
        {
            { new ByteArrayContent(Encoding.UTF8.GetBytes(mapping)), "files", "mapeo.csv" },
            { new ByteArrayContent(TestImages.Png) { Headers = { ContentType = new MediaTypeHeaderValue("image/png") } }, "files", "frente.png" },
            { new ByteArrayContent(TestImages.Png) { Headers = { ContentType = new MediaTypeHeaderValue("image/webp") } }, "files", "perfil.webp" },
        };
        var res = await merchant.Client.SendAsync(WithTenant(merchant, HttpMethod.Post, "/api/v1/products/images/import", withMapping));
        Assert.Equal(HttpStatusCode.Accepted, res.StatusCode);
        var job = await PollAsync(merchant, $"/api/v1/products/images/import/{(await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("jobId")}");
        Assert.Equal(1, job.GetProperty("matchedProducts").GetInt32());
        Assert.Contains(job.GetProperty("unmatchedSample").EnumerateArray(), f => f.GetString() == "falta.png");

        // Un mapeo sin las columnas esperadas no asocia nada (y no rompe).
        using var badMapping = new MultipartFormDataContent
        {
            { new ByteArrayContent(Encoding.UTF8.GetBytes("Producto;Fotos\nmate;frente.png\n")), "files", "mapeo.csv" },
            { new ByteArrayContent(TestImages.Png) { Headers = { ContentType = new MediaTypeHeaderValue("image/png") } }, "files", "frente.png" },
        };
        var bad = await merchant.Client.SendAsync(WithTenant(merchant, HttpMethod.Post, "/api/v1/products/images/import", badMapping));
        var badJob = await PollAsync(merchant, $"/api/v1/products/images/import/{(await bad.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("jobId")}");
        Assert.Equal(0, badJob.GetProperty("matchedProducts").GetInt32());

        // Sin mapeo, un archivo con el nombre del SKU va a ese producto.
        using var bySku = new MultipartFormDataContent
        {
            { new ByteArrayContent(TestImages.Png) { Headers = { ContentType = new MediaTypeHeaderValue("image/png") } }, "files", $"BOMB-{tag}.png" },
        };
        var sku = await merchant.Client.SendAsync(WithTenant(merchant, HttpMethod.Post, "/api/v1/products/images/import", bySku));
        var skuJob = await PollAsync(merchant, $"/api/v1/products/images/import/{(await sku.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("jobId")}");
        Assert.Equal(1, skuJob.GetProperty("matchedProducts").GetInt32());
    }

    // ---------------------------------------------------------------- helpers

    private static HttpRequestMessage WithTenant(Merchant merchant, HttpMethod method, string path, HttpContent content)
    {
        var req = new HttpRequestMessage(method, path) { Content = content };
        req.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        return req;
    }

    private static async Task<HttpResponseMessage> UploadRawAsync(Merchant merchant, byte[] bytes, string contentType, string fileName)
    {
        using var form = new MultipartFormDataContent
        {
            { new ByteArrayContent(bytes) { Headers = { ContentType = new MediaTypeHeaderValue(contentType) } }, "file", fileName },
        };
        return await merchant.Client.SendAsync(WithTenant(merchant, HttpMethod.Post, "/api/v1/media", form));
    }

    private static async Task<string> UploadAsync(Merchant merchant, byte[] bytes, string contentType, string fileName)
    {
        var res = await UploadRawAsync(merchant, bytes, contentType, fileName);
        Assert.True(res.IsSuccessStatusCode, await res.Content.ReadAsStringAsync());
        return (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;
    }

    private static async Task<JsonElement> ImportAsync(Merchant merchant, string csv, bool updateExisting)
    {
        using var form = new MultipartFormDataContent
        {
            { new ByteArrayContent(Encoding.UTF8.GetBytes(csv)), "file", "productos.csv" },
            { new StringContent(updateExisting ? "true" : "false"), "updateExisting" },
            { new StringContent("true"), "updateStock" },
        };
        var res = await merchant.Client.SendAsync(WithTenant(merchant, HttpMethod.Post, "/api/v1/products/import", form));
        Assert.Equal(HttpStatusCode.Accepted, res.StatusCode);
        var jobId = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("jobId").GetGuid();
        return await PollAsync(merchant, $"/api/v1/products/import/{jobId}");
    }

    /// <summary>Los workers de importación corren en segundo plano: se espera a que terminen.</summary>
    private static async Task<JsonElement> PollAsync(Merchant merchant, string path)
    {
        for (var i = 0; i < 100; i++)
        {
            var job = await merchant.GetAsync(path);
            if (job.GetProperty("status").GetString() is "completed" or "failed") return job;
            await Task.Delay(100);
        }
        throw new TimeoutException($"{path} no terminó.");
    }

    private static byte[] Zip(params (string Name, byte[] Bytes)[] entries)
    {
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, bytes) in entries)
            {
                using var stream = zip.CreateEntry(name).Open();
                stream.Write(bytes);
            }
        }
        return ms.ToArray();
    }
}
