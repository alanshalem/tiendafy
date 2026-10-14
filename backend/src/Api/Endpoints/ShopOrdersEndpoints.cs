using Api.Auth;
using Api.Orders;
using Api.Shipping;
using Api.Shop;
using Checkout.Infrastructure.Persistence;
using Customers.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Los pedidos vistos por el comprador: "Mis pedidos" de su cuenta, el
/// resumen de la página de gracias, "Seguí tu pedido" sin cuenta y sus
/// direcciones guardadas.
/// </summary>
public static class ShopOrdersEndpoints
{
    /// <summary>
    /// La misma respuesta para "no existe", "no es tu email" y "número mal
    /// escrito": quien prueba emails ajenos no tiene que poder saber cuáles
    /// compraron en la tienda.
    /// </summary>
    private static IResult NotFoundGeneric() => Results.Problem(
        title: "Order.NotFound",
        detail: "No encontramos un pedido con esos datos. Revisá el número y el email con el que compraste.",
        statusCode: StatusCodes.Status404NotFound);

    public static RouteGroupBuilder MapShopOrdersEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/shop/orders", async (
            HttpContext http, ITenantContext tenant, CustomersDbContext db, IOrderRepository orders,
            CheckoutDbContext checkout, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var customer = await ShopAuth.ResolveAsync(http, db, ct);
            if (customer is null || string.IsNullOrEmpty(customer.Email)) return Results.Unauthorized();

            var list = await orders.ListByBuyerEmailAsync(tenant.TenantId, customer.Email, ct);
            var tracking = await TrackingByOrderAsync(checkout, tenant.TenantId.Value, list, ct);
            return Results.Ok(new
            {
                items = list.Select(o => new
                {
                    o.Id,
                    o.Number,
                    label = o.Label,
                    status = o.Status.ToString().ToUpperInvariant(),
                    o.Currency,
                    o.CreatedAtUtc,
                    o.PaidAtUtc,
                    o.Tracking,
                    trackingInfo = tracking.GetValueOrDefault(o.Id),
                    o.IsPickup,
                    total = ApiJson.MoneyJson(o.Total),
                    items = o.Items.Select(i => new
                    {
                        i.VariantId,
                        i.ProductName,
                        i.VariantDescription,
                        i.Quantity,
                        unitPrice = ApiJson.MoneyJson(i.UnitPrice),
                    }),
                }),
            });
        });

        // El detalle de un pedido propio (la cuenta del comprador). Un pedido
        // ajeno da 404, igual que uno que no existe.
        group.MapGet("/shop/orders/{id:guid}", async (
            Guid id, HttpContext http, ITenantContext tenant, CustomersDbContext db, IOrderRepository orders,
            OrderTrackingView view, CancellationToken ct) =>
        {
            var order = await OwnOrderAsync(id, http, tenant, db, orders, ct);
            return order is null ? Results.NotFound() : Results.Ok(await view.BuildAsync(order, OrderViewAccess.Owner, ct));
        }).RequireTenant();

        // La factura del pedido propio, la misma que descarga el panel.
        group.MapGet("/shop/orders/{id:guid}/invoice.pdf", async (
            Guid id, string? type, HttpContext http, ITenantContext tenant, CustomersDbContext db, IOrderRepository orders,
            global::Fiscal.Infrastructure.Persistence.FiscalDbContext fiscalDb,
            global::Fiscal.Core.Abstractions.IComprobantePdfRenderer pdf, CancellationToken ct) =>
        {
            var order = await OwnOrderAsync(id, http, tenant, db, orders, ct);
            if (order is null) return Results.NotFound();
            var wantNc = string.Equals(type, "creditnote", StringComparison.OrdinalIgnoreCase);
            return await Api.Fiscal.OrderInvoicePdf.DownloadAsync(fiscalDb, pdf, tenant.TenantId.Value, id, order, wantNc, ct);
        }).RequireTenant();

        // Resumen de la página de "gracias por tu compra". Sin login: el id de
        // la orden es lo que trae la vuelta del pago. Sin teléfono ni DNI, y la
        // dirección solo en las primeras horas (ver OrderTrackingView).
        group.MapGet("/orders/{id:guid}/summary", async (
            Guid id, ITenantContext tenant, IOrderRepository orders, OrderTrackingView view, CancellationToken ct) =>
        {
            var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
            return order is null ? Results.NotFound() : Results.Ok(await view.BuildAsync(order, OrderViewAccess.ById, ct));
        }).RequireTenant();

        // "Seguí tu pedido": email + número de pedido, o el link firmado del
        // mail. Sin cuenta. Con el límite estricto de intentos por IP (el de
        // login), porque email + número es justamente lo que alguien probaría
        // de a miles.
        group.MapPost("/shop/track-order", async (
            TrackOrderRequest req, ITenantContext tenant, IOrderRepository orders, OrderTrackingView view,
            IDataProtectionProvider dp, CancellationToken ct) =>
        {
            Order? order = null;
            if (OrderTrackingToken.Unprotect(dp, req.Token, tenant.TenantId.Value) is { } fromLink)
            {
                order = await orders.GetByIdAsync(tenant.TenantId, fromLink, ct);
            }
            else if (OrderLabel.ParseNumber(req.Number) is { } number && ShopAuth.NormalizeEmail(req.Email) is { } email)
            {
                var candidate = await orders.GetByNumberAsync(tenant.TenantId, number, ct);
                if (candidate is not null && ShopAuth.NormalizeEmail(candidate.BuyerEmail) == email)
                    order = candidate;
            }

            return order is null
                ? NotFoundGeneric()
                : Results.Ok(await view.BuildAsync(order, OrderViewAccess.Tracking, ct));
        }).RequireTenant().RequireRateLimiting("auth");

        MapAddresses(group);
        return group;
    }

    /// <summary>El pedido, solo si es del comprador logueado (por su email, como "Mis pedidos").</summary>
    private static async Task<Order?> OwnOrderAsync(
        Guid id, HttpContext http, ITenantContext tenant, CustomersDbContext db, IOrderRepository orders, CancellationToken ct)
    {
        var customer = await ShopAuth.ResolveAsync(http, db, ct);
        if (customer is null || string.IsNullOrEmpty(customer.Email)) return null;
        var order = await orders.GetByIdAsync(tenant.TenantId, id, ct);
        return order is not null && string.Equals(order.BuyerEmail.Trim(), customer.Email.Trim(), StringComparison.OrdinalIgnoreCase)
            ? order
            : null;
    }

    /// <summary>
    /// El seguimiento de cada pedido de la lista, con los envíos de Andreani y
    /// Zipnova en dos consultas para toda la página (no una por pedido).
    /// </summary>
    private static async Task<Dictionary<Guid, CarrierTracking?>> TrackingByOrderAsync(
        CheckoutDbContext checkout, Guid tenantId, IReadOnlyList<Order> list, CancellationToken ct)
    {
        var ids = list.Select(o => o.Id).ToList();
        var andreani = await checkout.AndreaniShipments.AsNoTracking()
            .Where(s => s.TenantId == tenantId && ids.Contains(s.OrderId))
            .Select(s => new { s.OrderId, s.TrackingNumber })
            .ToListAsync(ct);
        var zipnova = await checkout.ZipnovaShipments.AsNoTracking()
            .Where(s => s.TenantId == tenantId && ids.Contains(s.OrderId))
            .OrderByDescending(s => s.CreatedAtUtc)
            .Select(s => new { s.OrderId, s.CarrierName, s.CarrierTrackingId, s.TrackingUrl })
            .ToListAsync(ct);

        return list.ToDictionary(o => o.Id, o =>
        {
            var a = andreani.FirstOrDefault(s => s.OrderId == o.Id);
            var z = zipnova.FirstOrDefault(s => s.OrderId == o.Id);
            return CarrierTrackingLink.For(o.Tracking, o.ShippingMethodName, a?.TrackingNumber,
                z is null ? null : (z.CarrierName, z.CarrierTrackingId, z.TrackingUrl));
        });
    }

    // ------------------------------------------------- Direcciones guardadas

    /// <summary>
    /// Las direcciones del comprador logueado. Todas se resuelven por SU id de
    /// cliente: el id de una dirección ajena da 404 aunque exista.
    /// </summary>
    private static void MapAddresses(RouteGroupBuilder group)
    {
        var addresses = group.MapGroup("/shop/addresses").RequireTenant();

        addresses.MapGet("/", async (HttpContext http, CustomersDbContext db, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, db, ct);
            if (customer is null) return Results.Unauthorized();
            return Results.Ok(new { items = (await ListAsync(db, customer.Id, ct)).Select(AddressDto) });
        });

        addresses.MapPost("/", async (CustomerAddressRequest req, HttpContext http, CustomersDbContext db, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, db, ct);
            if (customer is null) return Results.Unauthorized();
            var data = req.ToData();
            if (CustomerAddress.Validate(data) is { } problem)
                return Error.Validation("Address.Incomplete", problem).ToProblem();

            var existing = await ListAsync(db, customer.Id, ct);
            if (existing.Count >= CustomerAddress.MaxPerCustomer)
                return Error.Validation("Address.TooMany",
                    $"Podés guardar hasta {CustomerAddress.MaxPerCustomer} direcciones. Borrá una que ya no uses.").ToProblem();

            // La primera queda como predeterminada; después, solo si la pide.
            var makeDefault = existing.Count == 0 || req.IsDefault;
            if (makeDefault) foreach (var a in existing) a.SetDefault(false);

            var created = CustomerAddress.Create(customer.TenantId, customer.Id, data, makeDefault);
            db.CustomerAddresses.Add(created);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/shop/addresses/{created.Id}", AddressDto(created));
        });

        addresses.MapPut("/{id:guid}", async (Guid id, CustomerAddressRequest req, HttpContext http, CustomersDbContext db, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, db, ct);
            if (customer is null) return Results.Unauthorized();
            var data = req.ToData();
            if (CustomerAddress.Validate(data) is { } problem)
                return Error.Validation("Address.Incomplete", problem).ToProblem();

            var all = await ListAsync(db, customer.Id, ct);
            var address = all.FirstOrDefault(a => a.Id == id);
            if (address is null) return Results.NotFound();

            address.Update(data);
            if (req.IsDefault && !address.IsDefault)
            {
                foreach (var a in all) a.SetDefault(false);
                address.SetDefault(true);
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(AddressDto(address));
        });

        addresses.MapPost("/{id:guid}/default", async (Guid id, HttpContext http, CustomersDbContext db, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, db, ct);
            if (customer is null) return Results.Unauthorized();
            var all = await ListAsync(db, customer.Id, ct);
            var address = all.FirstOrDefault(a => a.Id == id);
            if (address is null) return Results.NotFound();
            foreach (var a in all) a.SetDefault(a.Id == id);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { items = all.Select(AddressDto) });
        });

        addresses.MapDelete("/{id:guid}", async (Guid id, HttpContext http, CustomersDbContext db, CancellationToken ct) =>
        {
            var customer = await ShopAuth.ResolveAsync(http, db, ct);
            if (customer is null) return Results.Unauthorized();
            var all = await ListAsync(db, customer.Id, ct);
            var address = all.FirstOrDefault(a => a.Id == id);
            if (address is null) return Results.NotFound();

            db.CustomerAddresses.Remove(address);
            // Si se fue la predeterminada, pasa a serlo la más reciente: el
            // checkout siempre tiene una para completar si queda alguna.
            if (address.IsDefault && all.Where(a => a.Id != id).OrderByDescending(a => a.UpdatedAtUtc).FirstOrDefault() is { } next)
                next.SetDefault(true);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }

    /// <summary>Las del comprador, la predeterminada primero y después las más usadas recientemente.</summary>
    private static async Task<List<CustomerAddress>> ListAsync(CustomersDbContext db, Guid customerId, CancellationToken ct) =>
        (await db.CustomerAddresses.Where(a => a.CustomerId == customerId).ToListAsync(ct))
            .OrderByDescending(a => a.IsDefault)
            .ThenByDescending(a => a.UpdatedAtUtc)
            .ToList();

    private static object AddressDto(CustomerAddress a) => new
    {
        a.Id,
        a.Label,
        a.Name,
        a.LastName,
        a.Phone,
        doc = a.DocNumber,
        a.Street,
        a.StreetNumber,
        a.Apartment,
        a.City,
        a.Province,
        zip = a.PostalCode,
        a.IsDefault,
    };
}

public sealed record TrackOrderRequest(string? Email, string? Number, string? Token = null);

/// <summary>
/// Una dirección como la escribe el comprador. Los nombres son los del paso de
/// entrega del checkout (doc, zip, streetNumber…), así el checkout la vuelca
/// tal cual en su formulario.
/// </summary>
public sealed record CustomerAddressRequest(
    string? Label,
    string? Name,
    string? LastName,
    string? Phone,
    string? Doc,
    string? Street,
    string? StreetNumber,
    string? Apartment,
    string? City,
    string? Province,
    string? Zip,
    bool IsDefault = false)
{
    public CustomerAddressData ToData() =>
        new(Label, Name, LastName, Phone, Doc, Street, StreetNumber, Apartment, City, Province, Zip);
}
