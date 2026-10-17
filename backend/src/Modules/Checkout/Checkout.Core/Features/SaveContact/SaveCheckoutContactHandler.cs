using Checkout.Core.Domain;
using Checkout.Core.Features.StartCheckout;
using SharedKernel.Common;

namespace Checkout.Core.Features.SaveContact;

/// <param name="SessionId">La compra que el checkout ya tenía abierta, si alguna.</param>
public sealed record SaveCheckoutContactCommand(
    TenantId TenantId,
    Guid? SessionId,
    IReadOnlyList<StartCheckoutLine> Lines,
    string? Email,
    string? BuyerName = null,
    string? BuyerLastName = null,
    string? Phone = null,
    bool AcceptsWhatsApp = false);

/// <summary>
/// Guarda los datos de contacto que el comprador va dejando en el checkout,
/// antes de pagar. Sigue con la compra que el checkout ya tenía abierta si es
/// la misma (mismos productos y cantidades, todavía abierta); si no, arma una
/// nueva con el carrito de ahora. El pago sale después de esa misma compra.
/// </summary>
public sealed class SaveCheckoutContactHandler(ICheckoutRepository repository, StartCheckoutHandler start)
{
    public async Task<Result<CheckoutSession>> HandleAsync(SaveCheckoutContactCommand command, CancellationToken ct = default)
    {
        // Antes de armar nada: un email que no sirve no deja una compra a medias.
        var email = CheckoutSession.NormalizeEmail(command.Email);
        if (email.IsFailure) return Result.Failure<CheckoutSession>(email.Error);

        var now = DateTime.UtcNow;
        CheckoutSession? session = null;
        if (command.SessionId is { } id
            && await repository.GetByIdAsync(command.TenantId, id, ct) is { } open
            && open.Status == CheckoutStatus.Open && !open.IsExpired(now)
            && open.HasLines(command.Lines.Select(l => (l.VariantId, l.Quantity))))
            session = open;

        if (session is null)
        {
            var started = await start.HandleAsync(new StartCheckoutCommand(command.TenantId, command.Lines), ct);
            if (started.IsFailure) return started;
            session = started.Value;
        }

        var saved = session.SetContact(email.Value, command.BuyerName, command.BuyerLastName,
            command.Phone, command.AcceptsWhatsApp, now);
        if (saved.IsFailure) return Result.Failure<CheckoutSession>(saved.Error);

        await repository.SaveChangesAsync(ct);
        return session;
    }
}
