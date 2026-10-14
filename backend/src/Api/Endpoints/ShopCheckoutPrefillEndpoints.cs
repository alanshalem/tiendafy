using System.Text.RegularExpressions;
using Api.Auth;
using Api.Shop;
using Customers.Infrastructure;
using Orders.Core.Domain;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

/// <summary>
/// Los datos con los que arranca el checkout de un comprador con sesión: su
/// nombre, email y teléfono de la cuenta, y lo que usó en su última compra
/// (documento y dirección). Volver a escribir la dirección en cada compra es
/// la fricción que la cuenta tendría que sacar.
/// </summary>
public static partial class ShopCheckoutPrefillEndpoints
{
    public static RouteGroupBuilder MapShopCheckoutPrefillEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/shop/checkout-prefill", async (
            HttpContext http, ITenantContext tenant, CustomersDbContext db, IOrderRepository orders, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var customer = await ShopAuth.ResolveAsync(http, db, ct);
            if (customer is null || string.IsNullOrEmpty(customer.Email)) return Results.Unauthorized();

            var history = await orders.ListByBuyerEmailAsync(tenant.TenantId, customer.Email, ct);
            var last = history.Count > 0 ? history[0] : null;
            // La dirección sale de la última compra con envío a domicilio: un
            // retiro en el local guarda la dirección del local, no la suya.
            var lastDelivery = history.FirstOrDefault(o => !o.IsPickup && !string.IsNullOrWhiteSpace(o.ShippingAddress));

            var (name, lastName) = SplitName(string.IsNullOrWhiteSpace(customer.Name) ? last?.BuyerName : customer.Name);
            return Results.Ok(new
            {
                email = customer.Email,
                name,
                lastName,
                phone = customer.Phone ?? last?.BuyerPhone,
                docNumber = last?.DocNumber,
                address = lastDelivery is null ? null : ParseAddress(lastDelivery.ShippingAddress!),
            });
        });

        return group;
    }

    /// <summary>"Ana María Pérez" → ("Ana María", "Pérez"): el apellido es la última palabra.</summary>
    public static (string? Name, string? LastName) SplitName(string? full)
    {
        var parts = (full ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return parts.Length switch
        {
            0 => (null, null),
            1 => (parts[0], null),
            _ => (string.Join(' ', parts[..^1]), parts[^1]),
        };
    }

    public sealed record PrefillAddress(string Street, string StreetNumber, string Apartment, string City, string Zip);

    /// <summary>
    /// Desarma la dirección de una línea que arma el checkout ("Calle 123,
    /// Depto, Ciudad, CP 1234"). Lo que no se reconoce queda en la calle: el
    /// comprador lo ve y lo corrige, que igual es mejor que escribir todo.
    /// </summary>
    public static PrefillAddress ParseAddress(string line)
    {
        var parts = line.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        var zip = string.Empty;
        if (parts.Count > 0 && parts[^1].StartsWith("CP ", StringComparison.OrdinalIgnoreCase))
        {
            zip = parts[^1][3..].Trim();
            parts.RemoveAt(parts.Count - 1);
        }

        var street = parts.Count > 0 ? parts[0] : string.Empty;
        var number = string.Empty;
        var m = StreetAndNumber().Match(street);
        if (m.Success)
        {
            street = m.Groups[1].Value;
            number = m.Groups[2].Value;
        }

        var rest = parts.Skip(1).ToList();
        var (apartment, city) = rest.Count switch
        {
            0 => (string.Empty, string.Empty),
            1 => (string.Empty, rest[0]),
            _ => (string.Join(", ", rest[..^1]), rest[^1]),
        };
        return new PrefillAddress(street, number, apartment, city, zip);
    }

    [GeneratedRegex(@"^(.*\S)\s+(\d+[A-Za-z]?)$")]
    private static partial Regex StreetAndNumber();
}
