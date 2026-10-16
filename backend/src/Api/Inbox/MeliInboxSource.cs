using System.Text.Json;
using System.Text.RegularExpressions;
using Api.Meli;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SharedKernel.Common;

namespace Api.Inbox;

/// <summary>La publicación de una pregunta: lo que hace falta para contestarla sin abrir ML.</summary>
public sealed record MeliListing(
    string Id, string? Title, string? Thumbnail, decimal? Price, int? AvailableQuantity, string? Permalink);

public sealed record MeliInboxQuestion(
    long Id, string Text, string Status, string? ItemId, DateTime CreatedAtUtc,
    string? AnswerText, DateTime? AnsweredAtUtc, MeliListing? Listing)
{
    public bool Unanswered => string.Equals(Status, "UNANSWERED", StringComparison.OrdinalIgnoreCase);
}

/// <summary>Un pack de ML con mensajes del comprador sin leer.</summary>
public sealed record MeliUnreadPack(long PackId, int Count);

/// <summary>Lo que dijo Mercado Libre en una pasada (o por qué no dijo nada).</summary>
public sealed record MeliInboxSnapshot(
    bool Connected, bool Demo,
    IReadOnlyList<MeliInboxQuestion> Questions,
    IReadOnlyList<MeliUnreadPack> UnreadPacks,
    string? Error)
{
    public static readonly MeliInboxSnapshot NotConnected = new(false, false, [], [], null);
}

/// <summary>
/// Preguntas y mensajes sin leer de Mercado Libre para la bandeja unificada.
///
/// <para>
/// ML no guarda nada localmente (las pantallas del canal consultan la API en
/// cada request), y la bandeja se refresca sola cada pocos segundos en cada
/// panel abierto, además del contador del menú. Sin un cache corto eso son
/// tres llamadas a ML por minuto por persona; con 45 s por tienda, una.
/// Responder o abrir un hilo lo invalida, para que el cambio se vea enseguida.
/// </para>
///
/// <para>
/// Las preguntas traen la publicación (título, foto, precio y stock): contestar
/// "¿hay en rojo?" sin ver de qué publicación hablan obligaba a abrir ML en
/// otra pestaña, que es justo lo que la bandeja viene a evitar.
/// </para>
/// </summary>
public sealed partial class MeliInboxSource(
    MeliDbContext db,
    MeliTokenService tokens,
    MeliClient client,
    IMemoryCache cache,
    ILogger<MeliInboxSource> logger)
{
    private static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(45);
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    /// <summary>Cuántas preguntas se miran (las más nuevas; ML pagina de a 50).</summary>
    private const int QuestionWindow = 50;

    private static string Key(Guid tenantId) => $"inbox:meli:{tenantId:N}";

    public async Task<MeliInboxSnapshot> GetAsync(Guid tenantId, CancellationToken ct)
    {
        if (cache.TryGetValue(Key(tenantId), out MeliInboxSnapshot? cached) && cached is not null) return cached;
        var snapshot = await LoadAsync(tenantId, ct);
        cache.Set(Key(tenantId), snapshot, CacheFor);
        return snapshot;
    }

    /// <summary>Después de responder o leer: la próxima pasada vuelve a preguntarle a ML.</summary>
    public void Invalidate(Guid tenantId) => cache.Remove(Key(tenantId));

    private async Task<MeliInboxSnapshot> LoadAsync(Guid tenantId, CancellationToken ct)
    {
        var connection = await db.Connections.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
        if (connection is null) return MeliInboxSnapshot.NotConnected;
        if (connection.IsDemo) return await DemoAsync(tenantId, ct);

        var token = await tokens.GetValidTokenAsync(tenantId, ct);
        if (token is null)
            return new MeliInboxSnapshot(true, false, [], [], "No se pudo renovar el acceso a Mercado Libre.");

        try
        {
            using var doc = await client.GetAsync(token,
                $"/questions/search?seller_id={connection.MeliUserId}&api_version=4&sort_fields=date_created&sort_types=DESC&limit={QuestionWindow}", ct);
            var questions = ParseQuestions(doc.RootElement, snakeCase: true);
            var listings = await ListingsAsync(token, questions.Select(q => q.ItemId), ct);
            questions = [.. questions.Select(q => q with { Listing = q.ItemId is { } id ? listings.GetValueOrDefault(id) : null })];

            var packs = await UnreadPacksAsync(token, ct);
            return new MeliInboxSnapshot(true, false, questions, packs, null);
        }
        catch (MeliException ex)
        {
            logger.LogWarning("Bandeja: Mercado Libre no respondió para el tenant {TenantId}: {Message}", tenantId, ex.Message);
            return new MeliInboxSnapshot(true, false, [], [], "Mercado Libre no respondió: se reintenta solo.");
        }
    }

    /// <summary>
    /// La cuenta de demostración contesta con el ejemplo fijo de
    /// <see cref="MeliDemoFeed"/> (la misma forma que el endpoint real) y
    /// toma como chats las dos ventas más nuevas del cache local.
    /// </summary>
    private async Task<MeliInboxSnapshot> DemoAsync(Guid tenantId, CancellationToken ct)
    {
        var payload = JsonSerializer.SerializeToElement(MeliDemoFeed.Questions(), Web);
        var questions = payload.TryGetProperty("questions", out var qs)
            ? ParseQuestions(qs, snakeCase: false)
            : [];
        var listings = MeliDemoFeed.Items.ToDictionary(
            i => i.Id,
            i => new MeliListing(i.Id, i.Title, null, i.Price, i.Quantity, $"https://articulo.mercadolibre.com.ar/{i.Id}"));
        questions = [.. questions.Select(q => q with { Listing = q.ItemId is { } id ? listings.GetValueOrDefault(id) : null })];

        var packs = await db.Orders.AsNoTracking()
            .Where(o => o.TenantId == tenantId)
            .OrderByDescending(o => o.DateCreatedUtc)
            .Take(2)
            .Select(o => o.PackId ?? o.MeliOrderId)
            .ToListAsync(ct);
        return new MeliInboxSnapshot(true, true, questions, [.. packs.Select(p => new MeliUnreadPack(p, 1))], null);
    }

    /// <summary>
    /// Preguntas de la API (<c>item_id</c>, <c>date_created</c>) o del ejemplo
    /// de demo, que tiene la forma que ya le devuelve el endpoint al panel
    /// (<c>itemId</c>, <c>dateCreated</c>).
    /// </summary>
    private static List<MeliInboxQuestion> ParseQuestions(JsonElement root, bool snakeCase)
    {
        var array = root.ValueKind == JsonValueKind.Array
            ? root
            : root.TryGetProperty("questions", out var qs) && qs.ValueKind == JsonValueKind.Array ? qs : default;
        if (array.ValueKind != JsonValueKind.Array) return [];

        var item = snakeCase ? "item_id" : "itemId";
        var created = snakeCase ? "date_created" : "dateCreated";
        return [.. array.EnumerateArray().Select(q =>
        {
            var answer = q.TryGetProperty("answer", out var a) && a.ValueKind == JsonValueKind.Object ? a : default;
            return new MeliInboxQuestion(
                JsonRead.GetLongFlexible(q, "id"),
                JsonRead.GetString(q, "text") ?? string.Empty,
                JsonRead.GetString(q, "status") ?? "UNANSWERED",
                JsonRead.GetString(q, item),
                JsonRead.GetDate(q, created) ?? DateTime.UtcNow,
                answer.ValueKind == JsonValueKind.Object ? JsonRead.GetString(answer, "text") : null,
                answer.ValueKind == JsonValueKind.Object ? JsonRead.GetDate(answer, created) : null,
                null);
        }).Where(q => q.Id != 0)];
    }

    /// <summary>Las publicaciones de las preguntas, de a 20 (el tope del multiget de ML).</summary>
    private async Task<Dictionary<string, MeliListing>> ListingsAsync(
        string token, IEnumerable<string?> itemIds, CancellationToken ct)
    {
        var ids = itemIds.OfType<string>().Where(i => i.Length > 0).Distinct().ToList();
        var result = new Dictionary<string, MeliListing>(StringComparer.Ordinal);
        foreach (var chunk in ids.Chunk(20))
        {
            try
            {
                using var doc = await client.GetAsync(token,
                    $"/items?ids={string.Join(',', chunk.Select(Uri.EscapeDataString))}&attributes=id,title,thumbnail,price,available_quantity,permalink", ct);
                if (doc.RootElement.ValueKind != JsonValueKind.Array) continue;
                foreach (var entry in doc.RootElement.EnumerateArray())
                {
                    if (!entry.TryGetProperty("body", out var body) || body.ValueKind != JsonValueKind.Object) continue;
                    var id = JsonRead.GetString(body, "id");
                    if (id is null) continue;
                    result[id] = new MeliListing(
                        id,
                        JsonRead.GetString(body, "title"),
                        Api.Endpoints.MeliItemSummary.SecureThumbnail(JsonRead.GetString(body, "thumbnail")),
                        body.TryGetProperty("price", out var p) && p.ValueKind == JsonValueKind.Number ? p.GetDecimal() : null,
                        body.TryGetProperty("available_quantity", out var q) && q.ValueKind == JsonValueKind.Number ? q.GetInt32() : null,
                        JsonRead.GetString(body, "permalink"));
                }
            }
            catch (MeliException ex)
            {
                // Sin la publicación la pregunta igual se puede contestar: no se pierde la lista por esto.
                logger.LogInformation("Bandeja: no se pudieron leer publicaciones de ML: {Message}", ex.Message);
            }
        }
        return result;
    }

    private async Task<List<MeliUnreadPack>> UnreadPacksAsync(string token, CancellationToken ct)
    {
        try
        {
            using var doc = await client.GetAsync(token, "/messages/unread?role=seller&tag=post_sale", ct);
            if (!doc.RootElement.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Array)
                return [];
            return [.. results.EnumerateArray()
                .Select(r => (Match: PackInResource().Match(JsonRead.GetString(r, "resource") ?? ""), Count: JsonRead.GetInt32(r, "count")))
                .Where(x => x.Match.Success && long.TryParse(x.Match.Groups[1].Value, out _))
                .Select(x => new MeliUnreadPack(long.Parse(x.Match.Groups[1].Value), Math.Max(1, x.Count)))];
        }
        catch (MeliException ex)
        {
            // Las preguntas se muestran igual aunque la mensajería no conteste.
            logger.LogInformation("Bandeja: ML no devolvió los mensajes sin leer: {Message}", ex.Message);
            return [];
        }
    }

    [GeneratedRegex(@"/packs/(\d+)")]
    private static partial Regex PackInResource();
}
