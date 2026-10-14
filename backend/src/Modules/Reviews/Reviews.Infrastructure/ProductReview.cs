using SharedKernel.Common;

namespace Reviews.Infrastructure;

public enum ReviewStatus
{
    /// <summary>Esperando que la tienda la mire. No se ve en la tienda.</summary>
    Pending = 0,
    Approved = 1,
    /// <summary>La tienda decidió no mostrarla. Sigue contando para nada.</summary>
    Hidden = 2,
}

/// <summary>
/// La opinión de un comprador sobre un producto que compró.
///
/// <para>
/// Nace SOLO de una línea de una venta despachada (ver ReviewEndpoints): no hay
/// forma de escribir una reseña sin haber comprado, ni de que la tienda
/// invente o edite una. La tienda modera (aprueba, oculta, responde en
/// público), pero el texto y las estrellas son del comprador. Una por línea de
/// venta: comprar dos veces lo mismo da derecho a opinar dos veces, comprar
/// una vez no da derecho a inflar el promedio.
/// </para>
/// </summary>
public sealed class ProductReview
{
    public const int MaxTitle = 120;
    public const int MaxBody = 4000;
    public const int MinBody = 10;
    public const int MaxReply = 2000;
    public const int MaxPhotos = 4;

    /// <summary>
    /// Denuncias de personas distintas que la sacan de la tienda hasta que la
    /// tienda la vuelva a mirar. Con una alcanzaría para que un competidor
    /// borrara las buenas; con tres ya no es un capricho.
    /// </summary>
    public const int ReportsToPullBack = 3;

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid ProductId { get; private set; }
    public Guid VariantId { get; private set; }
    public Guid OrderId { get; private set; }
    public Guid OrderItemId { get; private set; }

    public int Rating { get; private set; }
    public string? Title { get; private set; }
    public string Body { get; private set; } = null!;

    /// <summary>Como se muestra en la tienda: "Ana P." (nunca el apellido entero ni el email).</summary>
    public string AuthorName { get; private set; } = null!;

    /// <summary>Privado: solo lo ve la tienda en el panel, para contactar al comprador.</summary>
    public string BuyerEmail { get; private set; } = null!;

    /// <summary>Snapshots de la venta: el panel lista sin cruzar con el catálogo.</summary>
    public string ProductName { get; private set; } = null!;
    public string? VariantLabel { get; private set; }

    /// <summary>URLs públicas de las fotos (subidas por el flujo de Media).</summary>
    public List<string> Photos { get; private set; } = [];

    public ReviewStatus Status { get; private set; }

    /// <summary>Respuesta pública de la tienda, debajo de la reseña.</summary>
    public string? Reply { get; private set; }
    public DateTime? RepliedAtUtc { get; private set; }

    public int HelpfulCount { get; private set; }
    public int ReportCount { get; private set; }

    /// <summary>Volvió a pendiente por denuncias: el panel la marca para revisar.</summary>
    public bool Flagged { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? ModeratedAtUtc { get; private set; }

    private ProductReview() { } // EF Core

    public static Result<ProductReview> Create(
        Guid tenantId, Guid productId, Guid variantId, Guid orderId, Guid orderItemId,
        int rating, string? title, string? body, string authorName, string buyerEmail,
        string productName, string? variantLabel, IReadOnlyList<string> photos, bool autoApprove)
    {
        if (rating is < 1 or > 5)
            return Result.Failure<ProductReview>(Error.Validation("Review.Rating", "Elegí de 1 a 5 estrellas."));

        var text = body?.Trim() ?? string.Empty;
        if (text.Length < MinBody)
            return Result.Failure<ProductReview>(Error.Validation("Review.Body",
                $"Contanos un poco más: la reseña necesita al menos {MinBody} caracteres."));
        if (text.Length > MaxBody)
            return Result.Failure<ProductReview>(Error.Validation("Review.Body",
                $"La reseña es muy larga: el máximo es {MaxBody} caracteres."));
        if (photos.Count > MaxPhotos)
            return Result.Failure<ProductReview>(Error.Validation("Review.Photos",
                $"Podés sumar hasta {MaxPhotos} fotos."));

        var now = DateTime.UtcNow;
        return new ProductReview
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ProductId = productId,
            VariantId = variantId,
            OrderId = orderId,
            OrderItemId = orderItemId,
            Rating = rating,
            Title = Text.Clip(title, MaxTitle),
            Body = text,
            AuthorName = Text.Cap(authorName, 60),
            BuyerEmail = Text.Cap(buyerEmail.Trim().ToLowerInvariant(), 200),
            ProductName = Text.Cap(productName, 200),
            VariantLabel = Text.Clip(variantLabel, 120),
            Photos = [.. photos],
            Status = autoApprove ? ReviewStatus.Approved : ReviewStatus.Pending,
            CreatedAtUtc = now,
            ModeratedAtUtc = autoApprove ? now : null,
        };
    }

    /// <summary>
    /// Aprobar limpia las denuncias: la tienda ya la miró, y las que lleguen
    /// después cuentan de cero.
    /// </summary>
    public void Approve()
    {
        Status = ReviewStatus.Approved;
        ReportCount = 0;
        Flagged = false;
        ModeratedAtUtc = DateTime.UtcNow;
    }

    public void Hide()
    {
        Status = ReviewStatus.Hidden;
        Flagged = false;
        ModeratedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Respuesta pública de la tienda; vacía la borra.</summary>
    public Result SetReply(string? reply)
    {
        var text = reply?.Trim();
        if (text is { Length: > MaxReply })
            return Result.Failure(Error.Validation("Review.Reply",
                $"La respuesta es muy larga: el máximo es {MaxReply} caracteres."));

        Reply = string.IsNullOrEmpty(text) ? null : text;
        RepliedAtUtc = Reply is null ? null : DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>
    /// Una denuncia más (ya deduplicada por persona). Al llegar al umbral sale
    /// de la tienda y queda pendiente y marcada para que la tienda decida.
    /// </summary>
    public void CountReport()
    {
        ReportCount++;
        if (Status == ReviewStatus.Approved && ReportCount >= ReportsToPullBack)
        {
            Status = ReviewStatus.Pending;
            Flagged = true;
        }
    }

    /// <summary>
    /// "Ana María Pérez" → "Ana P.". Lo que se publica de quien opina: lo
    /// justo para que sea una persona y no un email ni un nombre completo.
    /// </summary>
    public static string DisplayName(string? fullName)
    {
        var parts = (fullName ?? string.Empty)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(p => p.Any(char.IsLetter))
            .ToArray();
        if (parts.Length == 0) return "Comprador";

        var first = Capitalize(parts[0]);
        if (parts.Length == 1) return first;
        var initial = parts[^1].First(char.IsLetter);
        return $"{first} {char.ToUpperInvariant(initial)}.";
    }

    private static string Capitalize(string word)
    {
        var w = Text.Cap(word, 30);
        return char.ToUpperInvariant(w[0]) + w[1..].ToLowerInvariant();
    }
}

/// <summary>
/// Un "me sirvió" o una denuncia, de una persona (huella anónima: hash de IP
/// y navegador). Existe para que cada persona cuente una vez: sin esto, un
/// script subía cualquier reseña al primer lugar o bajaba cualquier otra.
/// </summary>
public sealed class ReviewVote
{
    public const string Helpful = "helpful";
    public const string Report = "report";

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid ReviewId { get; private set; }
    public string Kind { get; private set; } = null!;
    public string Fingerprint { get; private set; } = null!;
    public string? Reason { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private ReviewVote() { } // EF Core

    public static ReviewVote Create(Guid tenantId, Guid reviewId, string kind, string fingerprint, string? reason = null) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        ReviewId = reviewId,
        Kind = kind,
        Fingerprint = fingerprint,
        Reason = Text.Clip(reason, 300),
        CreatedAtUtc = DateTime.UtcNow,
    };
}

/// <summary>
/// Cómo trabaja las reseñas una tienda. Una fila por tienda; sin fila, los
/// valores por defecto de <see cref="Defaults"/>.
/// </summary>
public sealed class ReviewSettings
{
    /// <summary>De fábrica se aprueban solas las de 4 y 5 estrellas.</summary>
    public const int DefaultAutoApproveMinRating = 4;
    public const int DefaultRequestDelayDays = 7;
    public const int MaxRequestDelayDays = 60;

    public Guid TenantId { get; private set; }

    /// <summary>
    /// Desde cuántas estrellas se publican sin pasar por moderación. Null =
    /// la tienda mira todas antes de publicarlas.
    /// </summary>
    public int? AutoApproveMinRating { get; private set; }

    /// <summary>Días después del despacho para pedir la reseña por email.</summary>
    public int RequestDelayDays { get; private set; }

    /// <summary>Si la tienda muestra las reseñas (y las estrellas en las cards).</summary>
    public bool ShowOnStore { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    private ReviewSettings() { } // EF Core

    public static ReviewSettings Defaults(Guid tenantId) => new()
    {
        TenantId = tenantId,
        AutoApproveMinRating = DefaultAutoApproveMinRating,
        RequestDelayDays = DefaultRequestDelayDays,
        ShowOnStore = true,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    public Result Update(int? autoApproveMinRating, int requestDelayDays, bool showOnStore)
    {
        if (autoApproveMinRating is < 1 or > 5)
            return Result.Failure(Error.Validation("ReviewSettings.AutoApprove",
                "La aprobación automática va de 1 a 5 estrellas (o ninguna)."));
        if (requestDelayDays is < 1 or > MaxRequestDelayDays)
            return Result.Failure(Error.Validation("ReviewSettings.Delay",
                $"El pedido de reseña sale entre 1 y {MaxRequestDelayDays} días después del despacho."));

        AutoApproveMinRating = autoApproveMinRating;
        RequestDelayDays = requestDelayDays;
        ShowOnStore = showOnStore;
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    public bool AutoApproves(int rating) => AutoApproveMinRating is { } min && rating >= min;
}

/// <summary>
/// Que a esta venta ya se le pidió la reseña por email. Una fila por venta:
/// es lo que garantiza que el pedido sale una sola vez aunque el worker pase
/// cien veces.
/// </summary>
public sealed class ReviewRequest
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid OrderId { get; private set; }

    /// <summary>"sent" o por qué no salió ("suppressed", "disabled").</summary>
    public string Outcome { get; private set; } = null!;
    public DateTime CreatedAtUtc { get; private set; }

    private ReviewRequest() { } // EF Core

    public static ReviewRequest Create(Guid tenantId, Guid orderId, string outcome) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        OrderId = orderId,
        Outcome = outcome,
        CreatedAtUtc = DateTime.UtcNow,
    };
}
