using Checkout.Core.Domain;
using Inventory.Contracts;
using SharedKernel.Common;

namespace Checkout.Core.Features.SubmitCheckout;

public sealed record SubmitCheckoutCommand(
    TenantId TenantId,
    Guid SessionId,
    string Email,
    string? BuyerName = null,
    string? BuyerLastName = null,
    string? Phone = null,
    string? DocNumber = null,
    string? Notes = null,
    Guid? ShippingMethodId = null,
    string? ShippingAddress = null,
    QuotedShipping? Quote = null,
    bool AcceptsWhatsApp = false);

/// <summary>
/// Envío cotizado en vivo (Correo Argentino), YA validado por la capa API:
/// el precio salió de un token firmado por el servidor, nunca del cliente.
/// RequiresAddress: entrega a domicilio exige dirección del comprador;
/// retiro en sucursal ya trae la dirección de la sucursal resuelta server-side.
/// ExpectedUnits: unidades cotizadas — si el carrito real difiere, se recotiza.
/// ExpectedCartKey: huella de QUÉ se cotizó (variantes y cantidades, ver
/// CartKey); null si la cotización vino solo con la cantidad de unidades.
/// </summary>
public sealed record QuotedShipping(
    string Name, Money Price, bool RequiresAddress, string? ResolvedAddress, int ExpectedUnits,
    string? ExpectedCartKey = null);

/// <summary>
/// La saga orquestada simple del checkout (sin framework, con disciplina):
/// reservar stock item por item; si CUALQUIERA falla, liberar todas las
/// reservas previas y devolver el error. Todo o nada.
/// </summary>
public sealed class SubmitCheckoutHandler(
    ICheckoutRepository repository,
    IShippingMethodRepository shippingMethods,
    IInventoryService inventory)
{
    public async Task<Result<CheckoutSession>> HandleAsync(SubmitCheckoutCommand command, CancellationToken ct = default)
    {
        var session = await repository.GetByIdAsync(command.TenantId, command.SessionId, ct);
        if (session is null)
            return Result.Failure<CheckoutSession>(Error.NotFound("Checkout", command.SessionId));

        // Vencida primero: a quien vuelve con una compra vencida le sirve saber
        // que tiene que empezar de nuevo, no que "ya no se puede modificar".
        if (session.IsExpired(DateTime.UtcNow))
            return Result.Failure<CheckoutSession>(Error.Conflict(
                "Checkout.Expired", "La compra venció: volvé a empezar desde el carrito."));

        if (session.Status != CheckoutStatus.Open)
            return Result.Failure<CheckoutSession>(Error.Conflict(
                "Checkout.NotOpen", "Esta compra ya no se puede modificar."));

        // Envío cotizado por carrier: el precio sale del quote firmado (capa API).
        if (command.Quote is { } quote)
        {
            // Con peso por variante no alcanza con contar unidades: cambiar
            // medias por discos con la misma cantidad cambia el envío.
            if (quote.ExpectedUnits != session.Items.Sum(i => i.Quantity)
                || (quote.ExpectedCartKey is { } key
                    && key != CartKey.Of(session.Items.Select(i => (i.VariantId, i.Quantity)))))
                return Result.Failure<CheckoutSession>(Error.Validation(
                    "Checkout.QuoteMismatch",
                    "El carrito cambió desde que cotizaste el envío. Volvé a calcularlo."));

            var address = quote.RequiresAddress ? command.ShippingAddress : quote.ResolvedAddress;
            if (quote.RequiresAddress && string.IsNullOrWhiteSpace(address))
                return Result.Failure<CheckoutSession>(Error.Validation(
                    "Checkout.MissingAddress", "Falta la dirección de entrega."));

            var quoted = session.SetQuotedShipping(quote.Name, quote.Price, address);
            if (quoted.IsFailure) return Result.Failure<CheckoutSession>(quoted.Error);
        }
        // Envío: el costo SIEMPRE sale del método persistido, nunca del cliente.
        else if (command.ShippingMethodId is { } methodId)
        {
            var method = await shippingMethods.GetActiveByIdAsync(command.TenantId, methodId, ct);
            if (method is null)
                return Result.Failure<CheckoutSession>(Error.Validation(
                    "Checkout.InvalidShipping", "El medio de envío elegido ya no está disponible."));

            var address = method.Kind == ShippingKind.Pickup ? method.PickupAddress : command.ShippingAddress;
            if (method.Kind == ShippingKind.Delivery && string.IsNullOrWhiteSpace(address))
                return Result.Failure<CheckoutSession>(Error.Validation(
                    "Checkout.MissingAddress", "Falta la dirección de entrega."));

            // "Gratis desde $X" se decide acá, con el subtotal del servidor: el
            // carrito lo anuncia, pero el que cobra es este número.
            var ship = session.SetShipping(method.Id, method.Name, method.PriceFor(session.Subtotal), address);
            if (ship.IsFailure) return Result.Failure<CheckoutSession>(ship.Error);
        }

        session.SetRecipient(command.BuyerName, command.BuyerLastName, command.Phone, command.DocNumber, command.Notes);
        session.SetWhatsAppConsent(command.AcceptsWhatsApp);

        // Fase de reservas, con compensación ante el primer fallo.
        var reserved = new Dictionary<Guid, Guid>(); // variantId → reservationId
        foreach (var item in session.Items)
        {
            var result = await inventory.ReserveAsync(
                command.TenantId.Value, item.VariantId, item.Quantity, ct);

            if (result.IsFailure)
            {
                await CompensateAsync(command.TenantId.Value, reserved.Values, ct);
                return Result.Failure<CheckoutSession>(result.Error.Code == "Stock.Insufficient"
                    ? Error.Conflict("Checkout.OutOfStock",
                        $"'{item.ProductName}' ({item.VariantDescription}) no longer has enough stock.")
                    : result.Error);
            }

            reserved[item.VariantId] = result.Value.Id;
        }

        var submit = session.MarkSubmitted(command.Email, reserved, DateTime.UtcNow);
        if (submit.IsFailure)
        {
            await CompensateAsync(command.TenantId.Value, reserved.Values, ct);
            return Result.Failure<CheckoutSession>(submit.Error);
        }

        await repository.SaveChangesAsync(ct);
        return session;
    }

    private async Task CompensateAsync(Guid tenantId, IEnumerable<Guid> reservationIds, CancellationToken ct)
    {
        foreach (var reservationId in reservationIds)
        {
            // Best effort: si una liberación falla, el job de expiración la
            // levanta en ≤30min — el stock nunca queda colgado para siempre.
            await inventory.ReleaseReservationAsync(tenantId, reservationId, ct);
        }
    }
}
