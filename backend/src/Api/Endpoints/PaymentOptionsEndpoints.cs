using System.Text.Json;
using Api.Auth;
using Api.Orders;
using Api.Storefront;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Persistence;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Payments.Contracts;
using Payments.Core.Domain;
using SharedKernel.Abstractions;
using SharedKernel.Common;
using Themes.Infrastructure;

namespace Api.Endpoints;

/// <summary>
/// Lo que la tienda promete sobre el pago y el envío (descuento por
/// transferencia, cuotas sin interés, envío gratis desde $X) y el ciclo del
/// pago por transferencia o en efectivo: crear la orden, mostrar cómo pagarla,
/// registrar el pago y cancelarla.
/// </summary>
public static class PaymentOptionsEndpoints
{
    public static RouteGroupBuilder MapPaymentOptionsEndpoints(this RouteGroupBuilder group)
    {
        // Lo que el storefront anuncia, de una sola fuente: la ficha, las
        // tarjetas, la barra del carrito y el checkout leen estos números. Sin
        // datos de la cuenta bancaria: esos se ven recién con una orden hecha.
        group.MapGet("/store-offers", async (
            ITenantContext tenant, CheckoutDbContext db, IShippingMethodRepository shippingMethods,
            IMercadoPagoConnectionRepository mp, IPaywayPaymentService payway, CancellationToken ct) =>
        {
            var options = await db.PaymentOptions.AsNoTracking().FirstOrDefaultAsync(ct);
            var methods = await shippingMethods.ListAsync(tenant.TenantId, onlyActive: true, ct);

            // Con varios medios, la barra promete el umbral más bajo: es el que
            // efectivamente le da el envío gratis a quien llegue.
            var cheapest = methods
                .Where(m => m.FreeAbove is not null)
                .OrderBy(m => m.FreeAbove!.Value.AmountInMinorUnits)
                .FirstOrDefault();

            var hasPickup = methods.Any(m => m.Kind == ShippingKind.Pickup);
            var transfer = options?.TransferEnabled == true;
            var cash = options?.CashOnPickupEnabled == true && hasPickup;
            var online = await mp.GetByTenantAsync(tenant.TenantId, ct) is not null
                || (await payway.GetPublicConfigAsync(tenant.TenantId, ct)).Enabled;

            return Results.Ok(new
            {
                // false = la tienda nunca guardó estas opciones: el storefront
                // sigue con los números que tenía el diseño (temas viejos).
                configured = options is not null,
                // Las horas de reserva se le dicen al comprador antes de elegir:
                // "te guardamos los productos 48 h" es parte de la oferta.
                transfer = new
                {
                    enabled = transfer,
                    discountPercent = options?.DiscountPercent ?? 0,
                    holdHours = options?.HoldHours ?? StorePaymentOptions.DefaultHoldHours,
                },
                cashOnPickup = new { enabled = cash },
                installments = new { max = options?.InstallmentsMax ?? 0, note = options?.InstallmentsNote },
                freeShipping = cheapest is null
                    ? null
                    : new { from = ApiJson.MoneyJson(cheapest.FreeAbove!.Value), methodName = cheapest.Name },
                // Sin ningún medio de pago el carrito avisa ANTES de que el
                // comprador llene el checkout, y ofrece escribirle a la tienda.
                canCheckout = online || transfer || cash,
            });
        }).RequireTenant();

        // El descuento y las cuotas viajan con el diseño en el storefront: guardar
        // refresca esa caché para que la ficha muestre lo nuevo al toque.
        var admin = group.MapGroup("/admin/payments/options").RevalidatesStorefront(StorefrontScope.Theme);

        admin.MapGet("/", async (
            ITenantContext tenant, CheckoutDbContext db, ThemesDbContext themes,
            IPaywayPaymentService payway, CancellationToken ct) =>
        {
            var options = await db.PaymentOptions.AsNoTracking().FirstOrDefaultAsync(ct);
            var legacy = await LegacyThemeOffersAsync(themes, ct);
            var paywayConfig = await payway.GetPublicConfigAsync(tenant.TenantId, ct);
            return Results.Ok(AdminDto(options, tenant.TenantId, legacy,
                paywayConfig.Enabled && paywayConfig.InstallmentOptions.Count > 0 ? paywayConfig.InstallmentOptions.Max() : null));
        }).RequirePermission(Permission.PaymentsRead);

        admin.MapPut("/", async (
            PaymentOptionsRequest req, ITenantContext tenant, CheckoutDbContext db, ThemesDbContext themes,
            IPaywayPaymentService payway, CancellationToken ct) =>
        {
            var options = await db.PaymentOptions.FirstOrDefaultAsync(ct);
            if (options is null)
            {
                options = StorePaymentOptions.CreateDefault(tenant.TenantId);
                db.PaymentOptions.Add(options);
            }

            var updated = options.Update(new StorePaymentOptions.Input(
                req.TransferEnabled, req.DiscountPercent, req.BankName, req.AccountHolder, req.HolderTaxId,
                req.Cbu, req.Alias, req.Instructions, req.HoldHours ?? StorePaymentOptions.DefaultHoldHours,
                req.CashOnPickupEnabled, req.InstallmentsMax, req.InstallmentsNote));
            if (updated.IsFailure) return updated.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            var paywayConfig = await payway.GetPublicConfigAsync(tenant.TenantId, ct);
            return Results.Ok(AdminDto(options, tenant.TenantId, await LegacyThemeOffersAsync(themes, ct),
                paywayConfig.Enabled && paywayConfig.InstallmentOptions.Count > 0 ? paywayConfig.InstallmentOptions.Max() : null));
        }).RequirePermission(Permission.PaymentsWrite);

        // ---------------------------------------------- Transferencia / efectivo

        // El comprador eligió transferencia (o efectivo al retirar): la orden
        // nace pendiente, con el descuento calculado acá y el stock guardado.
        group.MapPost("/checkout/{id:guid}/pay-offline", async (
            Guid id, PayOfflineRequest request, ITenantContext tenant, OfflinePaymentService offline,
            CheckoutDbContext db, CancellationToken ct) =>
        {
            if (!OfflinePayments.TryParse(request.Method, out var method))
                return Error.Validation("Payment.BadMethod", "Medio de pago inválido.").ToProblem();

            var placed = await offline.PlaceAsync(tenant.TenantId, id, method, request.CouponCode, request.UtmSource, ct);
            if (placed.IsFailure) return placed.Error.ToProblem();

            var options = await db.PaymentOptions.AsNoTracking().FirstOrDefaultAsync(ct);
            return Results.Ok(OfflinePaymentService.InstructionsDto(placed.Value, options));
        }).RequireTenant().RequireRateLimiting("payments");

        // Cómo pagarla al volver a la página de "listo" o desde el email: va en
        // `paymentInstructions` de la vista del pedido (OrderTrackingView).

        // "Registrar pago": la transferencia llegó o se cobró en el mostrador.
        // Mismo permiso que cargar una venta a mano: es anotar plata que entró
        // por fuera de una pasarela.
        group.MapPost("/orders/{id:guid}/mark-paid", async (
            Guid id, ITenantContext tenant, OfflinePaymentService offline, CancellationToken ct) =>
        {
            var result = await offline.MarkPaidAsync(tenant.TenantId, id, ct);
            if (result.IsFailure)
                return result.Error.Type == ErrorType.NotFound ? Results.NotFound() : result.Error.ToProblem();
            return Results.Ok(OrderEndpoints.ToDto(result.Value));
        }).RequirePermission(Permission.OrdersCreate);

        // Cancelar una transferencia que no va a llegar es el cancelar de
        // cualquier venta pendiente (POST /orders/{id}/cancel): libera el stock.

        return group;
    }

    /// <summary>
    /// Lo que anunciaba el diseño publicado antes de que existiera esta
    /// pantalla. Sirve para dos cosas: proponer esos mismos números la primera
    /// vez (el comercio no tiene que acordarse qué había puesto) y avisarle que
    /// su tienda promete un descuento que el checkout todavía no cobra.
    /// </summary>
    private static async Task<LegacyOffers> LegacyThemeOffersAsync(ThemesDbContext themes, CancellationToken ct)
    {
        var json = await themes.Themes.AsNoTracking().Select(t => t.PublishedConfig).FirstOrDefaultAsync(ct);
        if (string.IsNullOrWhiteSpace(json)) return new LegacyOffers(0, 0, null);
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            int Int(string section, string field) =>
                root.TryGetProperty(section, out var s) && s.ValueKind == JsonValueKind.Object
                && s.TryGetProperty(field, out var v) && v.TryGetInt32(out var n) ? n : 0;
            long? Threshold() =>
                root.TryGetProperty("cart", out var c) && c.ValueKind == JsonValueKind.Object
                && c.TryGetProperty("freeShippingBar", out var bar) && bar.ValueKind == JsonValueKind.True
                && c.TryGetProperty("freeShippingThreshold", out var t) && t.TryGetInt64(out var v) && v > 0 ? v : null;

            return new LegacyOffers(
                Int("productDetail", "cashDiscountPercent"),
                Math.Max(Int("productDetail", "installmentsCount"), Int("productList", "installmentsCount")),
                Threshold());
        }
        catch (JsonException)
        {
            return new LegacyOffers(0, 0, null);
        }
    }

    private sealed record LegacyOffers(int CashDiscountPercent, int Installments, long? FreeShippingThresholdMinor);

    private static object AdminDto(StorePaymentOptions? s, TenantId tenantId, LegacyOffers legacy, int? paywayMaxInstallments)
    {
        var configured = s is not null;
        s ??= StorePaymentOptions.CreateDefault(tenantId);
        return new
        {
            configured,
            transferEnabled = s.TransferEnabled,
            // Sin guardar todavía, se propone lo que ya anunciaba el diseño.
            discountPercent = configured ? s.DiscountPercent : Math.Clamp(legacy.CashDiscountPercent, 0, StorePaymentOptions.MaxDiscountPercent),
            bankName = s.BankName,
            accountHolder = s.AccountHolder,
            holderTaxId = s.HolderTaxId,
            cbu = s.Cbu,
            alias = s.Alias,
            instructions = s.Instructions,
            holdHours = s.HoldHours,
            cashOnPickupEnabled = s.CashOnPickupEnabled,
            installmentsMax = configured ? s.InstallmentsMax : Math.Clamp(legacy.Installments, 0, StorePaymentOptions.MaxInstallments),
            installmentsNote = s.InstallmentsNote,
            legacyTheme = new
            {
                cashDiscountPercent = legacy.CashDiscountPercent,
                installments = legacy.Installments,
                freeShippingThreshold = legacy.FreeShippingThresholdMinor is { } t
                    ? ApiJson.MoneyJson(new Money(t, Money.DefaultCurrency))
                    : null,
            },
            paywayMaxInstallments,
        };
    }
}

public sealed record PayOfflineRequest(string? Method, string? CouponCode, string? UtmSource = null);

public sealed record PaymentOptionsRequest(
    bool TransferEnabled,
    int DiscountPercent,
    string? BankName,
    string? AccountHolder,
    string? HolderTaxId,
    string? Cbu,
    string? Alias,
    string? Instructions,
    int? HoldHours,
    bool CashOnPickupEnabled,
    int InstallmentsMax,
    string? InstallmentsNote);
