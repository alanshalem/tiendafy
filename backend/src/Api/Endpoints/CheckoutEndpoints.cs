using Api.Auth;
using Api.Notifications;
using Api.Shipping;
using Checkout.Core.Domain;
using Checkout.Core.Features.SaveContact;
using Checkout.Core.Features.StartCheckout;
using Checkout.Core.Features.SubmitCheckout;
using Checkout.Infrastructure.Carriers;
using Checkout.Infrastructure.Persistence;
using Identity.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static class CheckoutEndpoints
{
    public static RouteGroupBuilder MapCheckoutEndpoints(this RouteGroupBuilder group)
    {
        var checkout = group.MapGroup("/checkout").RequireTenant();

        checkout.MapPost("/", async (
            StartCheckoutRequest request,
            ITenantContext tenant,
            StartCheckoutHandler handler,
            CancellationToken ct) =>
        {
            var command = new StartCheckoutCommand(
                tenant.TenantId,
                request.Lines?.Select(l => new StartCheckoutLine(l.VariantId, l.Quantity)).ToList() ?? []);

            var result = await handler.HandleAsync(command, ct);
            return result.IsSuccess
                ? Results.Created($"/api/v1/checkout/{result.Value.Id}", ToDto(result.Value))
                : result.Error.ToProblem();
        });

        // Los datos de contacto que el comprador va dejando antes de pagar (el
        // email apenas lo escribe). Sigue con la compra abierta que el checkout
        // ya tenía si es la misma; si no, arma una con el carrito de ahora.
        // Con eso, quien se va antes de tocar "Pagar" recibe el recordatorio de
        // carrito abandonado; el pago sale después de esta misma compra.
        checkout.MapPost("/contact", async (
            SaveCheckoutContactRequest request,
            ITenantContext tenant,
            SaveCheckoutContactHandler handler,
            CancellationToken ct) =>
        {
            var result = await handler.HandleAsync(new SaveCheckoutContactCommand(
                tenant.TenantId, request.CheckoutId,
                request.Lines?.Select(l => new StartCheckoutLine(l.VariantId, l.Quantity)).ToList() ?? [],
                request.Email, request.Name, request.LastName, request.Phone, request.AcceptsWhatsApp), ct);
            return result.IsSuccess ? Results.Ok(ToDto(result.Value)) : result.Error.ToProblem();
        });

        checkout.MapGet("/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            ICheckoutRepository repository,
            CancellationToken ct) =>
        {
            var session = await repository.GetByIdAsync(tenant.TenantId, id, ct);
            return session is null ? Results.NotFound() : Results.Ok(ToDto(session));
        });

        // Submit: reserva stock (todo o nada) + datos de entrega/facturación.
        // El costo de envío se resuelve server-side: método persistido, o quote
        // de Correo Argentino firmado por el servidor (nunca del cliente).
        checkout.MapPost("/{id:guid}/submit", async (
            Guid id,
            SubmitCheckoutRequest request,
            ITenantContext tenant,
            SubmitCheckoutHandler handler,
            IDataProtectionProvider dp,
            ICorreoArgentinoConfigRepository correoConfigs,
            ShippingSecretProtector protector,
            MiCorreoClient correoClient,
            CancellationToken ct) =>
        {
            // El token es opaco: se prueba contra cada carrier (propósitos de
            // DataProtection distintos — el ajeno siempre da null).
            QuotedShipping? quote = null;
            if (!string.IsNullOrEmpty(request.ShippingQuoteToken))
            {
                var correoPayload = CorreoQuoteToken.Unprotect(dp, request.ShippingQuoteToken, tenant.TenantId.Value);
                var zipnovaPayload = correoPayload is null
                    ? ZipnovaQuoteToken.Unprotect(dp, request.ShippingQuoteToken, tenant.TenantId.Value)
                    : null;
                var andreaniPayload = correoPayload is null && zipnovaPayload is null
                    ? AndreaniQuoteToken.Unprotect(dp, request.ShippingQuoteToken, tenant.TenantId.Value)
                    : null;

                if (correoPayload is not null)
                {
                    var price = new Money(correoPayload.PriceMinorUnits, correoPayload.Currency);
                    if (correoPayload.Kind == "S")
                    {
                        if (string.IsNullOrWhiteSpace(request.CorreoAgency))
                            return Error.Validation("Checkout.MissingAgency",
                                "Elegí la sucursal de Correo donde retirar.").ToProblem();
                        var agencyLabel = await ResolveAgencyLabelAsync(
                            tenant.TenantId.Value, request.CorreoAgency.Trim(), correoConfigs, protector, correoClient, ct);
                        quote = new QuotedShipping(correoPayload.ServiceName, price, RequiresAddress: false, agencyLabel, correoPayload.Units, correoPayload.CartKey);
                    }
                    else
                    {
                        quote = new QuotedShipping(correoPayload.ServiceName, price, RequiresAddress: true, null, correoPayload.Units, correoPayload.CartKey);
                    }
                }
                else if (zipnovaPayload is not null)
                {
                    var price = new Money(zipnovaPayload.PriceMinorUnits, zipnovaPayload.Currency);
                    quote = new QuotedShipping(zipnovaPayload.ServiceName, price, RequiresAddress: true, null, zipnovaPayload.Units, zipnovaPayload.CartKey);
                }
                else if (andreaniPayload is not null)
                {
                    var price = new Money(andreaniPayload.PriceMinorUnits, andreaniPayload.Currency);
                    // Retiro en sucursal no pide dirección; a domicilio sí.
                    quote = new QuotedShipping(
                        andreaniPayload.ServiceName, price,
                        RequiresAddress: !andreaniPayload.ToBranch, null, andreaniPayload.Units, andreaniPayload.CartKey);
                }
                else
                {
                    return Error.Validation("Checkout.QuoteExpired",
                        "La cotización de envío venció. Volvé a calcular el envío.").ToProblem();
                }
            }

            var result = await handler.HandleAsync(new SubmitCheckoutCommand(
                tenant.TenantId, id, request.Email ?? string.Empty,
                request.Name, request.LastName, request.Phone, request.DocNumber, request.Notes,
                request.ShippingMethodId, request.Address, quote, request.AcceptsWhatsApp), ct);
            return result.IsSuccess ? Results.Ok(ToDto(result.Value)) : result.Error.ToProblem();
        });

        MapSettings(group);

        // Medios de envío visibles al comprador (activos) + si la tienda cotiza
        // en vivo con Correo Argentino (el storefront muestra el bloque de CP).
        group.MapGet("/shipping/methods", async (
            ITenantContext tenant, IShippingMethodRepository repository,
            ICorreoArgentinoConfigRepository correoConfigs, IZipnovaRepository zipnovaRepo,
            IAndreaniRepository andreaniRepo, CancellationToken ct) =>
        {
            var items = await repository.ListAsync(tenant.TenantId, onlyActive: true, ct);
            var correo = await correoConfigs.GetAsync(tenant.TenantId.Value, ct);
            var zipnova = await zipnovaRepo.GetConfigAsync(tenant.TenantId.Value, ct);
            var andreani = await andreaniRepo.GetConfigAsync(tenant.TenantId.Value, ct);
            return Results.Ok(new
            {
                items = items.Select(ShippingDto),
                correoArgentino = new
                {
                    enabled = correo?.Active == true && (correo.OfferHomeDelivery || correo.OfferAgencyDelivery),
                    agency = correo?.Active == true && correo.OfferAgencyDelivery,
                },
                zipnova = new { enabled = zipnova?.Active == true },
                andreani = new { enabled = andreani?.Active == true },
            });
        }).RequireTenant();

        return group;
    }

    /// <summary>
    /// "Sucursal Correo Argentino Monte Grande (B0107) — Vicente López 448".
    /// Se resuelve server-side desde el listado cacheado (el cliente solo manda
    /// el código); si la API no responde, cae al código pelado.
    /// </summary>
    private static async Task<string> ResolveAgencyLabelAsync(
        Guid tenantId, string agencyCode, ICorreoArgentinoConfigRepository configs,
        ShippingSecretProtector protector, MiCorreoClient client, CancellationToken ct)
    {
        var fallback = $"Sucursal Correo Argentino {agencyCode}";
        var config = await configs.GetAsync(tenantId, ct);
        if (config is null || agencyCode.Length < 2 || !char.IsAsciiLetter(agencyCode[0])) return fallback;
        try
        {
            var agencies = await client.GetAgenciesAsync(
                CorreoArgentinoEndpoints.Credentials(config, protector), config.CustomerId,
                char.ToUpperInvariant(agencyCode[0]).ToString(), ct);
            var agency = agencies.FirstOrDefault(a =>
                string.Equals(a.Code, agencyCode, StringComparison.OrdinalIgnoreCase));
            if (agency is null) return fallback;
            var addr = agency.Location?.Address;
            var street = addr is null ? null : $"{addr.StreetName} {addr.StreetNumber}".Trim();
            return string.IsNullOrWhiteSpace(street)
                ? $"Sucursal Correo Argentino {agency.Name} ({agency.Code})"
                : $"Sucursal Correo Argentino {agency.Name} ({agency.Code}) — {street}, {addr!.Locality ?? addr.City}";
        }
        catch (MiCorreoException)
        {
            return fallback;
        }
    }

    internal static object ShippingDto(ShippingMethod m) => new
    {
        m.Id,
        m.Name,
        kind = m.Kind.ToString().ToUpperInvariant(),
        price = ApiJson.MoneyJson(m.Price),
        m.Description,
        m.PickupAddress,
        m.Active,
        m.SortOrder,
        // "Gratis desde $X" (null = siempre cobra su precio): el checkout lo
        // muestra y el submit lo aplica con el subtotal del servidor.
        freeAbove = m.FreeAbove is { } f ? ApiJson.MoneyJson(f) : null,
    };

    private static object ToDto(CheckoutSession session) => new
    {
        session.Id,
        status = session.Status.ToString().ToUpperInvariant(),
        session.Email,
        session.Currency,
        session.ExpiresAtUtc,
        items = session.Items.Select(i => new
        {
            i.VariantId,
            i.ProductName,
            i.VariantDescription,
            i.Sku,
            i.Quantity,
            unitPrice = ApiJson.MoneyJson(i.UnitPrice),
            lineTotal = ApiJson.MoneyJson(i.LineTotal),
            i.ReservationId,
        }),
        subtotal = ApiJson.MoneyJson(session.Subtotal),
        shipping = ApiJson.MoneyJson(session.ShippingCost),
        shippingMethod = session.ShippingMethodName,
        shippingAddress = session.ShippingAddress,
    };
    // --------------------------------------------------- Opciones del checkout

    /// <summary>
    /// Qué se le pide y qué se le muestra al comprador. El comercio lo edita
    /// desde el panel y el storefront lo lee sin sesión: son decisiones de la
    /// tienda, no datos de nadie.
    /// </summary>
    private static void MapSettings(RouteGroupBuilder group)
    {
        group.MapGet("/checkout-settings", async (
            ITenantContext tenant, CheckoutDbContext db, WhatsAppNotifier whatsApp, CancellationToken ct) =>
        {
            var s = await db.Settings.AsNoTracking().FirstOrDefaultAsync(ct);
            return Results.Ok(await SettingsDtoAsync(s, tenant.TenantId, whatsApp, ct));
        }).RequireTenant();

        var admin = group.MapGroup("/admin/checkout").RequirePermission(Permission.StoreConfig);

        admin.MapGet("/settings", async (
            ITenantContext tenant, CheckoutDbContext db, WhatsAppNotifier whatsApp, CancellationToken ct) =>
        {
            var s = await db.Settings.AsNoTracking().FirstOrDefaultAsync(ct);
            return Results.Ok(await SettingsDtoAsync(s, tenant.TenantId, whatsApp, ct));
        });

        admin.MapPut("/settings", async (
            CheckoutSettingsRequest request, ITenantContext tenant, CheckoutDbContext db,
            WhatsAppNotifier whatsApp, CancellationToken ct) =>
        {
            var s = await db.Settings.FirstOrDefaultAsync(ct);
            if (s is null)
            {
                s = CheckoutSettings.CreateDefault(tenant.TenantId);
                db.Settings.Add(s);
            }

            s.Update(
                request.SingleColumn, request.RequirePhone, request.RequireDocument,
                request.CustomerNoteEnabled, request.CustomerNoteLabel,
                request.OrderMessageEnabled, request.OrderMessageText);

            await db.SaveChangesAsync(ct);
            return Results.Ok(await SettingsDtoAsync(s, tenant.TenantId, whatsApp, ct));
        });
    }

    /// <summary>
    /// Una tienda que nunca tocó la pantalla no tiene fila: se responden los
    /// valores por defecto en vez de un 404, así el storefront no necesita
    /// saber que la fila puede faltar.
    ///
    /// <para>
    /// <c>whatsAppReminders</c>: si la tienda manda por WhatsApp el recordatorio
    /// de carrito abandonado (conectada y con esa plantilla prendida). Sin eso
    /// el checkout no ofrece el aviso por WhatsApp: no se pide permiso para
    /// algo que nunca va a llegar.
    /// </para>
    /// </summary>
    private static async Task<object> SettingsDtoAsync(
        CheckoutSettings? s, TenantId tenantId, WhatsAppNotifier whatsApp, CancellationToken ct)
    {
        s ??= CheckoutSettings.CreateDefault(tenantId);
        var whatsAppReminders = await whatsApp.IsEnabledAsync(tenantId.Value, WhatsAppNotifier.AbandonedCartType, ct);
        return new
        {
            singleColumn = s.SingleColumn,
            requirePhone = s.RequirePhone,
            requireDocument = s.RequireDocument,
            customerNoteEnabled = s.CustomerNoteEnabled,
            customerNoteLabel = s.CustomerNoteLabel,
            orderMessageEnabled = s.OrderMessageEnabled,
            orderMessageText = s.OrderMessageText,
            whatsAppReminders,
        };
    }

}

public sealed record StartCheckoutRequest(List<CheckoutLineInput>? Lines);

public sealed record CheckoutLineInput(Guid VariantId, int Quantity);

/// <param name="CheckoutId">La compra que el checkout ya tenía abierta (la que devolvió la vez anterior).</param>
public sealed record SaveCheckoutContactRequest(
    Guid? CheckoutId,
    List<CheckoutLineInput>? Lines,
    string? Email,
    string? Name = null,
    string? LastName = null,
    string? Phone = null,
    // El aviso por WhatsApp junto al teléfono: sin tildar (o sin mandar) es que no.
    bool AcceptsWhatsApp = false);

public sealed record SubmitCheckoutRequest(
    string? Email,
    string? Name = null,
    string? LastName = null,
    string? Phone = null,
    string? DocNumber = null,
    string? Notes = null,
    Guid? ShippingMethodId = null,
    string? Address = null,
    string? ShippingQuoteToken = null,
    string? CorreoAgency = null,
    // El aviso por WhatsApp junto al teléfono: sin tildar (o sin mandar) es que no.
    bool AcceptsWhatsApp = false);

public sealed record CheckoutSettingsRequest(
    bool SingleColumn,
    bool RequirePhone,
    bool RequireDocument,
    bool CustomerNoteEnabled,
    string? CustomerNoteLabel,
    bool OrderMessageEnabled,
    string? OrderMessageText);
