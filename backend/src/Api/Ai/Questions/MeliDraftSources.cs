using System.Net;
using System.Text.Json;
using Api.Meli;
using Catalog.Infrastructure.Persistence;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Api.Ai.Questions;

/// <summary>
/// Arma el <see cref="DraftSubject"/> de una consulta de Mercado Libre leyéndola en el servidor: el navegador
/// solo manda el id, así lo que ve el modelo y lo que leen las herramientas lo fija la consulta real. Todo es
/// lectura: no marca nada como leído ni escribe en ML. Nada de lo que arma lleva datos del comprador
/// (<c>from</c> de la pregunta trae nombre, teléfono y mail: no se lee).
/// </summary>
public sealed class MeliDraftSources(MeliDbContext db, MeliTokenService tokens, MeliClient client, CatalogDbContext catalog)
{
    /// <summary>Lo único que se le pide a ML de la publicación (selector <c>attributes</c> de <c>GET /items/{id}</c>).</summary>
    public const string ItemFields = "id,title,price,currency_id,available_quantity,status,attributes";

    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    /// <summary>Una pregunta de preventa sin responder, del vendedor de esta tienda.</summary>
    public async Task<Result<DraftSubject>> QuestionAsync(long questionId, CancellationToken ct)
    {
        var connection = await db.Connections.AsNoTracking().FirstOrDefaultAsync(ct);
        if (connection is null) return Result.Failure<DraftSubject>(QuestionDraftErrors.MeliNotConnected);
        if (connection.IsDemo) return await DemoQuestionAsync(questionId, ct);

        try
        {
            var token = await tokens.GetValidTokenAsync(connection.TenantId, ct);
            if (token is null) return Result.Failure<DraftSubject>(QuestionDraftErrors.MeliNotConnected);

            string text, itemId;
            using (var question = await client.GetAsync(token, $"/questions/{questionId}?api_version=4", ct))
            {
                var q = question.RootElement;
                // Una pregunta de otro vendedor es, para esta tienda, una pregunta que no existe.
                if (JsonRead.GetLongFlexible(q, "seller_id") != connection.MeliUserId)
                    return Result.Failure<DraftSubject>(QuestionDraftErrors.NotFound);
                if (!IsUnanswered(JsonRead.GetString(q, "status")))
                    return Result.Failure<DraftSubject>(QuestionDraftErrors.AlreadyAnswered);
                itemId = JsonRead.GetString(q, "item_id") ?? "";
                text = JsonRead.GetString(q, "text") ?? "";
            }
            if (itemId.Length == 0) return Result.Failure<DraftSubject>(QuestionDraftErrors.NotFound);

            using var item = await client.GetAsync(token,
                $"/items/{Uri.EscapeDataString(itemId)}?attributes={ItemFields}", ct);
            var listing = Listing.From(item.RootElement);
            return await SubjectAsync(text, itemId, listing, ct);
        }
        catch (MeliException ex) when (ex.Status == HttpStatusCode.NotFound)
        {
            return Result.Failure<DraftSubject>(QuestionDraftErrors.NotFound);
        }
        catch (MeliException)
        {
            return Result.Failure<DraftSubject>(QuestionDraftErrors.MeliUnavailable);
        }
    }

    /// <summary>
    /// La cuenta de demostración contesta con el ejemplo fijo de <see cref="MeliDemoFeed"/>, sin salir a la red;
    /// las specs del producto vinculado sí salen de la base, como en una cuenta real.
    /// </summary>
    private async Task<Result<DraftSubject>> DemoQuestionAsync(long questionId, CancellationToken ct)
    {
        var payload = JsonSerializer.SerializeToElement(MeliDemoFeed.Questions(), Web);
        var question = payload.GetProperty("questions").EnumerateArray()
            .FirstOrDefault(q => JsonRead.GetLongFlexible(q, "id") == questionId);
        if (question.ValueKind != JsonValueKind.Object) return Result.Failure<DraftSubject>(QuestionDraftErrors.NotFound);
        if (!IsUnanswered(JsonRead.GetString(question, "status")))
            return Result.Failure<DraftSubject>(QuestionDraftErrors.AlreadyAnswered);

        var itemId = JsonRead.GetString(question, "itemId") ?? "";
        var demo = MeliDemoFeed.Items.FirstOrDefault(i => i.Id == itemId);
        if (demo.Id is null) return Result.Failure<DraftSubject>(QuestionDraftErrors.NotFound);

        var listing = new Listing(demo.Title, demo.Price, "ARS", demo.Quantity, demo.Status, []);
        return await SubjectAsync(JsonRead.GetString(question, "text") ?? "", itemId, listing, ct);
    }

    private static bool IsUnanswered(string? status) =>
        string.Equals(status, "UNANSWERED", StringComparison.OrdinalIgnoreCase);

    private async Task<Result<DraftSubject>> SubjectAsync(string text, string itemId, Listing listing, CancellationToken ct)
    {
        var specs = await ProductSpecsAsync(itemId, ct);
        var stockAndPrice = StockAndPriceText(listing);
        var techSheet = TechSheetText(specs, listing.Attributes);

        // El precio de la publicación: un monto distinto en el borrador es un aviso. Envío y cuotas no se
        // traen (ML los calcula por comprador), así que no hay más montos conocidos.
        IReadOnlyCollection<long> known = listing.Price is { } price
            ? [Money.FromDecimal(price, listing.Currency ?? Money.DefaultCurrency).AmountInMinorUnits]
            : [];

        // Los lectores devuelven lo ya traído: ninguno vuelve a ML ni recibe un id del modelo.
        var readers = new DraftReaders(
            StockAndPrice: _ => Task.FromResult(stockAndPrice),
            TechSheet: _ => Task.FromResult(techSheet));
        return new DraftSubject(
            DraftChannel.MeliQuestion,
            [new ThreadLine(FromSeller: false, text)],
            $"Publicación: {listing.Title ?? "(sin título)"}",
            known,
            readers);
    }

    /// <summary>Specs visibles del producto vinculado a la publicación (nombre, valor y unidad), si hay vínculo.</summary>
    private async Task<IReadOnlyList<string>> ProductSpecsAsync(string itemId, CancellationToken ct)
    {
        var productId = await db.ItemLinks.AsNoTracking()
            .Where(l => l.MeliItemId == itemId)
            .Select(l => (Guid?)l.ProductId)
            .FirstOrDefaultAsync(ct);
        if (productId is null) return [];

        var values = await catalog.Products.AsNoTracking()
            .Where(p => p.Id == productId)
            .SelectMany(p => p.Specs)
            .Select(s => new { s.DefinitionId, s.Value })
            .ToListAsync(ct);
        if (values.Count == 0) return [];

        var ids = values.Select(v => v.DefinitionId).ToList();
        var definitions = await catalog.SpecDefinitions.AsNoTracking()
            .Where(d => d.ShowOnProduct && ids.Contains(d.Id))
            .OrderBy(d => d.SortOrder).ThenBy(d => d.Name)
            .Select(d => new { d.Id, d.Name, d.Unit })
            .ToListAsync(ct);
        return [.. definitions.Select(d =>
        {
            var value = values.First(v => v.DefinitionId == d.Id).Value;
            return string.IsNullOrWhiteSpace(d.Unit) ? $"{d.Name}: {value}" : $"{d.Name}: {value} {d.Unit}";
        })];
    }

    private static string StockAndPriceText(Listing listing)
    {
        var parts = new List<string>();
        if (listing.Price is { } price)
        {
            var amount = ArgentineNumbers.Number(price, price % 1 == 0 ? 0 : 2);
            parts.Add(listing.Currency is null or Money.DefaultCurrency ? $"Precio: $ {amount}." : $"Precio: {listing.Currency} {amount}.");
        }
        else
        {
            parts.Add("Precio: no figura en la publicación.");
        }
        parts.Add(listing.Available is { } available ? $"Disponibles: {available}." : "Disponibles: no figura.");
        parts.Add($"Estado de la publicación: {StatusText(listing.Status)}.");
        return string.Join(" ", parts);
    }

    private static string TechSheetText(IReadOnlyList<string> specs, IReadOnlyList<string> attributes)
    {
        var lines = specs.Concat(attributes).ToList();
        return lines.Count == 0 ? "La publicación no tiene ficha técnica cargada." : string.Join("\n", lines);
    }

    private static string StatusText(string? status) => status switch
    {
        "active" => "activa",
        "paused" => "pausada",
        "closed" => "finalizada",
        "under_review" => "en revisión",
        "inactive" => "inactiva",
        null or "" => "desconocido",
        _ => status,
    };

    /// <summary>Lo que se usa de la publicación. <c>Attributes</c>: "nombre: valor" de los atributos de ML con valor.</summary>
    private sealed record Listing(string? Title, decimal? Price, string? Currency, int? Available, string? Status, IReadOnlyList<string> Attributes)
    {
        public static Listing From(JsonElement item) => new(
            JsonRead.GetString(item, "title"),
            item.TryGetProperty("price", out var p) && p.ValueKind == JsonValueKind.Number ? p.GetDecimal() : null,
            JsonRead.GetString(item, "currency_id"),
            item.TryGetProperty("available_quantity", out var q) && q.ValueKind == JsonValueKind.Number ? q.GetInt32() : null,
            JsonRead.GetString(item, "status"),
            item.TryGetProperty("attributes", out var attrs) && attrs.ValueKind == JsonValueKind.Array
                ? [.. attrs.EnumerateArray()
                    .Select(a => (Name: JsonRead.GetString(a, "name")?.Trim(), Value: JsonRead.GetString(a, "value_name")?.Trim()))
                    .Where(a => !string.IsNullOrEmpty(a.Name) && !string.IsNullOrEmpty(a.Value))
                    .Select(a => $"{a.Name}: {a.Value}")]
                : []);
    }
}
