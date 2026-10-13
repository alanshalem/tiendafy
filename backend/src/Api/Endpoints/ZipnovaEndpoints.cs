using Api.Auth;
using Api.Shipping;
using Catalog.Contracts;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Carriers;
using Identity.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Orders.Core.Domain;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Integración con Zipnova (API v2): configuración por tienda, cotización en
/// vivo para el checkout, creación de envíos con etiqueta PDF y tracking.
/// Credenciales cifradas, nunca devueltas. Reglas duras del proveedor
/// (confirmadas por soporte jul-2026): sin idempotencia en creación (guard
/// local vía zipnova_shipments), dimensiones en CM en todos los endpoints,
/// y pruebas sólo con la modalidad "testing" habilitada sobre la cuenta.
/// </summary>
public static class ZipnovaEndpoints
{
    public static RouteGroupBuilder MapZipnovaEndpoints(this RouteGroupBuilder group)
    {
        // ------------------------------------------------ Admin: configuración
        var admin = group.MapGroup("/admin/shipping/zipnova").RequirePermission(Permission.ShippingConfig);

        admin.MapGet("/", async (ITenantContext tenant, IZipnovaRepository repo, CancellationToken ct) =>
        {
            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            return Results.Ok(ConfigDto(config));
        });

        admin.MapPut("/", async (
            ZipnovaConfigRequest req, ITenantContext tenant, IZipnovaRepository repo,
            ShippingSecretProtector protector, CancellationToken ct) =>
        {
            var existing = await repo.GetConfigAsync(tenant.TenantId.Value, ct);

            var tokenEnc = !string.IsNullOrWhiteSpace(req.ApiToken)
                ? protector.Protect(req.ApiToken.Trim())
                : existing?.ApiTokenEncrypted ?? string.Empty;
            var secretEnc = !string.IsNullOrWhiteSpace(req.ApiSecret)
                ? protector.Protect(req.ApiSecret)
                : existing?.ApiSecretEncrypted ?? string.Empty;
            if (tokenEnc.Length == 0 || secretEnc.Length == 0)
                return Error.Validation("Zipnova.MissingCredentials",
                    "Cargá el API Token y el API Secret (panel de Zipnova → Configuración → Integraciones).").ToProblem();

            Result result;
            if (existing is null)
            {
                var created = ZipnovaConfig.Create(
                    tenant.TenantId.Value, tokenEnc, secretEnc,
                    req.Country ?? "AR", req.AccountId ?? 0, req.OriginId,
                    req.DefaultWeightGrams ?? 500, req.DefaultLengthCm ?? 30,
                    req.DefaultWidthCm ?? 20, req.DefaultHeightCm ?? 10, req.Active ?? true);
                if (created.IsFailure) return created.Error.ToProblem();
                await repo.AddConfigAsync(created.Value, ct);
                result = Result.Success();
            }
            else
            {
                result = existing.Update(
                    tokenEnc, secretEnc, req.Country ?? existing.Country,
                    req.AccountId ?? existing.AccountId, req.OriginId ?? existing.OriginId,
                    req.DefaultWeightGrams ?? existing.DefaultWeightGrams,
                    req.DefaultLengthCm ?? existing.DefaultLengthCm,
                    req.DefaultWidthCm ?? existing.DefaultWidthCm,
                    req.DefaultHeightCm ?? existing.DefaultHeightCm,
                    req.Active ?? existing.Active);
            }
            if (result.IsFailure) return result.Error.ToProblem();

            await repo.SaveChangesAsync(ct);
            var saved = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            return Results.Ok(ConfigDto(saved));
        });

        admin.MapDelete("/", async (ITenantContext tenant, IZipnovaRepository repo, CancellationToken ct) =>
        {
            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            if (config is not null)
            {
                await repo.RemoveConfigAsync(config, ct);
                await repo.SaveChangesAsync(ct);
            }
            return Results.NoContent();
        });

        // Cotización de prueba: valida credenciales y cuenta con una cotización
        // real (leer no crea nada ni consume saldo).
        admin.MapPost("/test", async (
            ZipnovaTestRequest req, ITenantContext tenant, IZipnovaRepository repo,
            ShippingSecretProtector protector, ZipnovaClient client, CancellationToken ct) =>
        {
            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            if (config is null)
                return Error.Validation("Zipnova.NotConfigured", "Primero guardá la configuración.").ToProblem();

            try
            {
                var quote = await client.QuoteAsync(Credentials(config, protector), config,
                    req.City?.Trim() ?? "Rosario", req.State?.Trim() ?? "Santa Fe",
                    NumericZip(req.Zipcode?.Trim() ?? "2000"), [DefaultParcel(config)], declaredValue: 10000m, ct);
                return Results.Ok(new
                {
                    ok = true,
                    options = (quote.AllResults ?? [])
                        .Where(r => r.Selectable)
                        .Select(r => new
                        {
                            carrier = r.Carrier?.Name,
                            service = r.ServiceType?.Name,
                            logisticType = r.LogisticType,
                            price = r.Amounts?.PriceInclTax ?? r.Amounts?.Price ?? 0,
                            estimatedDelivery = r.DeliveryTime?.EstimatedDelivery,
                        }),
                });
            }
            catch (ZipnovaException ex)
            {
                return Error.Validation("Zipnova.TestFailed", ex.Message).ToProblem();
            }
        });

        // --------------------------------------- Público: cotización del checkout
        group.MapPost("/shipping/zipnova/quote", async (
            ZipnovaPublicQuoteRequest req, ITenantContext tenant, IZipnovaRepository repo,
            ShippingSecretProtector protector, ZipnovaClient client, ICatalogCheckoutQuery catalog,
            IDataProtectionProvider dp, CancellationToken ct) =>
        {

            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            if (config is null || !config.Active)
                return Results.Ok(new { available = false, options = Array.Empty<object>() });

            var city = req.City?.Trim();
            var state = req.State?.Trim();
            var zipcode = req.PostalCode is null ? null : NumericZip(req.PostalCode.Trim());
            if (string.IsNullOrEmpty(city) || string.IsNullOrEmpty(state) || string.IsNullOrEmpty(zipcode))
                return Error.Validation("Zipnova.MissingDestination",
                    "Completá ciudad, provincia y código postal para cotizar.").ToProblem();

            // Un paquete por unidad, con el peso y las medidas de su variante.
            var parcels = await CartParcelsBuilder.FromQuoteAsync(catalog, tenant.TenantId.Value,
                req.Items, req.Units, DefaultParcel(config), MaxUnits, ct);
            if (parcels is null)
                return Results.Ok(new
                {
                    available = true,
                    options = Array.Empty<object>(),
                    error = $"El pedido tiene más de {MaxUnits} unidades: coordiná el envío con la tienda.",
                });
            if (parcels.Count == 0)
                return Error.Validation("Zipnova.EmptyCart", "El carrito está vacío.").ToProblem();
            var units = parcels.Count;

            try
            {
                var declared = Math.Max(0, req.DeclaredValue ?? 0);
                var quote = await client.QuoteAsync(Credentials(config, protector), config,
                    city, state, zipcode, parcels.Units, declared, ct);

                var options = (quote.AllResults ?? [])
                    // V1: entrega a domicilio. pickup_point requiere selector de
                    // puntos de retiro en el checkout (backlog declarado).
                    .Where(r => r.Selectable && r.ServiceType?.Code != "pickup_point" && r.Amounts is not null)
                    .OrderBy(r => r.Amounts!.PriceInclTax)
                    .Take(4)
                    .Select(r =>
                    {
                        var money = Money.FromDecimal(r.Amounts!.PriceInclTax, Money.DefaultCurrency);
                        var name = $"Zipnova · {r.Carrier?.Name ?? "envío"} ({r.ServiceType?.Name ?? "Estándar"})";
                        var token = ZipnovaQuoteToken.Protect(dp, new ZipnovaQuotePayload(
                            tenant.TenantId.Value, units, money.AmountInMinorUnits, money.Currency,
                            name, r.DeliveryTime?.EstimatedDelivery, zipcode, parcels.CartKey));
                        return new
                        {
                            token,
                            name,
                            price = ApiJson.MoneyJson(money),
                            estimatedDelivery = r.DeliveryTime?.EstimatedDelivery,
                        };
                    });

                return Results.Ok(new { available = true, options });
            }
            catch (ZipnovaException)
            {
                // El checkout nunca se rompe por el cotizador.
                return Results.Ok(new
                {
                    available = true,
                    options = Array.Empty<object>(),
                    error = "No pudimos cotizar con Zipnova en este momento. Probá de nuevo en unos minutos.",
                });
            }
        }).RequireTenant();

        // ------------------------------- Admin: envío desde una venta + etiqueta
        group.MapPost("/admin/orders/{orderId:guid}/zipnova-shipment", async (
            Guid orderId, ZipnovaShipmentRequest req, ITenantContext tenant,
            IZipnovaRepository repo, IOrderRepository orders, ICatalogCheckoutQuery catalog,
            ShippingSecretProtector protector, ZipnovaClient client, CancellationToken ct) =>
        {
            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            if (config is null)
                return Error.Validation("Zipnova.NotConfigured",
                    "Configurá Zipnova en Medios de envío primero.").ToProblem();

            var order = await orders.GetByIdAsync(tenant.TenantId, orderId, ct);
            if (order is null) return Results.NotFound();

            // GUARD DE IDEMPOTENCIA (crítico): Zipnova no deduplica — un segundo
            // POST crea otro envío real con costo. Si ya hay envío, se devuelve.
            var existing = await repo.GetShipmentByOrderAsync(tenant.TenantId.Value, orderId, ct);
            if (existing is not null)
                return Results.Ok(ShipmentDto(existing, alreadyExisted: true));

            if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Document)
                || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Phone))
                return Error.Validation("Zipnova.MissingRecipient",
                    "Zipnova exige nombre, documento, email y teléfono del destinatario.").ToProblem();
            if (string.IsNullOrWhiteSpace(req.Street) || string.IsNullOrWhiteSpace(req.StreetNumber)
                || string.IsNullOrWhiteSpace(req.City) || string.IsNullOrWhiteSpace(req.State)
                || string.IsNullOrWhiteSpace(req.Zipcode))
                return Error.Validation("Zipnova.MissingAddress",
                    "Completá calle, número, ciudad, provincia y código postal.").ToProblem();

            // external_id: alfanumérico y guiones, máx 30 (validación sólo en
            // prosa de la spec → se garantiza acá). 16 hex de la orden alcanzan.
            var externalId = $"TF-{orderId:N}"[..19];

            // Los paquetes de la venta: uno por unidad vendida, con el peso de su
            // variante (lo mismo que se cotizó). Antes salía un solo paquete con
            // el peso por defecto aunque se hubieran vendido tres cosas. Lo que
            // se indique a mano (cantidad, peso o medidas) manda.
            var manual = req.Units is not null || req.WeightGrams is not null
                || req.HeightCm is not null || req.WidthCm is not null || req.LengthCm is not null;
            var manualUnit = new ParcelUnit(
                req.WeightGrams ?? config.DefaultWeightGrams,
                req.LengthCm ?? config.DefaultLengthCm,
                req.WidthCm ?? config.DefaultWidthCm,
                req.HeightCm ?? config.DefaultHeightCm);
            var parcels = manual
                ? Enumerable.Repeat(manualUnit, Math.Clamp(req.Units ?? 1, 1, MaxUnits)).ToList()
                : (await CartParcelsBuilder.FromLinesAsync(catalog, tenant.TenantId.Value,
                    order.Items.Select(i => (i.VariantId, i.Quantity)), DefaultParcel(config), MaxUnits, ct))?.Units
                  ?? [DefaultParcel(config)];
            // Dimensiones SIEMPRE en CM: la spec pública decía mm para la creación,
            // pero soporte de Zipnova confirmó por escrito (jul-2026) que TODOS los
            // endpoints esperan centímetros. No convertir.
            var packages = parcels.Select(p => new
            {
                weight = Math.Clamp(p.WeightGrams, ZipnovaConfig.MinWeightGrams, ZipnovaConfig.MaxWeightGrams),
                height = Math.Clamp(p.HeightCm, 1, ZipnovaConfig.MaxSideCm),
                width = Math.Clamp(p.WidthCm, 1, ZipnovaConfig.MaxSideCm),
                length = Math.Clamp(p.LengthCm, 1, ZipnovaConfig.MaxSideCm),
                classification_id = "1",
                description_1 = Text.Cap($"Pedido {externalId}", 60),
            }).ToArray();

            var payload = new Dictionary<string, object?>
            {
                ["account_id"] = config.AccountId,
                ["external_id"] = externalId,
                ["service_type"] = string.IsNullOrWhiteSpace(req.ServiceType) ? "standard_delivery" : req.ServiceType.Trim(),
                ["origin_id"] = config.OriginId,
                ["declared_value"] = Math.Max(0, req.DeclaredValue ?? 0),
                ["source"] = "tiendafy",
                ["destination"] = new
                {
                    name = Text.Cap(req.Name.Trim(), 100),
                    document = Text.Cap(req.Document.Trim(), 20),
                    email = Text.Cap(req.Email.Trim(), 150),
                    phone = Text.Cap(req.Phone.Trim(), 40),
                    street = Text.Cap(req.Street.Trim(), 100),
                    street_number = Text.Cap(req.StreetNumber.Trim(), 20),
                    street_extras = string.IsNullOrWhiteSpace(req.StreetExtras) ? null : Text.Cap(req.StreetExtras.Trim(), 120),
                    city = Text.Cap(req.City.Trim(), 80),
                    state = Text.Cap(req.State.Trim(), 80),
                    zipcode = Text.Cap(NumericZip(req.Zipcode.Trim()), 10),
                },
                ["packages"] = packages,
            };

            try
            {
                var created = await client.CreateShipmentAsync(Credentials(config, protector), payload, ct);
                var record = ZipnovaShipment.Create(
                    tenant.TenantId.Value, orderId, created.Id,
                    created.Carrier?.Name, created.CarrierTrackingId,
                    created.TrackingUrl ?? created.TrackingExternalUrl, created.Status);
                await repo.AddShipmentAsync(record, ct);
                await repo.SaveChangesAsync(ct);
                return Results.Ok(ShipmentDto(record, alreadyExisted: false));
            }
            catch (ZipnovaException ex)
            {
                return Error.Validation("Zipnova.CreateFailed", ex.Message).ToProblem();
            }
        }).RequirePermission(Permission.OrdersFulfill);

        // Estado del envío Zipnova de una orden (para pintar el botón correcto).
        group.MapGet("/admin/orders/{orderId:guid}/zipnova-shipment", async (
            Guid orderId, ITenantContext tenant, IZipnovaRepository repo, CancellationToken ct) =>
        {
            var shipment = await repo.GetShipmentByOrderAsync(tenant.TenantId.Value, orderId, ct);
            return shipment is null
                ? Results.Ok(new { exists = false })
                : Results.Ok(ShipmentDto(shipment, alreadyExisted: true));
        }).RequirePermission(Permission.OrdersRead);

        // Etiqueta PDF, proxied (las credenciales nunca tocan el browser).
        group.MapGet("/admin/orders/{orderId:guid}/zipnova-label", async (
            Guid orderId, ITenantContext tenant, IZipnovaRepository repo,
            ShippingSecretProtector protector, ZipnovaClient client, CancellationToken ct) =>
        {
            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            var shipment = await repo.GetShipmentByOrderAsync(tenant.TenantId.Value, orderId, ct);
            if (config is null || shipment is null) return Results.NotFound();
            try
            {
                var pdf = await client.GetLabelPdfAsync(Credentials(config, protector), shipment.ShipmentId, ct);
                return Results.File(pdf, "application/pdf", $"etiqueta-zipnova-{shipment.ShipmentId}.pdf");
            }
            catch (ZipnovaException ex)
            {
                return Error.Validation("Zipnova.LabelFailed", ex.Message).ToProblem();
            }
        }).RequirePermission(Permission.OrdersFulfill);

        // Tracking del envío de una orden.
        group.MapGet("/admin/orders/{orderId:guid}/zipnova-tracking", async (
            Guid orderId, ITenantContext tenant, IZipnovaRepository repo,
            ShippingSecretProtector protector, ZipnovaClient client, CancellationToken ct) =>
        {
            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            var shipment = await repo.GetShipmentByOrderAsync(tenant.TenantId.Value, orderId, ct);
            if (config is null || shipment is null) return Results.NotFound();
            try
            {
                var events = await client.GetTrackingAsync(Credentials(config, protector), shipment.ShipmentId, ct);
                var latest = events.Count > 0 ? events[0] : null;
                if (latest?.Status is not null)
                {
                    shipment.UpdateStatus(latest.Status);
                    await repo.SaveChangesAsync(ct);
                }
                return Results.Ok(new
                {
                    shipmentId = shipment.ShipmentId,
                    events = events.Select(e => new { e.Status, e.StatusName, e.CreatedAt, e.Description }),
                });
            }
            catch (ZipnovaException ex)
            {
                return Error.Validation("Zipnova.TrackingFailed", ex.Message).ToProblem();
            }
        }).RequirePermission(Permission.OrdersRead);

        return group;
    }

    // ---------------------------------------------------------------- Helpers

    /// <summary>Paquetes por envío: más que esto no se cotiza online.</summary>
    private const int MaxUnits = 200;

    /// <summary>El paquete por defecto de la tienda: el de cada unidad cuya variante no tiene peso o medidas.</summary>
    private static ParcelUnit DefaultParcel(ZipnovaConfig config) =>
        new(config.DefaultWeightGrams, config.DefaultLengthCm, config.DefaultWidthCm, config.DefaultHeightCm);

    private static ZipnovaCredentials Credentials(ZipnovaConfig config, ShippingSecretProtector protector) =>
        new(protector.Unprotect(config.ApiTokenEncrypted),
            protector.Unprotect(config.ApiSecretEncrypted),
            config.Country);

    private static object ShipmentDto(ZipnovaShipment s, bool alreadyExisted) => new
    {
        exists = true,
        alreadyExisted,
        shipmentId = s.ShipmentId,
        carrier = s.CarrierName,
        carrierTrackingId = s.CarrierTrackingId,
        trackingUrl = s.TrackingUrl,
        status = s.Status,
        createdAtUtc = s.CreatedAtUtc,
    };

    /// <summary>DTO de config SIN secretos.</summary>
    private static object ConfigDto(ZipnovaConfig? c) => c is null
        ? new { configured = false }
        : (object)new
        {
            configured = true,
            country = c.Country,
            accountId = c.AccountId,
            originId = c.OriginId,
            defaultWeightGrams = c.DefaultWeightGrams,
            defaultLengthCm = c.DefaultLengthCm,
            defaultWidthCm = c.DefaultWidthCm,
            defaultHeightCm = c.DefaultHeightCm,
            active = c.Active,
        };
    /// <summary>
    /// Soporte de Zipnova recomienda mandar SOLO la parte numérica del código
    /// postal (un CPA "C1414BAI" geolocaliza mal): se extraen los dígitos y,
    /// si no hay ninguno, se deja el valor original.
    /// </summary>
    private static string NumericZip(string zipcode)
    {
        var digits = new string([.. zipcode.Where(char.IsDigit)]);
        return digits.Length > 0 ? digits : zipcode;
    }
}

public sealed record ZipnovaConfigRequest(
    string? ApiToken,
    string? ApiSecret,
    string? Country,
    int? AccountId,
    string? OriginId,
    int? DefaultWeightGrams,
    int? DefaultLengthCm,
    int? DefaultWidthCm,
    int? DefaultHeightCm,
    bool? Active);

public sealed record ZipnovaTestRequest(string? City, string? State, string? Zipcode);

/// <summary>`Items`: el detalle del carrito (para el peso de cada variante); `Units` queda por compatibilidad.</summary>
public sealed record ZipnovaPublicQuoteRequest(
    string? PostalCode, string? City, string? State, int? Units, decimal? DeclaredValue,
    List<CartLineInput>? Items = null);

public sealed record ZipnovaShipmentRequest(
    string? Name,
    string? Document,
    string? Email,
    string? Phone,
    string? Street,
    string? StreetNumber,
    string? StreetExtras,
    string? City,
    string? State,
    string? Zipcode,
    string? ServiceType,
    int? Units,
    int? WeightGrams,
    int? LengthCm,
    int? WidthCm,
    int? HeightCm,
    decimal? DeclaredValue);
