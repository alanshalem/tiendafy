using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Api.Auth;
using Microsoft.AspNetCore.DataProtection;
using SharedKernel.Common;

namespace Api.Notifications;

/// <summary>Card de producto embebida en una campaña (snapshot al seleccionarlo).</summary>
public sealed record CampaignProduct(Guid Id, string Name, long PriceMinor, string Currency, string? Image, string Slug);

/// <summary>Token de tracking de apertura/click: identifica campaña + destinatario.</summary>
public static class TrackToken
{
    // Sin vencimiento, y el purpose no se toca: ver SignedToken.
    private static readonly SignedToken<TrackPayload> Token = new("Tiendafy.Marketing.Track.v1");

    public static string Protect(IDataProtectionProvider dp, Guid campaignId, string email) =>
        Token.Protect(dp, new TrackPayload(campaignId, email.Trim().ToLowerInvariant()));

    public static TrackPayload? Unprotect(IDataProtectionProvider dp, string token) =>
        Token.Unprotect(dp, token, p => p.CampaignId != Guid.Empty);
}

public sealed record TrackPayload(Guid CampaignId, string Email);

/// <summary>
/// Composición del HTML de una campaña: cuerpo + cards de productos +
/// reescritura de links para tracking de clicks + pixel de apertura +
/// footer de baja. El orden importa: los links se reescriben ANTES de
/// agregar la baja y el pixel (esos no se trackean).
/// </summary>
public static partial class CampaignEmailComposer
{
    internal static readonly JsonSerializerOptions Json = ApiJson.Web;

    [GeneratedRegex(@"href\s*=\s*""(https?://[^""]+)""", RegexOptions.IgnoreCase)]
    private static partial Regex HrefRegex();

    public static IReadOnlyList<CampaignProduct> ParseProducts(string? productsJson)
    {
        if (string.IsNullOrWhiteSpace(productsJson)) return [];
        try
        {
            return JsonSerializer.Deserialize<List<CampaignProduct>>(productsJson, Json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    /// <summary>Cuerpo completo para UN destinatario, con tracking y baja personalizados.</summary>
    public static string ComposeForRecipient(
        string bodyHtml, IReadOnlyList<CampaignProduct> products, string storeBaseUrl,
        string trackClickBaseUrl, string openPixelUrl, string unsubscribeUrl)
    {
        var body = bodyHtml + ProductCards(products, storeBaseUrl);
        body = RewriteLinks(body, trackClickBaseUrl);
        return body + UnsubscribeFooter(unsubscribeUrl)
            + $"""<img src="{openPixelUrl}" width="1" height="1" alt="" style="display:block;border:0" />""";
    }

    /// <summary>Cuerpo para la vista previa del admin (sin tracking, con baja de ejemplo).</summary>
    public static string ComposeForPreview(string bodyHtml, IReadOnlyList<CampaignProduct> products, string storeBaseUrl) =>
        bodyHtml + ProductCards(products, storeBaseUrl) + UnsubscribeFooter("#");

    /// <summary>
    /// Reescribe cada href http(s) hacia el redirect de tracking, con el
    /// destino original como parámetro. Visible para tests.
    /// </summary>
    public static string RewriteLinks(string html, string trackClickBaseUrl) =>
        HrefRegex().Replace(html, m =>
            $"href=\"{trackClickBaseUrl}&u={Uri.EscapeDataString(m.Groups[1].Value)}\"");

    private static string ProductCards(IReadOnlyList<CampaignProduct> products, string storeBaseUrl)
    {
        if (products.Count == 0) return string.Empty;
        var cards = string.Join("", products.Select(p =>
        {
            var name = WebUtility.HtmlEncode(p.Name);
            var url = $"{storeBaseUrl}/productos/{Uri.EscapeDataString(p.Slug)}";
            var price = ArgentineNumbers.Number(p.PriceMinor / 100m);
            var image = string.IsNullOrEmpty(p.Image)
                ? ""
                : $"""<img src="{WebUtility.HtmlEncode(p.Image)}" alt="{name}" width="120" style="display:block;width:120px;height:120px;object-fit:cover;border-radius:8px" />""";
            return $"""
                <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f1">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
                    <td width="132" valign="top">{image}</td>
                    <td valign="top" style="font-family:-apple-system,Segoe UI,Roboto,sans-serif">
                      <div style="font-size:15px;font-weight:600;color:#18181b">{name}</div>
                      <div style="font-size:15px;color:#18181b;margin-top:4px">$ {price}</div>
                      <a href="{url}" style="display:inline-block;margin-top:8px;font-size:13px;color:#2563eb;text-decoration:underline">Ver producto</a>
                    </td>
                  </tr></table>
                </td></tr>
                """;
        }));
        return $"""
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px">
              {cards}
            </table>
            """;
    }

    private static string UnsubscribeFooter(string url) => $"""
        <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;text-align:center">
          Recibís este email porque compraste o te registraste en esta tienda.
          <a href="{url}" style="color:#a1a1aa;text-decoration:underline">Dejar de recibir novedades</a>
        </p>
        """;
}
