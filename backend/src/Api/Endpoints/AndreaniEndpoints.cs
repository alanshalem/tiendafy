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

public sealed record SaveAndreaniRequest(
    string? Username,
    /// <summary>Vacío = conservar la guardada. Nunca vuelve al panel.</summary>
    string? Password,
    string? ClientCode,
    string? HomeDeliveryContract,
    string? BranchPickupContract,
    string? OriginBranch,
    bool UseQa,
    decimal? VolumetricFactor,
    string? SenderName,
    string? SenderEmail,
    string? SenderDocumentType,
    string? SenderDocumentNumber,
    string? SenderPhone,
    string? OriginStreet,
    string? OriginNumber,
    string? OriginCity,
    string? OriginPostalCode,
    int WeightGrams,
    int LengthCm,
    int WidthCm,
    int HeightCm,
    bool Active);

/// <summary>`Items`: el detalle del carrito (para el peso de cada variante); `Units` queda por compatibilidad.</summary>
public sealed record AndreaniQuoteRequest(
    string? PostalCode, int? Units, decimal? DeclaredValue, List<CartLineInput>? Items = null);

public sealed record AndreaniShipmentRequest(
    string? Name, string? Email, string? DocumentType, string? DocumentNumber, string? Phone,
    string? Street, string? StreetNumber, string? City, string? Region, string? PostalCode,
    string? Extras, int? Units, decimal? DeclaredValue, bool ToBranch, string? BranchId);

/// <summary>
/// Andreani como medio de envío: cotización en el checkout, generación de la
/// orden desde el panel, etiqueta y seguimiento.
/// </summary>
public static class AndreaniEndpoints
{
    public static RouteGroupBuilder MapAndreaniEndpoints(this RouteGroupBuilder group)
    {
        MapAdmin(group);
        MapQuote(group);
        MapShipments(group);
        return group;
    }

    // ------------------------------------------------------ Configuración

    private static void MapAdmin(RouteGroupBuilder group)
    {
        var admin = group.MapGroup("/admin/shipping/andreani").RequirePermission(Permission.ShippingConfig);

        admin.MapGet("/", async (ITenantContext tenant, IAndreaniRepository repo, CancellationToken ct) =>
        {
            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            return Results.Ok(config is null
                ? new { configured = false }
                : (object)new
                {
                    configured = true,
                    config.Username,
                    hasPassword = !string.IsNullOrWhiteSpace(config.PasswordEncrypted),
                    config.ClientCode,
                    config.HomeDeliveryContract,
                    config.BranchPickupContract,
                    config.OriginBranch,
                    config.UseQa,
                    config.VolumetricFactor,
                    config.SenderName,
                    config.SenderEmail,
                    config.SenderDocumentType,
                    config.SenderDocumentNumber,
                    config.SenderPhone,
                    config.OriginStreet,
                    config.OriginNumber,
                    config.OriginCity,
                    config.OriginPostalCode,
                    config.DefaultWeightGrams,
                    config.DefaultLengthCm,
                    config.DefaultWidthCm,
                    config.DefaultHeightCm,
                    config.Active,
                    // El panel avisa si falta algo del remitente ANTES de que
                    // falle el primer despacho.
                    config.CanCreateShipments,
                    config.UnitVolumeCm,
                });
        });

        admin.MapPut("/", async (
            SaveAndreaniRequest req, ITenantContext tenant, IAndreaniRepository repo,
            ShippingSecretProtector protector, CancellationToken ct) =>
        {
            var encrypted = string.IsNullOrWhiteSpace(req.Password) ? null : protector.Protect(req.Password.Trim());

            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            if (config is null)
            {
                if (encrypted is null)
                    return Error.Validation("Andreani.MissingPassword", "Falta la contraseña de Andreani.").ToProblem();

                var created = AndreaniConfig.Create(tenant.TenantId.Value, encrypted);
                if (created.IsFailure) return created.Error.ToProblem();
                config = created.Value;
                await repo.AddConfigAsync(config, ct);
            }

            var update = config.Update(
                req.Username, encrypted, req.ClientCode,
                req.HomeDeliveryContract, req.BranchPickupContract, req.OriginBranch,
                req.UseQa, req.VolumetricFactor,
                req.SenderName, req.SenderEmail, req.SenderDocumentType, req.SenderDocumentNumber,
                req.SenderPhone, req.OriginStreet, req.OriginNumber, req.OriginCity, req.OriginPostalCode,
                req.WeightGrams, req.LengthCm, req.WidthCm, req.HeightCm, req.Active);
            if (update.IsFailure) return update.Error.ToProblem();

            await repo.SaveChangesAsync(ct);
            return Results.Ok(new { configured = true, config.CanCreateShipments });
        });

        admin.MapDelete("/", async (ITenantContext tenant, IAndreaniRepository repo, CancellationToken ct) =>
        {
            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            if (config is null) return Results.NoContent();
            await repo.RemoveConfigAsync(config, ct);
            await repo.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Prueba de credenciales: hace el login real. Es la única forma de
        // saber si el usuario, la contraseña y la habilitación de IP están bien.
        admin.MapPost("/test", async (
            ITenantContext tenant, IAndreaniRepository repo, ShippingSecretProtector protector,
            AndreaniClient client, CancellationToken ct) =>
        {
            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            if (config is null)
                return Error.Validation("Andreani.NotConfigured", "Cargá primero las credenciales.").ToProblem();

            try
            {
                await client.LoginAsync(config, protector.Unprotect(config.PasswordEncrypted), ct);
                return Results.Ok(new { ok = true, message = "Andreani respondió correctamente." });
            }
            catch (AndreaniException ex)
            {
                return Results.Ok(new { ok = false, message = ex.Message });
            }
        });
    }

    // --------------------------------------------------------- Cotización

    private static void MapQuote(RouteGroupBuilder group)
    {
        group.MapPost("/shipping/andreani/quote", async (
            AndreaniQuoteRequest req, ITenantContext tenant, IAndreaniRepository repo,
            AndreaniClient client, ICatalogCheckoutQuery catalog, IDataProtectionProvider dp, CancellationToken ct) =>
        {
            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            if (config is null || !config.Active)
                return Results.Ok(new { available = false, options = Array.Empty<object>() });

            var postalCode = NumericZip(req.PostalCode);
            // Un código postal inexistente NO hace fallar la cotización de
            // Andreani: devuelve una tarifa genérica igual. Validar el formato
            // acá es lo único que evita ofrecerle un precio a un destino que no
            // existe.
            if (postalCode is null)
                return Error.Validation("Andreani.BadPostalCode",
                    "El código postal tiene que ser de 4 dígitos.").ToProblem();

            // Un bulto por unidad, con el peso y las medidas de su variante.
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
                return Error.Validation("Andreani.EmptyCart", "El carrito está vacío.").ToProblem();
            var units = parcels.Count;

            var declared = Math.Max(0, req.DeclaredValue ?? 0);
            var packages = BuildPackages(parcels.Units, declared);

            var options = new List<object>();
            foreach (var (contract, toBranch, label) in Modalities(config))
            {
                var rate = await client.QuoteAsync(config, contract, postalCode, packages, ct);
                if (rate is null || rate.TotalWithTax <= 0) continue;

                var money = Money.FromDecimal(rate.TotalWithTax, Money.DefaultCurrency);
                var name = $"Andreani · {label}";
                options.Add(new
                {
                    token = AndreaniQuoteToken.Protect(dp, new AndreaniQuotePayload(
                        tenant.TenantId.Value, units, money.AmountInMinorUnits, money.Currency,
                        name, contract, toBranch, postalCode, parcels.CartKey)),
                    name,
                    price = ApiJson.MoneyJson(money),
                    toBranch,
                    // Andreani no devuelve plazo de entrega en la cotización:
                    // no se inventa uno.
                    estimatedDelivery = (string?)null,
                });
            }

            return Results.Ok(new { available = true, options });
        }).RequireTenant();
    }

    // ------------------------------------------- Envío desde una venta

    private static void MapShipments(RouteGroupBuilder group)
    {
        group.MapPost("/admin/orders/{orderId:guid}/andreani-shipment", async (
            Guid orderId, AndreaniShipmentRequest req, ITenantContext tenant,
            IAndreaniRepository repo, IOrderRepository orders, ICatalogCheckoutQuery catalog,
            ShippingSecretProtector protector, AndreaniClient client, IShipmentClaimRepository claims,
            ILoggerFactory loggers, CancellationToken ct) =>
        {
            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            if (config is null)
                return Error.Validation("Andreani.NotConfigured",
                    "Configurá Andreani en Medios de envío primero.").ToProblem();
            if (!config.CanCreateShipments)
                return Error.Validation("Andreani.MissingSender",
                    "Faltan datos del remitente en la configuración de Andreani.").ToProblem();

            var order = await orders.GetByIdAsync(tenant.TenantId, orderId, ct);
            if (order is null) return Results.NotFound();

            // GUARD DE IDEMPOTENCIA. Andreani no deduplica y NO TIENE ENDPOINT DE
            // CANCELACIÓN: un segundo envío no se puede anular por API y se
            // factura igual. Si ya existe, se devuelve el que hay; dos pedidos
            // simultáneos los resuelve la reserva de ShipmentWriteAhead.
            var existing = await repo.GetShipmentByOrderAsync(tenant.TenantId.Value, orderId, ct);
            if (existing is not null) return Results.Ok(ShipmentDto(existing, alreadyExisted: true));

            var contract = req.ToBranch ? config.BranchPickupContract : config.HomeDeliveryContract;
            if (string.IsNullOrWhiteSpace(contract))
                return Error.Validation("Andreani.NoContract",
                    req.ToBranch
                        ? "No hay contrato de retiro en sucursal configurado."
                        : "No hay contrato de entrega a domicilio configurado.").ToProblem();

            var validation = ValidateRecipient(req);
            if (validation is not null) return validation.ToProblem();

            // Los bultos de la venta: uno por unidad vendida, con el peso de su
            // variante (lo mismo que se cotizó). Antes salía un solo bulto con
            // el peso por defecto aunque se hubieran vendido tres cosas. Si se
            // indica a mano la cantidad de bultos, manda eso.
            var parcels = req.Units is { } manual
                ? Enumerable.Repeat(DefaultParcel(config), Math.Clamp(manual, 1, MaxUnits)).ToList()
                : (await CartParcelsBuilder.FromLinesAsync(catalog, tenant.TenantId.Value,
                    order.Items.Select(i => (i.VariantId, i.Quantity)), DefaultParcel(config), MaxUnits, ct))?.Units
                  ?? [DefaultParcel(config)];
            var declared = Math.Max(0, req.DeclaredValue ?? order.Total.ToDecimal());
            var payload = BuildOrderPayload(config, req, contract!, parcels, declared, orderId);

            return await ShipmentWriteAhead.CreateOnceAsync(
                claims, loggers.CreateLogger("Andreani"), tenant.TenantId.Value, orderId,
                ShipmentCarriers.Andreani, "Andreani",
                async c => await repo.GetShipmentByOrderAsync(tenant.TenantId.Value, orderId, c) is { } done
                    ? Results.Ok(ShipmentDto(done, alreadyExisted: true))
                    : null,
                async attempt =>
                {
                    try
                    {
                        var token = await client.LoginAsync(config, protector.Unprotect(config.PasswordEncrypted), ct);
                        var created = await client.CreateShipmentAsync(config, token, payload, ct);
                        attempt.CarrierCreated($"seguimiento {created.TrackingNumber}");

                        // Sin el token del pedido: el envío ya existe en Andreani
                        // y tiene que quedar guardado aunque el panel se haya ido.
                        var record = AndreaniShipment.Create(
                            tenant.TenantId.Value, orderId, created.TrackingNumber, created.AllTrackingNumbers,
                            created.LabelUrl, contract, created.BranchName);
                        await repo.AddShipmentAsync(record, CancellationToken.None);
                        await repo.SaveChangesAsync(CancellationToken.None);
                        return Results.Ok(ShipmentDto(record, alreadyExisted: false));
                    }
                    catch (AndreaniException ex) when (attempt.CreatedAtCarrier is null)
                    {
                        return Error.Validation("Andreani.CreateFailed", ex.Message).ToProblem();
                    }
                },
                ct);
        }).RequirePermission(Permission.OrdersFulfill);

        group.MapGet("/admin/orders/{orderId:guid}/andreani-shipment", async (
            Guid orderId, ITenantContext tenant, IAndreaniRepository repo, IShipmentClaimRepository claims,
            CancellationToken ct) =>
        {
            var shipment = await repo.GetShipmentByOrderAsync(tenant.TenantId.Value, orderId, ct);
            return shipment is null
                ? Results.Ok(new
                {
                    exists = false,
                    review = await ShipmentReview.PendingAsync(
                        claims, tenant.TenantId.Value, orderId, ShipmentCarriers.Andreani, ct),
                })
                : Results.Ok(ShipmentDto(shipment, alreadyExisted: true));
        }).RequirePermission(Permission.OrdersRead);

        // Un envío que Andreani creó y no quedó guardado (ver ShipmentReview):
        // o no se creó y se suelta, o se carga el número que figura en Andreani.
        group.MapPost("/admin/orders/{orderId:guid}/andreani-shipment/review/release", (
            Guid orderId, HttpContext http, ITenantContext tenant, IOrderRepository orders,
            IShipmentClaimRepository claims, IAuditLog audit, ILoggerFactory loggers, CancellationToken ct) =>
            ShipmentReview.ReleaseAsync(http, tenant.TenantId.Value, orderId, ShipmentCarriers.Andreani, "Andreani",
                orders, claims, audit, loggers.CreateLogger("Andreani"), ct))
            .RequirePermission(Permission.OrdersFulfill);

        group.MapPost("/admin/orders/{orderId:guid}/andreani-shipment/review/record", async (
            Guid orderId, ShipmentReviewRecordRequest req, HttpContext http, ITenantContext tenant,
            IOrderRepository orders, IShipmentClaimRepository claims, IAuditLog audit,
            ILoggerFactory loggers, CancellationToken ct) =>
        {
            // Uno por bulto: si el envío tiene varios, se pueden pegar todos.
            var numbers = (req.Number ?? "").Split([',', ';', ' ', '\n', '\r', '\t'],
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (numbers.Length == 0)
                return Error.Validation("Andreani.MissingTracking",
                    "Cargá el número de seguimiento que figura en el panel de Andreani.").ToProblem();
            if (numbers.Any(n => n.Length > 40))
                return Error.Validation("Andreani.BadTracking",
                    "Ese número de seguimiento es demasiado largo: copialo tal como figura en Andreani.").ToProblem();

            // Como una creación que terminó bien, sin etiqueta: Andreani no la
            // dio acá. El seguimiento anda con el número.
            var record = AndreaniShipment.Create(tenant.TenantId.Value, orderId, numbers[0], numbers,
                labelUrl: null, contractUsed: null, branchName: null);
            return await ShipmentReview.RecordAsync(http, tenant.TenantId.Value, orderId,
                ShipmentCarriers.Andreani, "Andreani", record, string.Join(", ", numbers),
                r => Results.Ok(ShipmentDto(r, alreadyExisted: false)),
                orders, claims, audit, loggers.CreateLogger("Andreani"), ct);
        }).RequirePermission(Permission.OrdersFulfill);

        // Etiqueta: se descarga desde la URL que devolvió Andreani al crear el
        // envío. No se arma a mano — el path cambió entre versiones de la API.
        group.MapGet("/admin/orders/{orderId:guid}/andreani-label", async (
            Guid orderId, ITenantContext tenant, IAndreaniRepository repo,
            ShippingSecretProtector protector, AndreaniClient client, CancellationToken ct) =>
        {
            var shipment = await repo.GetShipmentByOrderAsync(tenant.TenantId.Value, orderId, ct);
            if (shipment is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(shipment.LabelUrl))
                return Error.Validation("Andreani.NoLabel",
                    "Andreani no devolvió la etiqueta de este envío.").ToProblem();

            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            if (config is null) return Results.NotFound();

            try
            {
                var token = await client.LoginAsync(config, protector.Unprotect(config.PasswordEncrypted), ct);
                var pdf = await client.GetLabelAsync(shipment.LabelUrl, token, ct);
                return Results.File(pdf, "application/pdf", $"andreani-{shipment.TrackingNumber}.pdf");
            }
            catch (AndreaniException ex)
            {
                return Error.Validation("Andreani.LabelFailed", ex.Message).ToProblem();
            }
        }).RequirePermission(Permission.OrdersFulfill);

        group.MapGet("/admin/orders/{orderId:guid}/andreani-tracking", async (
            Guid orderId, ITenantContext tenant, IAndreaniRepository repo,
            ShippingSecretProtector protector, AndreaniClient client,
            ILoggerFactory loggers, CancellationToken ct) =>
        {
            var shipment = await repo.GetShipmentByOrderAsync(tenant.TenantId.Value, orderId, ct);
            if (shipment is null) return Results.NotFound();

            var config = await repo.GetConfigAsync(tenant.TenantId.Value, ct);
            if (config is null) return Results.NotFound();

            try
            {
                var token = await client.LoginAsync(config, protector.Unprotect(config.PasswordEncrypted), ct);
                var events = await client.GetTracesAsync(config, token, shipment.TrackingNumber, ct);

                var last = events.OrderByDescending(e => e.OccurredAtUtc).FirstOrDefault();
                if (last is not null)
                {
                    var status = AndreaniStatusMap.FromTrace(last.StateId, last.State);
                    if (status == AndreaniShipmentStatus.Unknown)
                    {
                        // Andreani no publica su catálogo de estados: cada uno
                        // que no reconocemos se loguea para poder agregarlo.
                        loggers.CreateLogger("Andreani").LogWarning(
                            "Estado de Andreani sin mapear: {StateId} '{State}' en el envío {Tracking}.",
                            last.StateId, LogValue.Safe(last.State), LogValue.Safe(shipment.TrackingNumber));
                    }

                    shipment.ApplyTracking(status, last.State, last.StateId);
                    await repo.SaveChangesAsync(ct);
                }

                return Results.Ok(new
                {
                    shipment.TrackingNumber,
                    shipment.Status,
                    label = AndreaniStatusMap.AdminLabel(shipment.Status),
                    events = events.OrderByDescending(e => e.OccurredAtUtc).Select(e => new
                    {
                        date = e.OccurredAtUtc,
                        state = e.State,
                        stateId = e.StateId,
                        reason = e.Reason,
                        branch = e.Branch,
                    }),
                });
            }
            catch (AndreaniException ex)
            {
                return Error.Validation("Andreani.TrackingFailed", ex.Message).ToProblem();
            }
        }).RequirePermission(Permission.OrdersRead);
    }

    // ----------------------------------------------------------- Helpers

    /// <summary>Modalidades que la tienda tiene contratadas. Cada una es una cotización aparte.</summary>
    private static IEnumerable<(string Contract, bool ToBranch, string Label)> Modalities(AndreaniConfig config)
    {
        if (!string.IsNullOrWhiteSpace(config.HomeDeliveryContract))
            yield return (config.HomeDeliveryContract, false, "Envío a domicilio");
        if (!string.IsNullOrWhiteSpace(config.BranchPickupContract))
            yield return (config.BranchPickupContract, true, "Retiro en sucursal");
    }

    /// <summary>Bultos por envío: más que esto no se cotiza online.</summary>
    private const int MaxUnits = 200;

    /// <summary>El bulto por defecto de la tienda: el de cada unidad cuya variante no tiene peso o medidas.</summary>
    private static ParcelUnit DefaultParcel(AndreaniConfig config) =>
        new(config.DefaultWeightGrams, config.DefaultLengthCm, config.DefaultWidthCm, config.DefaultHeightCm);

    /// <summary>
    /// Un bulto por unidad. El volumen va en cm³ y el peso en kilos, que es lo
    /// que espera la API.
    /// </summary>
    private static List<AndreaniPackage> BuildPackages(IReadOnlyList<ParcelUnit> units, decimal declaredValue)
    {
        var perUnit = units.Count == 0 ? 0m : Math.Round(declaredValue / units.Count, 2);
        return units.Select(u => new AndreaniPackage(u.WeightGrams / 1000m, u.VolumeCm3, perUnit)).ToList();
    }

    private static Error? ValidateRecipient(AndreaniShipmentRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.DocumentNumber))
            return Error.Validation("Andreani.MissingRecipient",
                "Andreani exige nombre y documento del destinatario.");

        // El email del destinatario tiene un tope de 40 caracteres. Es la causa
        // número uno de rechazos y conviene decirlo con estas palabras.
        if (string.IsNullOrWhiteSpace(req.Email))
            return Error.Validation("Andreani.MissingEmail", "Andreani exige el email del destinatario.");
        if (req.Email.Trim().Length > 40)
            return Error.Validation("Andreani.EmailTooLong",
                "Andreani no acepta emails de más de 40 caracteres.");

        // Retiro en sucursal: alcanza con la sucursal. Sin ella no hay a dónde
        // mandarlo, y la dirección del comprador no sirve de destino.
        if (req.ToBranch)
        {
            return string.IsNullOrWhiteSpace(req.BranchId)
                ? Error.Validation("Andreani.MissingBranch",
                    "Para retiro en sucursal cargá el id de la sucursal de Andreani.")
                : null;
        }

        if (string.IsNullOrWhiteSpace(req.Street) || string.IsNullOrWhiteSpace(req.StreetNumber)
            || string.IsNullOrWhiteSpace(req.City) || NumericZip(req.PostalCode) is null)
        {
            return Error.Validation("Andreani.MissingAddress",
                "Completá calle, número, localidad y código postal de 4 dígitos.");
        }

        return null;
    }

    private static Dictionary<string, object?> BuildOrderPayload(
        AndreaniConfig config, AndreaniShipmentRequest req, string contract,
        IReadOnlyList<ParcelUnit> parcels, decimal declaredValue, Guid orderId)
    {
        var reference = $"TF-{orderId:N}"[..Math.Min(35, $"TF-{orderId:N}".Length)];
        var units = parcels.Count;
        var perUnit = Math.Round(declaredValue / units, 2);

        var bultos = parcels.Select((p, i) => new Dictionary<string, object?>
        {
            ["kilos"] = p.WeightGrams / 1000m,
            ["largoCm"] = p.LengthCm,
            ["altoCm"] = p.HeightCm,
            ["anchoCm"] = p.WidthCm,
            // volumenCm es obligatorio y las tres dimensiones no: al revés de
            // lo intuitivo. Se mandan los cuatro.
            ["volumenCm"] = p.VolumeCm3,
            ["valorDeclaradoSinImpuestos"] = perUnit,
            ["descripcion"] = units > 1 ? $"Bulto {i + 1} de {units}" : "Pedido",
            // El meta "idCliente" con el mismo contenido es lo que agrupa
            // varios bultos en un mismo envío.
            ["referencias"] = new[] { new { meta = "idCliente", contenido = reference } },
        }).ToArray();

        var payload = new Dictionary<string, object?>
        {
            ["contrato"] = contract,
            ["tipoServicio"] = req.ToBranch ? "Sucursal" : "Domicilio",
            ["origen"] = new
            {
                postal = new
                {
                    codigoPostal = config.OriginPostalCode,
                    calle = config.OriginStreet,
                    numero = config.OriginNumber,
                    localidad = config.OriginCity,
                    pais = "Argentina",
                },
            },
            ["remitente"] = new
            {
                nombreCompleto = config.SenderName,
                eMail = config.SenderEmail,
                documentoTipo = string.IsNullOrWhiteSpace(config.SenderDocumentType) ? "CUIT" : config.SenderDocumentType,
                documentoNumero = config.SenderDocumentNumber,
                // Remitente: Trabajo=0, Celular=1, Casa=2, Otros=3.
                telefonos = string.IsNullOrWhiteSpace(config.SenderPhone)
                    ? null
                    : new { tipo = 0, numero = config.SenderPhone },
            },
            ["destinatario"] = new[]
            {
                new
                {
                    nombreCompleto = Text.Cap(req.Name!.Trim(), 40),
                    eMail = Text.Cap(req.Email!.Trim(), 40),
                    documentoTipo = string.IsNullOrWhiteSpace(req.DocumentType) ? "DNI" : req.DocumentType.Trim(),
                    documentoNumero = Text.Cap(req.DocumentNumber!.Trim(), 20),
                    // ⚠️ Destinatario usa OTRA numeración que el remitente:
                    // Trabajo=1, Celular=2, Casa=3, Otros=4. Un mapeo compartido
                    // clasifica mal los teléfonos sin que nada falle.
                    telefonos = string.IsNullOrWhiteSpace(req.Phone)
                        ? null
                        : new { tipo = 2, numero = Text.Cap(req.Phone.Trim(), 15) },
                },
            },
            ["remito"] = new { numeroRemito = reference },
            ["bultos"] = bultos,
        };

        // ValidateRecipient ya exigió la sucursal o la dirección completa.
        if (req.ToBranch)
        {
            payload["destino"] = new { sucursal = new { id = req.BranchId!.Trim() } };
        }
        else
        {
            var componentes = string.IsNullOrWhiteSpace(req.Extras)
                ? null
                : new[] { new { meta = "Observaciones", contenido = Text.Cap(req.Extras.Trim(), 40) } };

            payload["destino"] = new
            {
                postal = new
                {
                    codigoPostal = NumericZip(req.PostalCode),
                    calle = Text.Cap(req.Street!.Trim(), 40),
                    numero = Text.Cap(req.StreetNumber!.Trim(), 40),
                    localidad = Text.Cap(req.City!.Trim(), 40),
                    pais = "Argentina",
                    componentesDeDireccion = componentes,
                },
            };
        }

        return payload;
    }

    private static object ShipmentDto(AndreaniShipment shipment, bool alreadyExisted) => new
    {
        exists = true,
        alreadyExisted,
        shipment.TrackingNumber,
        allTrackingNumbers = (shipment.AllTrackingNumbers ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries),
        shipment.Status,
        label = AndreaniStatusMap.AdminLabel(shipment.Status),
        hasLabel = !string.IsNullOrWhiteSpace(shipment.LabelUrl),
        shipment.BranchName,
        shipment.CreatedAtUtc,
    };

    /// <summary>Código postal argentino: 4 dígitos. Acepta el CPA y se queda con los dígitos del medio.</summary>
    private static string? NumericZip(string? raw)
    {
        var digits = new string((raw ?? "").Where(char.IsDigit).ToArray());
        return digits.Length is >= 4 and <= 8 ? digits[..4] : null;
    }
}
