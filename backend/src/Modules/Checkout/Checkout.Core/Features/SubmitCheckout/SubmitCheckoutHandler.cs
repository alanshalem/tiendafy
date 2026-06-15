using Checkout.Core.Domain;
using Inventory.Contracts;
using SharedKernel.Common;

namespace Checkout.Core.Features.SubmitCheckout;

public sealed record SubmitCheckoutCommand(TenantId TenantId, Guid SessionId, string Email);

/// <summary>
/// La saga orquestada simple del checkout (sin framework, con disciplina):
/// reservar stock item por item; si CUALQUIERA falla, liberar todas las
/// reservas previas y devolver el error. Todo o nada.
/// </summary>
public sealed class SubmitCheckoutHandler(ICheckoutRepository repository, IInventoryService inventory)
{
    public async Task<Result<CheckoutSession>> HandleAsync(SubmitCheckoutCommand command, CancellationToken ct = default)
    {
        var session = await repository.GetByIdAsync(command.TenantId, command.SessionId, ct);
        if (session is null)
            return Result.Failure<CheckoutSession>(Error.NotFound("Checkout", command.SessionId));

        if (session.Status != CheckoutStatus.Open)
            return Result.Failure<CheckoutSession>(Error.Conflict(
                "Checkout.NotOpen", $"Checkout is {session.Status}."));

        if (session.IsExpired(DateTime.UtcNow))
            return Result.Failure<CheckoutSession>(Error.Conflict(
                "Checkout.Expired", "Checkout session expired. Start again."));

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
