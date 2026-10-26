using System.Net;
using System.Text.Json;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SharedKernel.Common;

namespace Api.Meli;

/// <summary>La conexión de una tienda lista para leer: la tienda, su site (MLA…) y un token vigente.</summary>
public sealed record MeliReaderConnection(Guid TenantId, string SiteId, string Token);

public sealed record MeliCategoryRef(string Id, string Name);

public sealed record MeliCategorySuggestion(string CategoryId, string CategoryName, string? DomainName);

/// <summary>
/// Lecturas de Mercado Libre para armar fichas: la categoría de una publicación, la predicción de categoría y los
/// atributos de una categoría. Todas pasan por <see cref="MeliTenantGate"/> (de a una por tienda, con espera ante el
/// 429). Corre en el worker, sin tienda en el scope: las consultas a la base filtran por tienda a mano.
///
/// <para>
/// Confirmado en la documentación oficial (developers.mercadolibre.com.ar, 26-oct-2026):
/// </para>
/// <list type="bullet">
/// <item><c>GET /categories/{id}/attributes</c> → lista con <c>id</c>, <c>name</c>, <c>value_type</c>
/// (<c>string</c>, <c>number</c>, <c>number_unit</c>, <c>boolean</c>, <c>list</c>), <c>values[]</c> ({id, name}; en
/// <c>string</c> y <c>number</c> son solo sugeridos), <c>allowed_units[]</c> ({id, name}), <c>default_unit</c>,
/// <c>value_max_length</c> y <c>tags</c> (un objeto de booleanos; en <c>/technical_specs</c> es una lista de textos).
/// Obligatorio: <c>required</c>, <c>new_required</c>, <c>conditional_required</c>. No se cargan: <c>read_only</c>,
/// <c>fixed</c> (ML lo completa), <c>inferred</c>, <c>others</c>; <c>hidden</c> no sale en el flujo del vendedor pero
/// se puede cargar por API (se deja solo si es obligatorio). Un identificador trae <c>"type": "product_identifier"</c>
/// (GTIN, EAN, JAN, MPN…). <c>relevance</c> y <c>hierarchy</c> están documentados en <c>/technical_specs/input</c>, no
/// en este recurso: se leen si vienen y, si no, todo atributo visible cuenta como relevante.</item>
/// <item><c>GET /categories/{id}</c> → <c>name</c> (y <c>path_from_root</c>).</item>
/// <item><c>GET /sites/{site}/domain_discovery/search?q=&amp;limit=3</c> → lista de <c>domain_name</c>, <c>category_id</c>,
/// <c>category_name</c> (<c>limit</c> por defecto 4, máximo 8; la doc recomienda 3).</item>
/// <item>La categoría de una publicación sale del multiget <c>GET /items/bulk?ids=…&amp;attributes=body.category_id</c>
/// (el <c>/items?ids=</c> está obsoleto; ver <c>MeliClient.GetItemsBulkAsync</c>).</item>
/// <item>Un atributo se manda como <c>{ id, value_id }</c> (obligatorio en <c>list</c> y <c>boolean</c>) o
/// <c>{ id, value_name }</c>; un <c>number_unit</c> va como <c>value_name</c> "30 cm" (así lo devuelve ML).</item>
/// </list>
/// </summary>
public sealed class MeliCatalogReader(
    MeliDbContext db, MeliTokenService tokens, MeliClient client, MeliTenantGate gate, IMemoryCache cache)
{
    /// <summary>Las categorías y sus atributos son datos públicos de ML, iguales para todas las tiendas.</summary>
    public static readonly TimeSpan CacheTtl = TimeSpan.FromHours(24);

    private const int MaxSuggestedValues = 100;

    private static readonly HashSet<string> IdentifierIds = new(StringComparer.OrdinalIgnoreCase)
    {
        "GTIN", "EAN", "UPC", "JAN", "MPN", "MODEL", "ALPHANUMERIC_MODEL", "DETAILED_MODEL", "PART_NUMBER", "OEM",
    };

    private static readonly string[] RequiredTags = ["required", "new_required", "conditional_required"];
    private static readonly string[] NotLoadableTags = ["read_only", "fixed", "inferred", "others"];
    private static readonly string[] RelevantTags = ["catalog_required", "catalog_listing_required", "product_pk"];

    /// <summary>Null si la tienda no tiene conexión, es la de demostración o no hay token: no se sale a Mercado Libre.</summary>
    public async Task<MeliReaderConnection?> ConnectAsync(Guid tenantId, CancellationToken ct)
    {
        var connection = await db.Connections.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
        if (connection is null || connection.IsDemo) return null;

        var token = await tokens.GetValidTokenAsync(tenantId, ct);
        return token is null ? null : new MeliReaderConnection(tenantId, connection.SiteId, token);
    }

    /// <summary>Si la tienda tiene una cuenta real conectada (no la de demostración). No renueva el token ni sale a Mercado Libre.</summary>
    public Task<bool> HasRealConnectionAsync(Guid tenantId, CancellationToken ct) =>
        db.Connections.IgnoreQueryFilters().AsNoTracking().AnyAsync(c => c.TenantId == tenantId && !c.IsDemo, ct);

    /// <summary>La categoría de una publicación; null si la publicación ya no existe.</summary>
    public Task<string?> ItemCategoryIdAsync(MeliReaderConnection c, string itemId, CancellationToken ct) =>
        gate.RunAsync<string?>(c.TenantId, async token =>
        {
            try
            {
                var bodies = await client.GetItemsBulkAsync(c.Token, [itemId], token, ["category_id"]);
                return bodies.Count == 0 ? null : JsonRead.GetString(bodies[0], "category_id");
            }
            catch (MeliException ex) when (ex.Status == HttpStatusCode.NotFound)
            {
                return null;
            }
        }, ct);

    public Task<IReadOnlyList<MeliCategorySuggestion>> PredictAsync(MeliReaderConnection c, string title, CancellationToken ct) =>
        gate.RunAsync(c.TenantId, async token =>
        {
            using var doc = await client.GetAsync(c.Token,
                $"/sites/{c.SiteId}/domain_discovery/search?q={Uri.EscapeDataString(title)}&limit=3", token);
            return ParseSuggestions(doc.RootElement);
        }, ct);

    public async Task<MeliCategoryRef?> CategoryAsync(MeliReaderConnection c, string categoryId, CancellationToken ct)
    {
        var key = $"meli:cat:{categoryId.ToUpperInvariant()}";
        if (cache.TryGetValue(key, out MeliCategoryRef? cached)) return cached;

        return await gate.RunAsync(c.TenantId, async token =>
        {
            // Otro ítem de la misma tienda pudo traerla mientras esperaba su turno.
            if (cache.TryGetValue(key, out MeliCategoryRef? again)) return again;
            try
            {
                using var doc = await client.GetAsync(c.Token, $"/categories/{Uri.EscapeDataString(categoryId)}", token);
                var id = JsonRead.GetString(doc.RootElement, "id") ?? categoryId;
                var category = new MeliCategoryRef(id, JsonRead.GetString(doc.RootElement, "name") ?? id);
                cache.Set(key, category, CacheTtl);
                return category;
            }
            catch (MeliException ex) when (ex.Status == HttpStatusCode.NotFound)
            {
                return null;
            }
        }, ct);
    }

    public async Task<IReadOnlyList<MeliCategoryAttribute>> AttributesAsync(MeliReaderConnection c, string categoryId, CancellationToken ct)
    {
        var key = $"meli:cat-attrs:{categoryId.ToUpperInvariant()}";
        if (cache.TryGetValue(key, out IReadOnlyList<MeliCategoryAttribute>? cached) && cached is not null) return cached;

        return await gate.RunAsync(c.TenantId, async token =>
        {
            if (cache.TryGetValue(key, out IReadOnlyList<MeliCategoryAttribute>? again) && again is not null) return again;
            using var doc = await client.GetAsync(c.Token, $"/categories/{Uri.EscapeDataString(categoryId)}/attributes", token);
            var attributes = ParseAttributes(doc.RootElement);
            cache.Set(key, attributes, CacheTtl);
            return attributes;
        }, ct);
    }

    public static IReadOnlyList<MeliCategorySuggestion> ParseSuggestions(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Array) return [];
        var suggestions = new List<MeliCategorySuggestion>();
        foreach (var entry in root.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object) continue;
            var categoryId = JsonRead.GetString(entry, "category_id");
            if (string.IsNullOrWhiteSpace(categoryId)) continue;
            suggestions.Add(new MeliCategorySuggestion(
                categoryId, JsonRead.GetString(entry, "category_name") ?? "", JsonRead.GetString(entry, "domain_name")));
        }
        return suggestions;
    }

    /// <summary>
    /// Los atributos que un vendedor puede cargar en la categoría, en el orden de ML. Quedan afuera los de solo lectura, los
    /// fijos, los inferidos y los ocultos que ML no pide.
    /// </summary>
    public static IReadOnlyList<MeliCategoryAttribute> ParseAttributes(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Array) return [];
        var attributes = new List<MeliCategoryAttribute>();
        foreach (var entry in root.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object) continue;
            var id = JsonRead.GetString(entry, "id");
            if (string.IsNullOrWhiteSpace(id)) continue;

            var tags = ReadTags(entry);
            var required = RequiredTags.Any(tags.Contains);
            if (NotLoadableTags.Any(tags.Contains) || (tags.Contains("hidden") && !required)) continue;

            var kind = JsonRead.GetString(entry, "value_type") switch
            {
                "string" => MeliAttributeKind.Text,
                "number" => MeliAttributeKind.Number,
                "number_unit" => MeliAttributeKind.NumberUnit,
                "list" => MeliAttributeKind.List,
                "boolean" => MeliAttributeKind.Boolean,
                _ => MeliAttributeKind.Other,
            };
            var hierarchy = JsonRead.GetString(entry, "hierarchy");

            // Sin dato de relevancia (el recurso no lo documenta) todo lo visible cuenta; con él, solo lo de máxima prioridad.
            var relevant = !entry.TryGetProperty("relevance", out var relevance) || relevance.ValueKind != JsonValueKind.Number
                || (relevance.TryGetInt32(out var priority) && priority == 1)
                || RelevantTags.Any(tags.Contains)
                || hierarchy is "PARENT_PK" or "CHILD_PK";

            var identifier = JsonRead.GetString(entry, "type") == "product_identifier"
                || hierarchy == "PRODUCT_IDENTIFIER"
                || IdentifierIds.Contains(id);

            var keepAllValues = kind is MeliAttributeKind.List or MeliAttributeKind.Boolean;
            attributes.Add(new MeliCategoryAttribute(
                id,
                JsonRead.GetString(entry, "name") ?? id,
                kind,
                ReadValues(entry, "values", keepAllValues ? int.MaxValue : MaxSuggestedValues),
                [.. ReadValues(entry, "allowed_units", int.MaxValue).Select(u => u.Name)],
                JsonRead.GetString(entry, "default_unit"),
                entry.TryGetProperty("value_max_length", out var max) && max.ValueKind == JsonValueKind.Number ? max.GetInt32() : null,
                required,
                relevant,
                identifier));
        }
        return attributes;
    }

    /// <summary><c>tags</c> es un objeto de booleanos en <c>/attributes</c> y una lista de textos en <c>/technical_specs</c>.</summary>
    private static HashSet<string> ReadTags(JsonElement entry)
    {
        var tags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!entry.TryGetProperty("tags", out var raw)) return tags;

        if (raw.ValueKind == JsonValueKind.Object)
        {
            foreach (var tag in raw.EnumerateObject())
                if (tag.Value.ValueKind == JsonValueKind.True) tags.Add(tag.Name);
        }
        else if (raw.ValueKind == JsonValueKind.Array)
        {
            foreach (var tag in raw.EnumerateArray())
                if (tag.ValueKind == JsonValueKind.String && tag.GetString() is { } text) tags.Add(text);
        }
        return tags;
    }

    private static List<MeliAttributeValue> ReadValues(JsonElement entry, string property, int max)
    {
        var values = new List<MeliAttributeValue>();
        if (!entry.TryGetProperty(property, out var raw) || raw.ValueKind != JsonValueKind.Array) return values;
        foreach (var value in raw.EnumerateArray())
        {
            if (values.Count >= max) break;
            if (value.ValueKind == JsonValueKind.String && value.GetString() is { } text)
                values.Add(new MeliAttributeValue(text, text));
            else if (value.ValueKind == JsonValueKind.Object
                && JsonRead.GetString(value, "name") is { Length: > 0 } name)
                values.Add(new MeliAttributeValue(JsonRead.GetString(value, "id") ?? name, name));
        }
        return values;
    }
}
