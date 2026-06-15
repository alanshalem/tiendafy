using System.Text;
using System.Text.RegularExpressions;
using SharedKernel.Common;

namespace Content.Infrastructure;

/// <summary>Página institucional de una tienda (sobre nosotros, términos, etc.).</summary>
public sealed partial class Page
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Title { get; private set; } = null!;
    public string Slug { get; private set; } = null!;
    public string Body { get; private set; } = "";
    public bool Published { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private Page() { } // EF Core

    public static Result<Page> Create(Guid tenantId, string? title, string? slug, string? body, bool published)
    {
        var check = Validate(title);
        if (check.IsFailure) return Result.Failure<Page>(check.Error);

        var finalSlug = Slugify(string.IsNullOrWhiteSpace(slug) ? title! : slug);
        if (finalSlug.Length == 0)
            return Result.Failure<Page>(Error.Validation("Page.InvalidSlug", "La URL de la página no es válida."));

        var now = DateTime.UtcNow;
        return new Page
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Title = title!.Trim(),
            Slug = finalSlug,
            Body = body?.Trim() ?? "",
            Published = published,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };
    }

    public Result Update(string? title, string? slug, string? body, bool published)
    {
        var check = Validate(title);
        if (check.IsFailure) return check;

        var finalSlug = Slugify(string.IsNullOrWhiteSpace(slug) ? title! : slug);
        if (finalSlug.Length == 0)
            return Result.Failure(Error.Validation("Page.InvalidSlug", "La URL de la página no es válida."));

        Title = title!.Trim();
        Slug = finalSlug;
        Body = body?.Trim() ?? "";
        Published = published;
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    private static Result Validate(string? title)
    {
        var t = title?.Trim() ?? string.Empty;
        return t.Length is < 1 or > 120
            ? Result.Failure(Error.Validation("Page.InvalidTitle", "El título debe tener entre 1 y 120 caracteres."))
            : Result.Success();
    }

    /// <summary>Texto → slug url-safe (minúsculas, sin acentos, guiones).</summary>
    public static string Slugify(string text)
    {
        var lowered = text.Trim().ToLowerInvariant();
        var decomposed = lowered.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
            if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) != System.Globalization.UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        var noAccents = sb.ToString().Normalize(NormalizationForm.FormC);
        var hyphenated = NonSlug().Replace(noAccents, "-").Trim('-');
        return hyphenated.Length > 120 ? hyphenated[..120].Trim('-') : hyphenated;
    }

    [GeneratedRegex(@"[^a-z0-9]+")]
    private static partial Regex NonSlug();
}
