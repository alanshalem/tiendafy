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
/// Integración con Correo Argentino (API MiCorreo): configuración por tienda,
/// cotización en vivo para el checkout, sucursales y alta de envíos desde una
/// venta. Los tokens de MiCorreo se guardan cifrados y NUNCA se devuelven.
/// </summary>
public static class CorreoArgentinoEndpoints
{
    public static RouteGroupBuilder MapCorreoArgentinoEndpoints(this RouteGroupBuilder group)
    {
        // ------------------------------------------------ Admin: configuración
        var admin = group.MapGroup("/admin/shipping/correo").RequirePermission(Permission.ShippingConfig);

        admin.MapGet("/", async (ITenantContext tenant, ICorreoArgentinoConfigRepository repo, CancellationToken ct) =>
        {
            var config = await repo.GetAsync(tenant.TenantId.Value, ct);
            return Results.Ok(ConfigDto(config));
        });

        admin.MapPut("/", async (
            CorreoConfigRequest req, ITenantContext tenant, ICorreoArgentinoConfigRepository repo,
            ShippingSecretProtector protector, MiCorreoClient client, ILoggerFactory loggers, CancellationToken ct) =>
        {
            var existing = await repo.GetAsync(tenant.TenantId.Value, ct);

            // Tokens: los nuevos pisan; vacíos = conservar los guardados.
            var userTokenEnc = !string.IsNullOrWhiteSpace(req.UserToken)
                ? protector.Protect(req.UserToken.Trim())
                : existing?.UserTokenEncrypted ?? string.Empty;
            var passwordTokenEnc = !string.IsNullOrWhiteSpace(req.PasswordToken)
                ? protector.Protect(req.PasswordToken.Trim())
                : existing?.PasswordTokenEncrypted ?? string.Empty;
            if (userTokenEnc.Length == 0 || passwordTokenEnc.Length == 0)
                return Error.Validation("Correo.MissingCredentials",
                    "Cargá el userToken y el passwordToken que te dio Correo Argentino.").ToProblem();

            // customerId: directo, o via email+password de MiCorreo (una sola vez,
            // no se guardan), o el ya configurado.
            var customerId = req.CustomerId?.Trim();
            if (string.IsNullOrEmpty(customerId)
                && !string.IsNullOrWhiteSpace(req.MiCorreoEmail)
                && !string.IsNullOrWhiteSpace(req.MiCorreoPassword))
            {
                var creds = new MiCorreoCredentials(
                    protector.Unprotect(userTokenEnc), protector.Unprotect(passwordTokenEnc),
                    req.Environment ?? "TEST");
                try
                {
                    customerId = await client.ValidateUserAsync(creds, req.MiCorreoEmail.Trim(), req.MiCorreoPassword, ct);
                }
                catch (MiCorreoException ex)
                {
                    return Error.Validation("Correo.ValidateFailed", ex.Message).ToProblem();
                }
                catch (Exception ex) when (CarrierNoAnswer.Is(ex, ct))
                {
                    loggers.CreateLogger("CorreoArgentino").LogWarning(ex, "MiCorreo no respondió al validar el usuario.");
                    return Error.Validation("Correo.ValidateFailed", CarrierNoAnswer.Message("Correo Argentino")).ToProblem();
                }
            }
            customerId ??= existing?.CustomerId;
            if (string.IsNullOrEmpty(customerId))
                return Error.Validation("Correo.MissingCustomerId",
                    "Ingresá tu customerId de MiCorreo, o tu email y contraseña de MiCorreo para obtenerlo.").ToProblem();

            Result result;
            if (existing is null)
            {
                var created = CorreoArgentinoConfig.Create(
                    tenant.TenantId.Value, customerId, userTokenEnc, passwordTokenEnc,
                    req.Environment ?? "TEST", req.OriginPostalCode ?? string.Empty,
                    req.DefaultWeightGrams ?? 500, req.DefaultLengthCm ?? 30,
                    req.DefaultWidthCm ?? 20, req.DefaultHeightCm ?? 10,
                    req.OfferHomeDelivery ?? true, req.OfferAgencyDelivery ?? true, req.Active ?? true);
                if (created.IsFailure) return created.Error.ToProblem();
                await repo.AddAsync(created.Value, ct);
                result = Result.Success();
            }
            else
            {
                result = existing.Update(
                    customerId, userTokenEnc, passwordTokenEnc,
                    req.Environment ?? existing.Environment, req.OriginPostalCode ?? existing.OriginPostalCode,
                    req.DefaultWeightGrams ?? existing.DefaultWeightGrams, req.DefaultLengthCm ?? existing.DefaultLengthCm,
                    req.DefaultWidthCm ?? existing.DefaultWidthCm, req.DefaultHeightCm ?? existing.DefaultHeightCm,
                    req.OfferHomeDelivery ?? existing.OfferHomeDelivery,
                    req.OfferAgencyDelivery ?? existing.OfferAgencyDelivery,
                    req.Active ?? existing.Active);
            }
            if (result.IsFailure) return result.Error.ToProblem();

            await repo.SaveChangesAsync(ct);
            var saved = await repo.GetAsync(tenant.TenantId.Value, ct);
            return Results.Ok(ConfigDto(saved));
        });

        admin.MapDelete("/", async (ITenantContext tenant, ICorreoArgentinoConfigRepository repo, CancellationToken ct) =>
        {
            var config = await repo.GetAsync(tenant.TenantId.Value, ct);
            if (config is not null)
            {
                await repo.RemoveAsync(config, ct);
                await repo.SaveChangesAsync(ct);
            }
            return Results.NoContent();
        });

        // Cotización de prueba: valida credenciales + CP de origen con datos reales.
        admin.MapPost("/test", async (
            CorreoTestRequest req, ITenantContext tenant, ICorreoArgentinoConfigRepository repo,
            ShippingSecretProtector protector, MiCorreoClient client, ILoggerFactory loggers, CancellationToken ct) =>
        {
            var config = await repo.GetAsync(tenant.TenantId.Value, ct);
            if (config is null)
                return Error.Validation("Correo.NotConfigured", "Primero guardá la configuración.").ToProblem();

            var destination = CorreoArgentinoConfig.NormalizePostalCode(req.PostalCode) ?? "1425";
            var package = CorreoPackage.Aggregate(1,
                config.DefaultWeightGrams, config.DefaultLengthCm, config.DefaultWidthCm, config.DefaultHeightCm)!;
            try
            {
                var rates = await client.GetRatesAsync(Credentials(config, protector),
                    config.CustomerId, config.OriginPostalCode, destination, package, ct);
                return Results.Ok(new
                {
                    ok = true,
                    destination,
                    rates = (rates.Rates ?? []).Select(r => new
                    {
                        r.DeliveredType,
                        r.ProductName,
                        r.Price,
                        r.DeliveryTimeMin,
                        r.DeliveryTimeMax,
                    }),
                });
            }
            catch (MiCorreoException ex)
            {
                return Error.Validation("Correo.TestFailed", ex.Message).ToProblem();
            }
            catch (Exception ex) when (CarrierNoAnswer.Is(ex, ct))
            {
                loggers.CreateLogger("CorreoArgentino").LogWarning(ex, "MiCorreo no respondió a la cotización de prueba.");
                return Error.Validation("Correo.TestFailed", CarrierNoAnswer.Message("Correo Argentino")).ToProblem();
            }
        });

        // --------------------------------------- Público: cotización del checkout
        // Se cotiza ANTES de crear la sesión (el carrito vive en el browser):
        // el token resultante queda atado al tenant y a la cantidad de unidades,
        // y el submit valida que la sesión real coincida.
        group.MapPost("/shipping/correo/quote", async (
            CorreoQuoteRequest req, ITenantContext tenant, ICorreoArgentinoConfigRepository configs,
            ShippingSecretProtector protector, MiCorreoClient client, ICatalogCheckoutQuery catalog,
            IDataProtectionProvider dp, ILoggerFactory loggers, CancellationToken ct) =>
        {

            var config = await configs.GetAsync(tenant.TenantId.Value, ct);
            if (config is null || !config.Active)
                return Results.Ok(new { available = false, options = Array.Empty<object>() });

            var destination = CorreoArgentinoConfig.NormalizePostalCode(req.PostalCode);
            if (destination is null)
                return Error.Validation("Correo.InvalidPostalCode",
                    "Ingresá un código postal válido de 4 dígitos.").ToProblem();

            // Un paquete por unidad, con el peso y las medidas de su variante.
            var parcels = await CartParcelsBuilder.FromQuoteAsync(catalog, tenant.TenantId.Value,
                req.Items, req.Units, DefaultParcel(config), maxUnits: 999, ct);
            if (parcels is { Count: 0 })
                return Error.Validation("Correo.EmptyCart", "El carrito está vacío.").ToProblem();
            var units = parcels?.Count ?? 0;
            var package = parcels is null ? null : CorreoPackage.Aggregate(parcels.Units);
            if (package is null)
                return Results.Ok(new
                {
                    available = true,
                    options = Array.Empty<object>(),
                    error = "El pedido supera los límites de Correo Argentino (25 kg / 150 cm). Coordiná el envío con la tienda.",
                });

            try
            {
                var response = await client.GetRatesAsync(Credentials(config, protector),
                    config.CustomerId, config.OriginPostalCode, destination, package, ct);

                var options = (response.Rates ?? [])
                    .Where(r => (r.DeliveredType == "D" && config.OfferHomeDelivery)
                        || (r.DeliveredType == "S" && config.OfferAgencyDelivery))
                    .OrderBy(r => r.Price)
                    .Select(r =>
                    {
                        var money = Money.FromDecimal(r.Price, Money.DefaultCurrency);
                        var name = r.DeliveredType == "S"
                            ? $"{r.ProductName} (retiro en sucursal)"
                            : $"{r.ProductName} (a domicilio)";
                        var token = CorreoQuoteToken.Protect(dp, new CorreoQuotePayload(
                            tenant.TenantId.Value, units, r.DeliveredType,
                            money.AmountInMinorUnits, money.Currency, name,
                            r.DeliveryTimeMin, r.DeliveryTimeMax, destination, parcels!.CartKey));
                        return new
                        {
                            token,
                            kind = r.DeliveredType,
                            name,
                            price = ApiJson.MoneyJson(money),
                            etaMin = r.DeliveryTimeMin,
                            etaMax = r.DeliveryTimeMax,
                        };
                    });

                return Results.Ok(new { available = true, options });
            }
            catch (Exception ex) when (ex is MiCorreoException || CarrierNoAnswer.Is(ex, ct))
            {
                // El checkout nunca se rompe por el cotizador: se degrada a los
                // métodos manuales de la tienda. Un error con respuesta ya lo
                // loguea el cliente; un timeout o la red caída, no.
                if (ex is not MiCorreoException)
                    loggers.CreateLogger("CorreoArgentino").LogWarning(ex, "MiCorreo no pudo cotizar.");
                return Results.Ok(new
                {
                    available = true,
                    options = Array.Empty<object>(),
                    error = "No pudimos cotizar con Correo Argentino en este momento. Probá de nuevo en unos minutos.",
                });
            }
        }).RequireTenant();

        // Sucursales que reciben paquetes, por provincia (cacheadas 12 h).
        group.MapGet("/shipping/correo/agencies", async (
            string province, ITenantContext tenant, ICorreoArgentinoConfigRepository configs,
            ShippingSecretProtector protector, MiCorreoClient client, CancellationToken ct) =>
        {
            if (province is not { Length: 1 } || !char.IsAsciiLetterUpper(province[0]))
                return Error.Validation("Correo.InvalidProvince", "Código de provincia inválido.").ToProblem();

            var config = await configs.GetAsync(tenant.TenantId.Value, ct);
            if (config is null || !config.Active || !config.OfferAgencyDelivery)
                return Results.Ok(new { items = Array.Empty<object>() });

            try
            {
                var agencies = await client.GetAgenciesAsync(Credentials(config, protector),
                    config.CustomerId, province, ct);
                return Results.Ok(new
                {
                    items = agencies.Select(a => new
                    {
                        code = a.Code,
                        name = a.Name,
                        address = AgencyAddress(a),
                    }),
                });
            }
            catch (Exception ex) when (ex is MiCorreoException || CarrierNoAnswer.Is(ex, ct))
            {
                // Igual que la cotización: sin sucursales, el checkout sigue.
                return Results.Ok(new { items = Array.Empty<object>() });
            }
        }).RequireTenant();

        // ------------------------------- Admin: alta de envío desde una venta
        group.MapPost("/admin/orders/{orderId:guid}/correo-shipment", async (
            Guid orderId, CorreoShipmentRequest req, ITenantContext tenant,
            ICorreoArgentinoConfigRepository configs, IOrderRepository orders, ICatalogCheckoutQuery catalog,
            ShippingSecretProtector protector, MiCorreoClient client, IShipmentClaimRepository claims,
            ILoggerFactory loggers, CancellationToken ct) =>
        {
            var config = await configs.GetAsync(tenant.TenantId.Value, ct);
            if (config is null)
                return Error.Validation("Correo.NotConfigured",
                    "Configurá Correo Argentino en Medios de envío primero.").ToProblem();

            var order = await orders.GetByIdAsync(tenant.TenantId, orderId, ct);
            if (order is null) return Results.NotFound();

            // GUARD: no se sabe si MiCorreo deduplica por extOrderId, así que una
            // venta se da de alta una sola vez. Si ya está, se devuelve la que
            // hay; dos pedidos simultáneos los resuelve ShipmentWriteAhead.
            var existing = await configs.GetShipmentByOrderAsync(tenant.TenantId.Value, orderId, ct);
            if (existing is not null) return Results.Ok(ShipmentDto(existing, alreadyExisted: true));

            var isAgency = string.Equals(req.DeliveryType, "S", StringComparison.OrdinalIgnoreCase);
            if (string.IsNullOrWhiteSpace(req.RecipientName) || string.IsNullOrWhiteSpace(req.RecipientEmail))
                return Error.Validation("Correo.MissingRecipient", "Completá nombre y email del destinatario.").ToProblem();
            if (isAgency && string.IsNullOrWhiteSpace(req.Agency))
                return Error.Validation("Correo.MissingAgency", "Elegí la sucursal de destino.").ToProblem();
            if (!isAgency && (string.IsNullOrWhiteSpace(req.StreetName) || string.IsNullOrWhiteSpace(req.StreetNumber)
                || string.IsNullOrWhiteSpace(req.City) || string.IsNullOrWhiteSpace(req.ProvinceCode)
                || string.IsNullOrWhiteSpace(req.PostalCode)))
                return Error.Validation("Correo.MissingAddress",
                    "Completá la dirección de entrega (calle, número, ciudad, provincia y CP).").ToProblem();

            // El paquete de la venta: con lo que pesa lo que se vendió, el mismo
            // cálculo que la cotización que pagó el comprador. Lo que se cargue a
            // mano en el pedido manda.
            var sold = await CartParcelsBuilder.FromLinesAsync(catalog, tenant.TenantId.Value,
                order.Items.Select(i => (i.VariantId, i.Quantity)), DefaultParcel(config), maxUnits: 999, ct);
            var soldPackage = sold is null ? null : CorreoPackage.Aggregate(sold.Units);

            var payload = new
            {
                customerId = config.CustomerId,
                extOrderId = order.Id.ToString("N"),
                orderNumber = order.Label.TrimStart('#'),
                recipient = new
                {
                    name = req.RecipientName.Trim(),
                    email = req.RecipientEmail.Trim(),
                    phone = req.RecipientPhone?.Trim(),
                    cellPhone = req.RecipientPhone?.Trim(),
                },
                shipping = new
                {
                    deliveryType = isAgency ? "S" : "D",
                    agency = isAgency ? req.Agency!.Trim() : null,
                    address = isAgency ? null : new
                    {
                        streetName = req.StreetName!.Trim(),
                        streetNumber = req.StreetNumber!.Trim(),
                        floor = req.Floor?.Trim(),
                        apartment = req.Apartment?.Trim(),
                        city = req.City!.Trim(),
                        provinceCode = req.ProvinceCode!.Trim().ToUpperInvariant(),
                        postalCode = req.PostalCode!.Trim(),
                    },
                    weight = Math.Clamp(req.WeightGrams ?? soldPackage?.WeightGrams ?? config.DefaultWeightGrams,
                        1, CorreoArgentinoConfig.MaxWeightGrams),
                    declaredValue = Math.Max(0, req.DeclaredValue ?? 0),
                    height = Math.Clamp(req.HeightCm ?? soldPackage?.HeightCm ?? config.DefaultHeightCm,
                        1, CorreoArgentinoConfig.MaxSideCm),
                    length = Math.Clamp(req.LengthCm ?? soldPackage?.LengthCm ?? config.DefaultLengthCm,
                        1, CorreoArgentinoConfig.MaxSideCm),
                    width = Math.Clamp(req.WidthCm ?? soldPackage?.WidthCm ?? config.DefaultWidthCm,
                        1, CorreoArgentinoConfig.MaxSideCm),
                },
            };

            return await ShipmentWriteAhead.CreateOnceAsync(
                claims, loggers.CreateLogger("CorreoArgentino"), tenant.TenantId.Value, orderId,
                ShipmentCarriers.Correo, "Correo Argentino",
                async c => await configs.GetShipmentByOrderAsync(tenant.TenantId.Value, orderId, c) is { } done
                    ? Results.Ok(ShipmentDto(done, alreadyExisted: true))
                    : null,
                async attempt =>
                {
                    try
                    {
                        var createdAt = await client.ImportShippingAsync(Credentials(config, protector), payload, ct);
                        attempt.CarrierCreated($"alta de la venta {order.Label}");

                        // Sin el token del pedido: el alta ya existe en MiCorreo
                        // y tiene que quedar guardada aunque el panel se haya ido.
                        var record = CorreoShipment.Create(tenant.TenantId.Value, orderId,
                            isAgency ? "S" : "D", isAgency ? req.Agency!.Trim() : null, createdAt);
                        await configs.AddShipmentAsync(record, CancellationToken.None);
                        await configs.SaveChangesAsync(CancellationToken.None);
                        return Results.Ok(ShipmentDto(record, alreadyExisted: false));
                    }
                    catch (MiCorreoException ex) when (attempt.CreatedAtCarrier is null)
                    {
                        return Error.Validation("Correo.ImportFailed", ex.Message).ToProblem();
                    }
                },
                ct);
        }).RequirePermission(Permission.OrdersFulfill);

        // El alta de esa venta en MiCorreo, si se hizo desde el panel.
        group.MapGet("/admin/orders/{orderId:guid}/correo-shipment", async (
            Guid orderId, ITenantContext tenant, ICorreoArgentinoConfigRepository configs,
            IShipmentClaimRepository claims, CancellationToken ct) =>
        {
            var shipment = await configs.GetShipmentByOrderAsync(tenant.TenantId.Value, orderId, ct);
            return shipment is null
                ? Results.Ok(new
                {
                    exists = false,
                    review = await ShipmentReview.PendingAsync(
                        claims, tenant.TenantId.Value, orderId, ShipmentCarriers.Correo, ct),
                })
                : Results.Ok(ShipmentDto(shipment, alreadyExisted: true));
        }).RequirePermission(Permission.OrdersRead);

        // Un alta que MiCorreo hizo y no quedó guardada (ver ShipmentReview): o
        // no se hizo y se suelta, o se registra que está hecha.
        group.MapPost("/admin/orders/{orderId:guid}/correo-shipment/review/release", (
            Guid orderId, HttpContext http, ITenantContext tenant, IOrderRepository orders,
            IShipmentClaimRepository claims, IAuditLog audit, ILoggerFactory loggers, CancellationToken ct) =>
            ShipmentReview.ReleaseAsync(http, tenant.TenantId.Value, orderId, ShipmentCarriers.Correo, "Correo Argentino",
                orders, claims, audit, loggers.CreateLogger("CorreoArgentino"), ct))
            .RequirePermission(Permission.OrdersFulfill);

        // MiCorreo no da número al dar de alta (sale después, al pagar el envío
        // en MiCorreo): acá solo se registra el alta. El número de seguimiento
        // se carga en la venta con "Marcar enviada", como con un alta normal.
        group.MapPost("/admin/orders/{orderId:guid}/correo-shipment/review/record", (
            Guid orderId, HttpContext http, ITenantContext tenant,
            IOrderRepository orders, IShipmentClaimRepository claims, IAuditLog audit,
            ILoggerFactory loggers, CancellationToken ct) =>
            ShipmentReview.RecordAsync(http, tenant.TenantId.Value, orderId,
                ShipmentCarriers.Correo, "Correo Argentino",
                // El tipo de entrega del alta no se sabe: "D" es el que no
                // muestra una sucursal inventada.
                CorreoShipment.Create(tenant.TenantId.Value, orderId, "D", agency: null, remoteCreatedAt: null),
                number: null, r => Results.Ok(ShipmentDto(r, alreadyExisted: false)),
                orders, claims, audit, loggers.CreateLogger("CorreoArgentino"), ct))
            .RequirePermission(Permission.OrdersFulfill);

        // Seguimiento de un envío MiCorreo (por número de tracking del carrier).
        group.MapGet("/admin/shipping/correo/tracking", async (
            string shippingId, ITenantContext tenant, ICorreoArgentinoConfigRepository configs,
            ShippingSecretProtector protector, MiCorreoClient client, ILoggerFactory loggers, CancellationToken ct) =>
        {
            var config = await configs.GetAsync(tenant.TenantId.Value, ct);
            if (config is null)
                return Error.Validation("Correo.NotConfigured", "Correo Argentino no está configurado.").ToProblem();
            try
            {
                var tracking = await client.GetTrackingAsync(Credentials(config, protector), shippingId.Trim(), ct);
                return Results.Ok(new
                {
                    items = tracking.Select(t => new
                    {
                        t.TrackingNumber,
                        // Del más nuevo al más viejo: el panel muestra el primero.
                        events = TrackingEvents.NewestFirst(t.Events ?? [], e => e.Date)
                            .Select(e => new { e.Event, e.Date, e.Branch, e.Status }),
                    }),
                });
            }
            catch (MiCorreoException ex)
            {
                return Error.Validation("Correo.TrackingFailed", ex.Message).ToProblem();
            }
            catch (Exception ex) when (CarrierNoAnswer.Is(ex, ct))
            {
                loggers.CreateLogger("CorreoArgentino").LogWarning(ex, "MiCorreo no respondió al pedir el seguimiento.");
                return Error.Validation("Correo.TrackingFailed", CarrierNoAnswer.Message("Correo Argentino")).ToProblem();
            }
        }).RequirePermission(Permission.OrdersRead);

        return group;
    }

    // ---------------------------------------------------------------- Helpers

    /// <summary>El paquete por defecto de la tienda: el de cada unidad cuya variante no tiene peso o medidas.</summary>
    private static ParcelUnit DefaultParcel(CorreoArgentinoConfig config) =>
        new(config.DefaultWeightGrams, config.DefaultLengthCm, config.DefaultWidthCm, config.DefaultHeightCm);

    internal static MiCorreoCredentials Credentials(CorreoArgentinoConfig config, ShippingSecretProtector protector) =>
        new(protector.Unprotect(config.UserTokenEncrypted),
            protector.Unprotect(config.PasswordTokenEncrypted),
            config.Environment);

    private static string AgencyAddress(MiCorreoAgency a)
    {
        var addr = a.Location?.Address;
        if (addr is null) return string.Empty;
        var parts = new[]
        {
            $"{addr.StreetName} {addr.StreetNumber}".Trim(),
            addr.Locality ?? addr.City ?? string.Empty,
        };
        return string.Join(", ", parts.Where(p => !string.IsNullOrWhiteSpace(p)));
    }

    /// <summary>
    /// El alta de una venta. <c>ok</c> y <c>createdAt</c> (la fecha que devolvió
    /// MiCorreo) son los campos que el panel ya leía antes de que se guardara.
    /// </summary>
    private static object ShipmentDto(CorreoShipment s, bool alreadyExisted) => new
    {
        exists = true,
        ok = true,
        alreadyExisted,
        deliveryType = s.DeliveryType,
        agency = s.Agency,
        createdAt = s.RemoteCreatedAt,
        createdAtUtc = s.CreatedAtUtc,
    };

    /// <summary>DTO de config SIN secretos: los tokens jamás salen de la API.</summary>
    private static object ConfigDto(CorreoArgentinoConfig? c) => c is null
        ? new { configured = false }
        : (object)new
        {
            configured = true,
            hasCredentials = true,
            customerId = c.CustomerId,
            environment = c.Environment,
            originPostalCode = c.OriginPostalCode,
            defaultWeightGrams = c.DefaultWeightGrams,
            defaultLengthCm = c.DefaultLengthCm,
            defaultWidthCm = c.DefaultWidthCm,
            defaultHeightCm = c.DefaultHeightCm,
            offerHomeDelivery = c.OfferHomeDelivery,
            offerAgencyDelivery = c.OfferAgencyDelivery,
            active = c.Active,
        };
}

public sealed record CorreoConfigRequest(
    string? UserToken,
    string? PasswordToken,
    string? CustomerId,
    string? MiCorreoEmail,
    string? MiCorreoPassword,
    string? Environment,
    string? OriginPostalCode,
    int? DefaultWeightGrams,
    int? DefaultLengthCm,
    int? DefaultWidthCm,
    int? DefaultHeightCm,
    bool? OfferHomeDelivery,
    bool? OfferAgencyDelivery,
    bool? Active);

public sealed record CorreoTestRequest(string? PostalCode);

/// <summary>`Items`: el detalle del carrito (para el peso de cada variante); `Units` queda por compatibilidad.</summary>
public sealed record CorreoQuoteRequest(string? PostalCode, int? Units, List<CartLineInput>? Items = null);

public sealed record CorreoShipmentRequest(
    string? DeliveryType,     // "D" | "S"
    string? RecipientName,
    string? RecipientEmail,
    string? RecipientPhone,
    string? StreetName,
    string? StreetNumber,
    string? Floor,
    string? Apartment,
    string? City,
    string? ProvinceCode,
    string? PostalCode,
    string? Agency,
    int? WeightGrams,
    int? LengthCm,
    int? WidthCm,
    int? HeightCm,
    decimal? DeclaredValue);
