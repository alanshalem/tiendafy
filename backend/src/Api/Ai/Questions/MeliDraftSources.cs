using System.Net;
using System.Text.Json;
using Api.Meli;
using Catalog.Infrastructure.Persistence;
using Checkout.Infrastructure.Carriers;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Api.Ai.Questions;

/// <summary>
/// Arma el <see cref="DraftSubject"/> de una consulta o un chat posventa de Mercado Libre leyéndolo en el
/// servidor: el navegador solo manda el id, así lo que ve el modelo y lo que leen las herramientas lo fija la
/// consulta real. Todo es lectura: no marca nada como leído ni escribe en ML. Nada de lo que arma lleva datos
/// del comprador (<c>from</c> de la pregunta trae nombre, teléfono y mail: no se lee; de la venta no entran
/// el nickname ni la dirección).
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

        string text, itemId;
        Listing listing;
        try
        {
            var token = await tokens.GetValidTokenAsync(connection.TenantId, ct);
            if (token is null) return Result.Failure<DraftSubject>(QuestionDraftErrors.MeliNotConnected);

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
            listing = Listing.From(item.RootElement);
        }
        catch (Exception ex) when (IsMeliFailure(ex, ct))
        {
            return Result.Failure<DraftSubject>(Translate(ex));
        }

        return await SubjectAsync(text, itemId, listing, ct);
    }

    /// <summary>
    /// Lo que falla al hablar con ML: su error, una respuesta que no se puede leer, la red o un timeout.
    /// La cancelación del request (cerró la página) no entra y se propaga.
    /// </summary>
    private static bool IsMeliFailure(Exception ex, CancellationToken ct) =>
        ex is MeliException or FormatException || CarrierNoAnswer.Is(ex, ct);

    /// <summary>
    /// 403 y 404: lo que esta cuenta no puede ver es, para esta tienda, algo que no existe. 401: el acceso a la
    /// cuenta ya no vale y hay que volver a conectarla. Cualquier otra cosa: ML no respondió.
    /// </summary>
    private static Error Translate(Exception ex) => ex is MeliException { Status: { } status }
        ? status switch
        {
            HttpStatusCode.NotFound or HttpStatusCode.Forbidden => QuestionDraftErrors.NotFound,
            HttpStatusCode.Unauthorized => QuestionDraftErrors.MeliNotConnected,
            _ => QuestionDraftErrors.MeliUnavailable,
        }
        : QuestionDraftErrors.MeliUnavailable;

    /// <summary>
    /// El chat posventa de una venta de este vendedor. Las ventas salen del cache local y, sin ninguna, no se
    /// sale a ML. Los mensajes se leen con <c>mark_as_read=false</c>: pedir un borrador no marca leído el chat.
    /// </summary>
    public async Task<Result<DraftSubject>> PackAsync(long packId, CancellationToken ct)
    {
        var connection = await db.Connections.AsNoTracking().FirstOrDefaultAsync(ct);
        if (connection is null) return Result.Failure<DraftSubject>(QuestionDraftErrors.MeliNotConnected);

        // Un pack ajeno es, para esta tienda, un pack que no existe: se decide antes de salir a ML.
        var orders = await db.Orders.AsNoTracking()
            .Where(o => o.PackId == packId || o.MeliOrderId == packId)
            .OrderBy(o => o.DateCreatedUtc).ThenBy(o => o.MeliOrderId)
            .ToListAsync(ct);
        if (orders.Count == 0) return Result.Failure<DraftSubject>(QuestionDraftErrors.NotFound);

        string? token = null;
        IReadOnlyList<ThreadLine> thread;
        if (connection.IsDemo)
        {
            thread = DemoThread();
        }
        else
        {
            try
            {
                token = await tokens.GetValidTokenAsync(connection.TenantId, ct);
                if (token is null) return Result.Failure<DraftSubject>(QuestionDraftErrors.MeliNotConnected);
                thread = await ThreadAsync(token, packId, connection.MeliUserId, ct);
            }
            catch (Exception ex) when (IsMeliFailure(ex, ct))
            {
                return Result.Failure<DraftSubject>(Translate(ex));
            }
        }

        var statusText = OrderTexts.OrderStatus(orders);
        // Un pack comparte envío; si hubiera más de uno, se leen unos pocos.
        var shipmentIds = orders.Where(o => o.ShipmentId is > 0).Select(o => o.ShipmentId!.Value)
            .Distinct().Take(MaxShipments).ToList();
        var readers = new DraftReaders(
            OrderStatus: _ => Task.FromResult(statusText),
            Tracking: token is null || shipmentIds.Count == 0
                ? _ => Task.FromResult(new TrackingInfo(OrderTexts.NoShipment, false))
                : readerCt => ShipmentsAsync(token, shipmentIds, readerCt));

        var titles = orders.SelectMany(o => MeliSyncService.ParseSnapshot(o.ItemsJson))
            .Select(i => OrderTexts.Title(i.Title)).Distinct().ToList();
        var context = titles.Count == 0
            ? "Venta de Mercado Libre"
            : $"Venta de Mercado Libre. Productos: {string.Join("; ", titles)}.";
        return new DraftSubject(DraftChannel.MeliMessage, thread, context, KnownAmounts(orders), readers);
    }

    private const int MaxShipments = 3;

    private static readonly Dictionary<string, string> NewShipmentFormat = new() { ["x-format-new"] = "true" };

    /// <summary>
    /// Total, pagado, devuelto y precios unitarios en centavos. El costo del envío no se guarda en el cache
    /// local, así que no es un monto conocido.
    /// </summary>
    private static HashSet<long> KnownAmounts(List<MeliOrder> orders)
    {
        var amounts = new HashSet<long>();
        void Add(decimal amount, string currency)
        {
            if (amount > 0) amounts.Add(Money.FromDecimal(amount, currency).AmountInMinorUnits);
        }

        foreach (var order in orders)
        {
            Add(order.TotalAmount, order.CurrencyId);
            Add(order.PaidAmount, order.CurrencyId);
            Add(order.RefundedAmount, order.CurrencyId);
            foreach (var item in MeliSyncService.ParseSnapshot(order.ItemsJson)) Add(item.UnitPrice, order.CurrencyId);
        }
        // Un pack de varias compras: lo que se cobró en total también puede nombrarse.
        if (orders.Count > 1 && orders.Select(o => o.CurrencyId).Distinct().Count() == 1)
        {
            Add(orders.Sum(o => o.TotalAmount), orders[0].CurrencyId);
            Add(orders.Sum(o => o.PaidAmount), orders[0].CurrencyId);
        }
        return amounts;
    }

    /// <summary>
    /// Lee el seguimiento de cada envío. Acá NO se traducen los errores: si ML falla, el lector lanza y
    /// <see cref="QuestionTools"/> lo convierte en un texto neutro para el modelo y lo registra.
    /// </summary>
    private async Task<TrackingInfo> ShipmentsAsync(string token, IReadOnlyList<long> shipmentIds, CancellationToken ct)
    {
        var infos = new List<TrackingInfo>();
        foreach (var shipmentId in shipmentIds)
        {
            // El formato nuevo del recurso es obligatorio (documentación de ML, "Gestionar envíos").
            using var shipment = await client.GetAsync(token, $"/shipments/{shipmentId}", ct, NewShipmentFormat);
            infos.Add(OrderTexts.Tracking(shipment.RootElement));
        }
        // Con varios envíos, los que traen fecha estimada van primero.
        var ordered = infos.OrderByDescending(i => i.HasDeliveryEstimate).ToList();
        return new TrackingInfo(string.Join("\n\n", ordered.Select(i => i.Text)), ordered.Any(i => i.HasDeliveryEstimate));
    }

    /// <summary>Los mensajes de la conversación, del más viejo al más nuevo, sin marcarlos como leídos.</summary>
    private async Task<IReadOnlyList<ThreadLine>> ThreadAsync(string token, long packId, long sellerId, CancellationToken ct)
    {
        var path = $"/messages/packs/{packId}/sellers/{sellerId}?tag=post_sale&mark_as_read=false";
        var messages = new List<PackMessage>();
        long total;
        using (var page = await client.GetAsync(token, path, ct))
        {
            total = page.RootElement.TryGetProperty("paging", out var paging) && paging.ValueKind == JsonValueKind.Object
                ? JsonRead.GetLong(paging, "total")
                : 0;
            messages.AddRange(ParseMessages(page.RootElement, sellerId));
        }

        // ML pagina de a pocos mensajes: si hay más, la cola de la conversación está en la última página.
        if (messages.Count > 0 && total > messages.Count)
        {
            using var tail = await client.GetAsync(token, $"{path}&offset={total - messages.Count}", ct);
            messages.AddRange(ParseMessages(tail.RootElement, sellerId));
        }

        return [.. InOrder(messages
            .GroupBy(m => m.Id ?? Guid.NewGuid().ToString("N")).Select(g => g.First()))
            .Select(m => m.Line)];
    }

    /// <summary>
    /// Del más viejo al más nuevo por fecha. Uno sin fecha (o con una ilegible) hereda la del que llegó antes y
    /// el orden es estable: conserva su lugar relativo en vez de irse al principio y quedar fuera del recorte
    /// de los últimos mensajes.
    /// </summary>
    private static IEnumerable<PackMessage> InOrder(IEnumerable<PackMessage> messages)
    {
        var last = DateTime.MinValue;
        return messages
            .Select(m =>
            {
                if (m.CreatedUtc is { } created) last = created;
                return (Key: last, Message: m);
            })
            .ToList()
            .OrderBy(x => x.Key)
            .Select(x => x.Message);
    }

    private static IEnumerable<PackMessage> ParseMessages(JsonElement root, long sellerId)
    {
        if (!root.TryGetProperty("messages", out var list) || list.ValueKind != JsonValueKind.Array) yield break;
        foreach (var m in list.EnumerateArray())
        {
            var text = JsonRead.GetString(m, "text");
            if (string.IsNullOrWhiteSpace(text)) continue;
            var fromSeller = m.TryGetProperty("from", out var from) && from.ValueKind == JsonValueKind.Object
                && JsonRead.GetLongFlexible(from, "user_id") == sellerId;
            var created = m.TryGetProperty("message_date", out var dates) && dates.ValueKind == JsonValueKind.Object
                ? JsonRead.GetDate(dates, "created")
                : null;
            yield return new PackMessage(JsonRead.GetString(m, "id"), created, new ThreadLine(fromSeller, text));
        }
    }

    /// <summary>La conversación de ejemplo de <see cref="MeliDemoFeed"/>: la misma para cualquier pack.</summary>
    private static IReadOnlyList<ThreadLine> DemoThread()
    {
        var payload = JsonSerializer.SerializeToElement(MeliDemoFeed.Messages(), Web);
        return [.. payload.GetProperty("messages").EnumerateArray().Select(m => new ThreadLine(
            m.TryGetProperty("fromSeller", out var f) && f.ValueKind == JsonValueKind.True,
            JsonRead.GetString(m, "text") ?? ""))];
    }

    private sealed record PackMessage(string? Id, DateTime? CreatedUtc, ThreadLine Line);

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
            // Una publicación con variaciones tiene un vínculo por variación: siempre el mismo, el más viejo.
            .OrderBy(l => l.CreatedAtUtc).ThenBy(l => l.Id)
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
            parts.Add($"Precio: {OrderTexts.MoneyText(price, listing.Currency)}.");
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
            item.TryGetProperty("price", out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetDecimal(out var price) ? price : null,
            JsonRead.GetString(item, "currency_id"),
            item.TryGetProperty("available_quantity", out var q) && q.ValueKind == JsonValueKind.Number && q.TryGetInt32(out var available) ? available : null,
            JsonRead.GetString(item, "status"),
            item.TryGetProperty("attributes", out var attrs) && attrs.ValueKind == JsonValueKind.Array
                ? [.. attrs.EnumerateArray()
                    .Select(a => (Name: JsonRead.GetString(a, "name")?.Trim(), Value: JsonRead.GetString(a, "value_name")?.Trim()))
                    .Where(a => !string.IsNullOrEmpty(a.Name) && !string.IsNullOrEmpty(a.Value))
                    .Select(a => $"{a.Name}: {a.Value}")]
                : []);
    }
}
