using Checkout.Core.Domain;
using Checkout.Core.Features.SubmitCheckout;
using Inventory.Contracts;
using SharedKernel.Common;
using static UnitTests.TestData;

namespace UnitTests.Checkout;

public class SubmitCheckoutSagaTests
{

    private sealed class FakeCheckoutRepository(CheckoutSession session) : ICheckoutRepository
    {
        public int Saves { get; private set; }
        public Task<CheckoutSession?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default) =>
            Task.FromResult<CheckoutSession?>(session.Id == id ? session : null);
        public Task AddAsync(CheckoutSession s, CancellationToken ct = default) => Task.CompletedTask;
        public Task SaveChangesAsync(CancellationToken ct = default) { Saves++; return Task.CompletedTask; }
    }

    private sealed class FakeInventory : IInventoryService
    {
        /// <summary>VariantIds que fallan con Stock.Insufficient.</summary>
        public HashSet<Guid> OutOfStock { get; } = [];
        /// <summary>VariantIds con stock sin límite: no se reservan.</summary>
        public HashSet<Guid> Unlimited { get; } = [];
        public List<Guid> Reserved { get; } = [];
        public List<Guid> Released { get; } = [];

        public Task<Result<ReservationDto?>> ReserveAsync(Guid tenantId, Guid variantId, int quantity, CancellationToken ct = default)
        {
            if (OutOfStock.Contains(variantId))
                return Task.FromResult(Result.Failure<ReservationDto?>(
                    Error.Conflict("Stock.Insufficient", "No stock.")));
            if (Unlimited.Contains(variantId))
                return Task.FromResult(Result.Success<ReservationDto?>(null));

            var id = Guid.NewGuid();
            Reserved.Add(id);
            return Task.FromResult(Result.Success<ReservationDto?>(
                new ReservationDto(id, variantId, quantity, "ACTIVE", DateTime.UtcNow.AddMinutes(30))));
        }

        public Task<Result> ConfirmReservationAsync(Guid tenantId, Guid reservationId, CancellationToken ct = default) =>
            Task.FromResult(Result.Success());

        public Task<Result> ReleaseReservationAsync(Guid tenantId, Guid reservationId, CancellationToken ct = default)
        {
            Released.Add(reservationId);
            return Task.FromResult(Result.Success());
        }

        public Task<Result> ExtendReservationAsync(Guid tenantId, Guid reservationId, DateTime expiresAtUtc, CancellationToken ct = default) =>
            Task.FromResult(Result.Success());
    }

    private static CheckoutSession TwoItemSession(out Guid variantA, out Guid variantB)
    {
        variantA = Guid.NewGuid();
        variantB = Guid.NewGuid();
        return CheckoutSession.Create(Tenant,
        [
            (variantA, "Bowl", "Chico", "BOWL-CH", Ars(100_000), 1),
            (variantB, "Taza", "Única", "TAZA-01", Ars(50_000), 2),
        ]).Value;
    }

    [Fact]
    public async Task Submit_AllInStock_ReservesEverythingAndSubmits()
    {
        var session = TwoItemSession(out _, out _);
        var inventory = new FakeInventory();
        var repository = new FakeCheckoutRepository(session);
        var handler = new SubmitCheckoutHandler(repository, new FakeShippingMethods(), inventory);

        var result = await handler.HandleAsync(new SubmitCheckoutCommand(Tenant, session.Id, "ana@mail.com"));

        Assert.True(result.IsSuccess);
        Assert.Equal(CheckoutStatus.Submitted, session.Status);
        Assert.Equal(2, inventory.Reserved.Count);
        Assert.Empty(inventory.Released);
        Assert.Equal(1, repository.Saves);
        Assert.False(session.AcceptsWhatsApp); // sin tildar el aviso por WhatsApp, no hay permiso
    }

    [Fact]
    public async Task Submit_guarda_si_el_comprador_acepto_el_aviso_por_WhatsApp()
    {
        var session = TwoItemSession(out _, out _);
        var handler = new SubmitCheckoutHandler(new FakeCheckoutRepository(session), new FakeShippingMethods(), new FakeInventory());

        var result = await handler.HandleAsync(new SubmitCheckoutCommand(Tenant, session.Id, "ana@mail.com", AcceptsWhatsApp: true));

        Assert.True(result.IsSuccess);
        Assert.True(session.AcceptsWhatsApp);
    }

    [Fact]
    public async Task Submit_SecondItemOutOfStock_CompensatesFirstReservation()
    {
        var session = TwoItemSession(out _, out var variantB);
        var inventory = new FakeInventory();
        inventory.OutOfStock.Add(variantB);
        var repository = new FakeCheckoutRepository(session);
        var handler = new SubmitCheckoutHandler(repository, new FakeShippingMethods(), inventory);

        var result = await handler.HandleAsync(new SubmitCheckoutCommand(Tenant, session.Id, "ana@mail.com"));

        Assert.True(result.IsFailure);
        Assert.Equal("Checkout.OutOfStock", result.Error.Code);
        // Lo lee el comprador: en castellano y con el producto que falta.
        Assert.Equal("Ya no queda stock suficiente de «Taza» (Única). Bajá la cantidad o quitalo del carrito para seguir.",
            result.Error.Message);
        Assert.Equal(CheckoutStatus.Open, session.Status); // sin transición
        Assert.Single(inventory.Reserved);                 // la primera se reservó...
        Assert.Equal(inventory.Reserved, inventory.Released); // ...y se compensó exactamente
        Assert.Equal(0, repository.Saves);
    }

    [Fact]
    public async Task Submit_con_stock_sin_limite_no_reserva_esa_linea()
    {
        var session = TwoItemSession(out var variantA, out var variantB);
        var inventory = new FakeInventory();
        inventory.Unlimited.Add(variantA);
        var handler = new SubmitCheckoutHandler(new FakeCheckoutRepository(session), new FakeShippingMethods(), inventory);

        var result = await handler.HandleAsync(new SubmitCheckoutCommand(Tenant, session.Id, "ana@mail.com"));

        Assert.True(result.IsSuccess);
        Assert.Equal(CheckoutStatus.Submitted, session.Status);
        Assert.Null(session.Items.Single(i => i.VariantId == variantA).ReservationId);
        Assert.Equal(inventory.Reserved.Single(), session.Items.Single(i => i.VariantId == variantB).ReservationId);
    }

    [Fact]
    public async Task Submit_InvalidEmail_CompensatesAllReservations()
    {
        var session = TwoItemSession(out _, out _);
        var inventory = new FakeInventory();
        var repository = new FakeCheckoutRepository(session);
        var handler = new SubmitCheckoutHandler(repository, new FakeShippingMethods(), inventory);

        var result = await handler.HandleAsync(new SubmitCheckoutCommand(Tenant, session.Id, "x"));

        Assert.Equal("Checkout.InvalidEmail", result.Error.Code);
        Assert.Equal(2, inventory.Released.Count); // ambas reservas devueltas
        Assert.Equal(CheckoutStatus.Open, session.Status);
    }

    /// <summary>
    /// Una compra vencida dice que venció (y que hay que volver al carrito),
    /// no "ya no se puede modificar"; y no reserva nada.
    /// </summary>
    [Fact]
    public async Task Submit_Vencida_PideEmpezarDeNuevoSinReservar()
    {
        var session = TwoItemSession(out _, out _);
        session.Expire(session.ExpiresAtUtc);
        var inventory = new FakeInventory();
        var repository = new FakeCheckoutRepository(session);
        var handler = new SubmitCheckoutHandler(repository, new FakeShippingMethods(), inventory);

        var result = await handler.HandleAsync(new SubmitCheckoutCommand(Tenant, session.Id, "ana@mail.com"));

        Assert.Equal("Checkout.Expired", result.Error.Code);
        Assert.Empty(inventory.Reserved);
        Assert.Equal(CheckoutStatus.Expired, session.Status);
    }
}

/// <summary>Sin métodos: el submit sin ShippingMethodId no consulta envíos.</summary>
file sealed class FakeShippingMethods : IShippingMethodRepository
{
    public readonly List<ShippingMethod> Methods = [];

    public Task<ShippingMethod?> GetActiveByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default) =>
        Task.FromResult(Methods.FirstOrDefault(m => m.Id == id && m.Active));

    public Task<ShippingMethod?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default) =>
        Task.FromResult(Methods.FirstOrDefault(m => m.Id == id));

    public Task<IReadOnlyList<ShippingMethod>> ListAsync(TenantId tenantId, bool onlyActive, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<ShippingMethod>>(Methods);

    public Task AddAsync(ShippingMethod method, CancellationToken ct = default) { Methods.Add(method); return Task.CompletedTask; }
    public Task RemoveAsync(ShippingMethod method, CancellationToken ct = default) { Methods.Remove(method); return Task.CompletedTask; }
    public Task SaveChangesAsync(CancellationToken ct = default) => Task.CompletedTask;
}
