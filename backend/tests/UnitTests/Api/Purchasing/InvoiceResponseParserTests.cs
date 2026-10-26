using Api.Purchasing;

namespace UnitTests.Api.Purchasing;

/// <summary>
/// El parseo de lo que devuelve la IA al leer una factura.
///
/// Es la frontera con algo que no controlamos: la respuesta puede venir envuelta
/// en un bloque de código, con los números como texto, con campos de más o
/// directamente rota. Nada de eso puede terminar en una excepción ni —peor— en
/// un importe inventado que entre al libro de IVA.
/// </summary>
public sealed class InvoiceResponseParserTests
{
    private static ScannedInvoice? Parse(string raw) => InvoiceResponseParser.Parse(raw);

    private const string FullInvoice = """
        {
          "supplierName": "Importadora del Sur SRL",
          "supplierTaxId": "30-71234567-8",
          "invoiceType": "a",
          "invoiceNumber": "0001-00001234",
          "invoiceDate": "2026-08-14",
          "currency": "ARS",
          "netAmount": 1000000.50,
          "vatAmount": 210000.11,
          "totalAmount": 1210000.61,
          "lines": [
            { "description": "Mancuerna 10kg", "quantity": 20, "unitPrice": 25000 }
          ],
          "confidence": "alta",
          "warnings": []
        }
        """;

    [Fact]
    public void Lee_otros_importes_y_codigo_de_linea()
    {
        var parsed = Parse("""
            { "otherAmount": 3000, "lines": [{ "description": "Remera", "code": " REM-001 ", "quantity": 1, "unitPrice": 10 }], "currency": "ARS" }
            """);

        Assert.Equal(3000m, parsed!.OtherAmount);
        Assert.Equal("REM-001", parsed.Lines[0].Code);
    }

    [Fact]
    public void Codigo_vacio_es_null()
    {
        var parsed = Parse("""{ "lines": [{ "description": "Remera", "code": "", "quantity": 1 }], "currency": "ARS" }""");

        Assert.Null(parsed!.Lines[0].Code);
    }

    [Fact]
    public void El_camino_estricto_y_el_tolerante_dan_lo_mismo()
    {
        var strict = Parse(FullInvoice)!;
        var tolerant = Parse($"```json\n{FullInvoice}\n```")!;

        Assert.Equal(strict with { Lines = [], Warnings = [], ParseIssues = [] }, tolerant with { Lines = [], Warnings = [], ParseIssues = [] });
        Assert.True(strict.ParseIssues.SequenceEqual(tolerant.ParseIssues));
        Assert.True(strict.Lines.SequenceEqual(tolerant.Lines));
        Assert.True(strict.Warnings.SequenceEqual(tolerant.Warnings));
    }

    [Fact]
    public void Lee_una_factura_A_completa()
    {
        var parsed = Parse("""
            {
              "supplierName": "Importadora del Sur SRL",
              "supplierTaxId": "30-71234567-8",
              "invoiceType": "a",
              "invoiceNumber": "0001-00001234",
              "invoiceDate": "2026-08-14",
              "currency": "ARS",
              "netAmount": 1000000.50,
              "vatAmount": 210000.11,
              "totalAmount": 1210000.61,
              "lines": [
                { "description": "Mancuerna 10kg", "quantity": 20, "unitPrice": 25000 }
              ],
              "confidence": "alta",
              "warnings": []
            }
            """);

        Assert.NotNull(parsed);
        // El CUIT se normaliza a dígitos: entra con guiones y sale como lo pide ARCA.
        Assert.Equal("30712345678", parsed!.SupplierTaxId);
        Assert.Equal("A", parsed.InvoiceType);
        Assert.Equal("0001-00001234", parsed.InvoiceNumber);
        Assert.Equal(new DateTime(2026, 8, 14, 0, 0, 0, DateTimeKind.Utc), parsed.InvoiceDate);
        Assert.Equal(1_000_000.50m, parsed.NetAmount);
        Assert.Equal(210_000.11m, parsed.VatAmount);
        Assert.Single(parsed.Lines);
        Assert.Equal("Mancuerna 10kg", parsed.Lines[0].Description);
        Assert.Equal(20, parsed.Lines[0].Quantity);
    }

    [Fact]
    public void Un_JSON_envuelto_en_un_bloque_de_codigo_igual_se_lee()
    {
        var parsed = Parse("""
            ```json
            { "invoiceNumber": "0002-00000045", "currency": "ARS", "confidence": "media" }
            ```
            """);

        Assert.NotNull(parsed);
        Assert.Equal("0002-00000045", parsed!.InvoiceNumber);
    }

    [Fact]
    public void Los_numeros_como_texto_tambien_se_leen()
    {
        var parsed = Parse("""{ "netAmount": "12345.67", "vatAmount": "2592.59", "currency": "ARS" }""");

        Assert.Equal(12_345.67m, parsed!.NetAmount);
        Assert.Equal(2_592.59m, parsed.VatAmount);
    }

    [Fact]
    public void Lo_que_no_se_pudo_leer_queda_en_null_y_no_en_cero()
    {
        // Una factura B no discrimina IVA. Si eso volviera como 0 en vez de
        // null, el libro de IVA registraría un crédito fiscal de cero pesos
        // como si estuviera verificado, en vez de marcar que falta el dato.
        var parsed = Parse("""
            {
              "invoiceType": "B",
              "netAmount": null,
              "vatAmount": null,
              "totalAmount": 50000,
              "currency": "ARS",
              "confidence": "alta",
              "warnings": ["La factura B no discrimina IVA"]
            }
            """);

        Assert.Null(parsed!.NetAmount);
        Assert.Null(parsed.VatAmount);
        Assert.Equal(50_000m, parsed.TotalAmount);
        Assert.Single(parsed.Warnings);
    }

    [Fact]
    public void Un_CUIT_que_no_tiene_once_digitos_se_descarta()
    {
        // Medio CUIT es peor que ningún CUIT: se guarda y nadie lo vuelve a mirar.
        Assert.Null(Parse("""{ "supplierTaxId": "3071234", "currency": "ARS" }""")!.SupplierTaxId);
        Assert.Null(Parse("""{ "supplierTaxId": "no figura", "currency": "ARS" }""")!.SupplierTaxId);
        Assert.Equal("30712345678", Parse("""{ "supplierTaxId": "30712345678", "currency": "ARS" }""")!.SupplierTaxId);
    }

    [Fact]
    public void Una_respuesta_rota_devuelve_null_en_vez_de_explotar()
    {
        Assert.Null(Parse("No pude leer la factura, está muy borrosa."));
        Assert.Null(Parse("{ esto no es json"));
        Assert.Null(Parse("[1, 2, 3]"));
        Assert.Null(Parse(""));
    }

    [Fact]
    public void Las_lineas_sin_descripcion_se_descartan()
    {
        var parsed = Parse("""
            {
              "currency": "ARS",
              "lines": [
                { "description": "Barra olímpica", "quantity": 2, "unitPrice": 90000 },
                { "description": "", "quantity": 1 },
                { "quantity": 5 },
                "texto suelto"
              ]
            }
            """);

        Assert.Single(parsed!.Lines);
        Assert.Equal("Barra olímpica", parsed.Lines[0].Description);
    }

    [Fact]
    public void Sin_confianza_declarada_se_asume_la_mas_baja()
    {
        // Si el modelo no dijo qué tan seguro está, el panel tiene que pedir que
        // se revise, no dar por buena la lectura.
        Assert.Equal("baja", Parse("""{ "currency": "ARS" }""")!.Confidence);
    }

    [Fact]
    public void Un_elemento_null_en_las_lineas_se_descarta_en_los_dos_caminos()
    {
        var strict = Parse("""{ "lines": [null, { "description": "Remera", "quantity": 1, "unitPrice": 10 }], "currency": "ARS" }""");
        var onlyNull = Parse("""{ "lines": [null], "currency": "ARS" }""");

        Assert.Equal("Remera", Assert.Single(strict!.Lines).Description);
        Assert.Empty(onlyNull!.Lines);
    }

    [Fact]
    public void Un_CUIT_con_largo_distinto_de_once_deja_un_control_visible()
    {
        var parsed = Parse("""{ "supplierTaxId": "3071234", "currency": "ARS" }""")!;

        Assert.Null(parsed.SupplierTaxId);
        var issue = Assert.Single(parsed.ParseIssues);
        Assert.Equal("Invoice.CuitLength", issue.Code);
        Assert.Contains("CUIT con largo inválido", issue.Message);
        Assert.Contains("3071234", issue.Message);
    }

    [Fact]
    public void Sin_CUIT_no_hay_control_de_largo()
    {
        Assert.Empty(Parse("""{ "currency": "ARS" }""")!.ParseIssues);
        Assert.Empty(Parse("""{ "supplierTaxId": "no figura", "currency": "ARS" }""")!.ParseIssues);
        Assert.Empty(Parse("""{ "supplierTaxId": "30-71234567-1", "currency": "ARS" }""")!.ParseIssues);
    }

    [Theory]
    [InlineData("05/10/2026")]
    [InlineData("10/05/2026")]
    [InlineData("2026-10-05T00:00:00")]
    [InlineData("5 de octubre")]
    public void Una_fecha_que_no_es_AAAA_MM_DD_es_null_con_control(string date)
    {
        var parsed = Parse($$"""{ "invoiceDate": "{{date}}", "currency": "ARS" }""")!;

        Assert.Null(parsed.InvoiceDate);
        Assert.Equal("Invoice.DateFormat", Assert.Single(parsed.ParseIssues).Code);
    }

    [Fact]
    public void Una_fecha_AAAA_MM_DD_se_lee_sin_control()
    {
        var parsed = Parse("""{ "invoiceDate": "2026-10-05", "currency": "ARS" }""")!;

        Assert.Equal(new DateTime(2026, 10, 5, 0, 0, 0, DateTimeKind.Utc), parsed.InvoiceDate);
        Assert.Empty(parsed.ParseIssues);
    }
}
