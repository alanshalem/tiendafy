using Api.Auth;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Datos legales de la tienda: quién vende (razón social, CUIT, domicilio,
/// QR de Data Fiscal) y cómo se calcula el "precio sin impuestos nacionales".
/// El comercio los carga en Configuración → Datos legales; la tienda los lee
/// sin sesión para el pie y para la leyenda debajo de cada precio.
/// </summary>
public static class StoreLegalEndpoints
{
    public static RouteGroupBuilder MapStoreLegalEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/store/legal", async (ITenantContext tenant, FiscalDbContext db, CancellationToken ct) =>
        {
            var (info, cfg) = await LoadAsync(db, tenant.TenantId.Value, ct);
            return Results.Ok(PublicDto(info, cfg, tenant.TenantId.Value));
        }).RequireTenant();

        var admin = group.MapGroup("/admin/store-legal").RequirePermission(Permission.StoreConfig);

        admin.MapGet("/", async (ITenantContext tenant, FiscalDbContext db, CancellationToken ct) =>
        {
            var (info, cfg) = await LoadAsync(db, tenant.TenantId.Value, ct);
            return Results.Ok(AdminDto(info, cfg, tenant.TenantId.Value));
        });

        admin.MapPut("/", async (StoreLegalRequest req, ITenantContext tenant, FiscalDbContext db, CancellationToken ct) =>
        {
            string? cuit = null;
            if (!string.IsNullOrWhiteSpace(req.Cuit))
            {
                var parsed = Cuit.Create(req.Cuit);
                if (parsed.IsFailure) return parsed.Error.ToProblem();
                cuit = parsed.Value.Value;
            }
            if (!Enum.TryParse<PriceTaxCondition>((req.Condition ?? "").Replace("_", ""), ignoreCase: true, out var condition)
                || !Enum.IsDefined(condition) || int.TryParse(req.Condition, out _))
                return Error.Validation("Legal.BadCondition", "Elegí la condición frente al IVA.").ToProblem();
            if (req.VatRatePercent is < 0 or > 100 || req.OtherNationalTaxesPercent is < 0 or > 100)
                return Error.Validation("Legal.BadRate", "Los porcentajes van de 0 a 100.").ToProblem();
            if (!IsWebUrl(req.DataFiscalUrl) || !IsWebUrl(req.DataFiscalImageUrl))
                return Error.Validation("Legal.BadUrl", "El link del QR de Data Fiscal tiene que empezar con https://.").ToProblem();

            var info = await db.LegalInfo.FirstOrDefaultAsync(ct);
            if (info is null)
            {
                info = StoreLegalInfo.CreateDefault(tenant.TenantId.Value);
                db.LegalInfo.Add(info);
            }
            info.Update(req.LegalName, cuit, req.Address, condition,
                req.VatRatePercent ?? StoreLegalInfo.DefaultVatRatePercent, req.OtherNationalTaxesPercent ?? 0m,
                req.ShowPriceWithoutTaxes, req.DataFiscalUrl, req.DataFiscalImageUrl);
            await db.SaveChangesAsync(ct);

            var cfg = await db.Configs.AsNoTracking().FirstOrDefaultAsync(ct);
            return Results.Ok(AdminDto(info, cfg, tenant.TenantId.Value));
        });

        return group;
    }

    private static async Task<(StoreLegalInfo? Info, FiscalConfig? Config)> LoadAsync(FiscalDbContext db, Guid tenantId, CancellationToken ct)
    {
        var info = await db.LegalInfo.AsNoTracking().FirstOrDefaultAsync(x => x.TenantId == tenantId, ct);
        var cfg = await db.Configs.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
        return (info, cfg);
    }

    /// <summary>
    /// Lo que se muestra en la tienda. Lo que el comercio no cargó acá se toma
    /// de la facturación (si la configuró): razón social, CUIT y condición son
    /// los mismos, y pedirlos dos veces es la receta para que no coincidan.
    /// Sin nada cargado, la leyenda sale como Responsable Inscripto al 21 %:
    /// es una obligación y es el caso de la tienda que vende lo que importa.
    /// </summary>
    private static object PublicDto(StoreLegalInfo? info, FiscalConfig? cfg, Guid tenantId)
    {
        var effective = Effective(info, cfg, tenantId);
        var cuit = info?.Cuit ?? cfg?.Cuit;
        return new
        {
            legalName = info?.LegalName ?? cfg?.BusinessName,
            cuit = FormatCuit(cuit),
            address = info?.Address,
            dataFiscalUrl = info?.DataFiscalUrl,
            dataFiscalImageUrl = info?.DataFiscalImageUrl,
            priceWithoutTaxes = new
            {
                show = effective.ShowPriceWithoutTaxes,
                condition = ConditionWire(effective.Condition),
                divisor = effective.TaxDivisor,
            },
        };
    }

    private static object AdminDto(StoreLegalInfo? info, FiscalConfig? cfg, Guid tenantId)
    {
        var effective = Effective(info, cfg, tenantId);
        return new
        {
            configured = info is not null,
            legalName = info?.LegalName,
            cuit = info?.Cuit,
            address = info?.Address,
            condition = ConditionWire(effective.Condition),
            vatRatePercent = effective.VatRatePercent,
            otherNationalTaxesPercent = effective.OtherNationalTaxesPercent,
            showPriceWithoutTaxes = effective.ShowPriceWithoutTaxes,
            dataFiscalUrl = info?.DataFiscalUrl,
            dataFiscalImageUrl = info?.DataFiscalImageUrl,
            // Lo que ya sabe la facturación, para sugerirlo en los campos vacíos.
            fromInvoicing = cfg is null ? null : new
            {
                legalName = cfg.BusinessName,
                cuit = cfg.Cuit,
                condition = ConditionWire(ToPriceCondition(cfg.Condition)),
            },
        };
    }

    /// <summary>La fila guardada, o una por defecto que hereda la condición de la facturación.</summary>
    private static StoreLegalInfo Effective(StoreLegalInfo? info, FiscalConfig? cfg, Guid tenantId)
    {
        if (info is not null) return info;
        var fallback = StoreLegalInfo.CreateDefault(tenantId);
        if (cfg is not null)
            fallback.Update(cfg.BusinessName, cfg.Cuit, null, ToPriceCondition(cfg.Condition),
                StoreLegalInfo.DefaultVatRatePercent, 0m, true, null, null);
        return fallback;
    }

    private static PriceTaxCondition ToPriceCondition(FiscalCondition c) =>
        c == FiscalCondition.Monotributo ? PriceTaxCondition.Monotributo : PriceTaxCondition.ResponsableInscripto;

    private static string ConditionWire(PriceTaxCondition c) => c switch
    {
        PriceTaxCondition.Monotributo => "MONOTRIBUTO",
        PriceTaxCondition.Exento => "EXENTO",
        _ => "RESPONSABLE_INSCRIPTO",
    };

    private static string? FormatCuit(string? cuit) =>
        cuit is { Length: 11 } ? $"{cuit[..2]}-{cuit[2..10]}-{cuit[10..]}" : cuit;

    /// <summary>Vacío vale; si hay algo, tiene que ser un link web (nada de "javascript:").</summary>
    private static bool IsWebUrl(string? url) =>
        string.IsNullOrWhiteSpace(url)
        || (Uri.TryCreate(url.Trim(), UriKind.Absolute, out var u) && (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp));
}

/// <summary>Lo que guarda la pantalla de Datos legales. Condition: RESPONSABLE_INSCRIPTO | MONOTRIBUTO | EXENTO.</summary>
public sealed record StoreLegalRequest(
    string? LegalName,
    string? Cuit,
    string? Address,
    string Condition,
    decimal? VatRatePercent,
    decimal? OtherNationalTaxesPercent,
    bool ShowPriceWithoutTaxes,
    string? DataFiscalUrl,
    string? DataFiscalImageUrl);
