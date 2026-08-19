using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;

namespace Api.Crm;

/// <summary>
/// Mantiene la agenda de clientes al día con lo que pasa en las ventas: cada
/// compra pagada deja (o completa) la ficha de su comprador.
///
/// Sin esto, "Clientes" mostraba únicamente a los que se habían registrado en
/// la tienda o se habían cargado a mano — el que compraba como invitado no
/// aparecía nunca, aunque su email estuviera en las ventas y las campañas de
/// email sí le llegaran. La pantalla mentía por omisión.
/// </summary>
public sealed class CustomerDirectory(CustomersDbContext db, ILogger<CustomerDirectory> logger)
{
    /// <summary>Alta o actualización a partir de una venta. Devuelve true si tocó la agenda.</summary>
    public async Task<bool> UpsertFromOrderAsync(Order order, CancellationToken ct = default)
    {
        var email = Normalize(order.BuyerEmail);
        if (email is null) return false;

        var tenantId = order.TenantId.Value;
        var existing = await db.Customers
            .FirstOrDefaultAsync(c => c.TenantId == tenantId && c.Email == email, ct);

        if (existing is not null)
        {
            if (!existing.FillMissingContact(order.BuyerName, order.BuyerPhone, order.ShippingAddress))
                return false;
            await db.SaveChangesAsync(ct);
            return true;
        }

        // Sin nombre en la compra, el usuario de su email es mejor que "cliente".
        var name = string.IsNullOrWhiteSpace(order.BuyerName) ? email.Split('@')[0] : order.BuyerName;
        var created = Customer.Create(tenantId, name, email, order.BuyerPhone, order.ShippingAddress, null);
        if (created.IsFailure)
        {
            logger.LogWarning("No se pudo crear el cliente de la venta {OrderId}: {Error}",
                order.Id, created.Error.Code);
            return false;
        }

        db.Customers.Add(created.Value);
        await db.SaveChangesAsync(ct);
        return true;
    }

    /// <summary>
    /// El email con el que se identifica un comprador. El placeholder de las
    /// ventas manuales sin datos no es una persona a la que se le pueda escribir.
    /// </summary>
    private static string? Normalize(string? email)
    {
        var e = email?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(e) || !e.Contains('@') || e.EndsWith("@sin-email.local", StringComparison.Ordinal))
            return null;
        return e;
    }
}
