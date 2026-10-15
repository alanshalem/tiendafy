namespace MercadoLibre.Infrastructure;

/// <summary>
/// Respuestas de ejemplo para una conexión de Mercado Libre marcada como demo.
///
/// Cuatro pantallas del canal (preguntas, publicaciones, reclamos y mensajes de
/// posventa) no guardan nada localmente: consultan la API de Mercado Libre en
/// cada request. Con una cuenta que no existe eso termina en un 401 y un cartel
/// de error, así que para mostrar el módulo hace falta contestar sin salir a la
/// red. Estos datos son fijos y sirven solo para eso.
///
/// La forma de cada respuesta es la MISMA que arma el endpoint real: si algún
/// día cambia el contrato con el panel, hay que tocar los dos lados. Es el
/// precio de poder enseñar la pantalla sin una cuenta de vendedor.
/// </summary>
public static class MeliDemoFeed
{
    /// <summary>Publicaciones de ejemplo. El vínculo con el catálogo local NO se inventa acá: sale de la base.</summary>
    public static readonly (string Id, string Title, string Status, decimal Price, int Quantity)[] Items =
    {
        ("MLA1472093551", "Kit Distribución Completo Motos 150cc — Original", "active", 48_900m, 12),
        ("MLA1472093552", "Bomba De Nafta Universal 12V Con Filtro", "active", 27_400m, 34),
        ("MLA1472093553", "Juego De Pastillas De Freno Delanteras", "active", 15_800m, 7),
        ("MLA1472093554", "Cadena De Transmisión 428H X 120 Reforzada", "active", 31_200m, 0),
        ("MLA1472093555", "Espejo Retrovisor Par Universal Rosca 10mm", "paused", 9_900m, 18),
        ("MLA1472093556", "Filtro De Aceite Con Junta — Pack X3", "active", 6_450m, 51),
        ("MLA1472093557", "Kit Cubiertas 90/90-18 + 100/90-18", "closed", 112_000m, 0),
    };

    /// <summary>
    /// Preguntas de ejemplo. Respeta el filtro por estado que manda el panel:
    /// sin eso, la solapa "Sin responder" mostraría también las respondidas.
    /// </summary>
    public static object Questions(string? status = null)
    {
        var all = AllQuestions();
        var filtered = string.IsNullOrWhiteSpace(status)
            ? all
            : all.Where(q => string.Equals(q.Status, status, StringComparison.OrdinalIgnoreCase)).ToArray();

        return new
        {
            total = filtered.Length,
            questions = filtered.Select(q => q.Payload).ToArray(),
        };
    }

    private static (string Status, object Payload)[] AllQuestions() => new[]
    {
        Question(12_884_301_991, "Hola! Sirve para una Rouser 200 NS 2019?", "UNANSWERED", "MLA1472093551", -2, null),
        Question(12_884_301_845, "Hacen envío a Córdoba capital? Cuánto sale?", "UNANSWERED", "MLA1472093552", -6, null),
        Question(12_884_300_120, "Tenés factura A?", "ANSWERED", "MLA1472093556",
            -28, "Sí, emitimos factura A. Escribinos el CUIT después de comprar y te la mandamos."),
        Question(12_884_299_004, "Es original o alternativo?", "ANSWERED", "MLA1472093551",
            -50, "Es original, viene con el sello del fabricante en la caja."),
    };

    private static (string Status, object Payload) Question(
        long id, string text, string status, string itemId, int hoursAgo, string? answer) => (status, new
        {
            id,
            text,
            status,
            itemId,
            item = DemoItem(itemId),
            dateCreated = Ago(hoursAgo),
            answer = answer is null ? null : new { text = answer, dateCreated = Ago(hoursAgo + 3) },
        });

    /// <summary>La ficha de la publicación de una pregunta, con la forma de MeliItemSummary.</summary>
    private static object? DemoItem(string itemId)
    {
        var match = Items.FirstOrDefault(i => i.Id == itemId);
        return match.Id is null
            ? null
            : new
            {
                id = match.Id,
                title = match.Title,
                thumbnail = (string?)null,
                price = match.Price,
                currencyId = "ARS",
                availableQuantity = match.Quantity,
                permalink = $"https://articulo.mercadolibre.com.ar/{match.Id[..3]}-{match.Id[3..]}",
                status = match.Status,
            };
    }

    public static object Claims(int skip = 0, int take = int.MaxValue)
    {
        var all = new object[]
        {
            new
            {
                id = "5001238877",
                status = "opened",
                stage = "claim",
                reasonId = "PDD_PRODUCT_NOT_RECEIVED",
                resourceId = "2000009812345678",
                dateCreated = Ago(-30),
            },
            new
            {
                id = "5001235410",
                status = "closed",
                stage = "dispute",
                reasonId = "PNR_DIFFERENT_PRODUCT",
                resourceId = "2000009811223344",
                dateCreated = Ago(-240),
            },
        };
        return new { claims = all.Skip(skip).Take(take).ToArray(), total = all.Length };
    }

    /// <summary>Conversación de posventa de ejemplo, la misma para cualquier pack.</summary>
    public static object Messages() => new
    {
        messages = new object[]
        {
            new { text = "Buenas! Ya salió el envío?", dateCreated = Ago(-26), fromSeller = false },
            new
            {
                text = "Hola! Sí, despachado esta mañana. El seguimiento ya figura en tu compra.",
                dateCreated = Ago(-25),
                fromSeller = true,
            },
            new { text = "Genial, gracias!", dateCreated = Ago(-24), fromSeller = false },
        },
    };

    /// <summary>
    /// Publicaciones + el vínculo real con el catálogo, que sí vive en la base:
    /// así "stock unificado" se ve funcionando de verdad sobre datos de ejemplo.
    /// </summary>
    public static object ItemsWithLinks(IReadOnlyList<MeliItemLink> links, int skip = 0, int take = int.MaxValue) => new
    {
        total = Items.Length,
        items = Items.Skip(skip).Take(take).Select(i =>
        {
            var link = links.FirstOrDefault(l => l.MeliItemId == i.Id);
            return (object)new
            {
                id = i.Id,
                title = i.Title,
                status = i.Status,
                permalink = $"https://articulo.mercadolibre.com.ar/{i.Id}",
                thumbnail = (string?)null,
                price = i.Price,
                availableQuantity = i.Quantity,
                link = link is null ? null : MeliItemLinkDto.From(link),
            };
        }).ToArray(),
    };

    private static string Ago(int hours) =>
        DateTime.UtcNow.AddHours(hours).ToString("yyyy-MM-ddTHH:mm:ss.fffzzz");
}
