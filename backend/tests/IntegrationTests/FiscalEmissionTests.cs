using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Emission;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// La emisión contra Postgres real y un ARCA simulado que se porta como el de
/// verdad en los días malos: rechaza, se corta después de autorizar, o el
/// proceso muere a mitad de camino.
///
/// Lo que se prueba es lo que cuesta caro si falla: que un rechazo no desfase
/// la numeración para siempre, y que ninguna combinación de cortes termine en
/// dos facturas con CAE para la misma venta.
/// </summary>
[Collection("api")]
public sealed class FiscalEmissionTests
{
    private const string EmisorCuit = "20111111112";
    private readonly ApiFactory _factory;

    public FiscalEmissionTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Un_rechazo_no_desfasa_la_numeracion()
    {
        var arca = new FakeArca();
        var tenant = await SeedTenantAsync();

        // Primera: ARCA la rechaza. El número 1 no se usó.
        arca.Next(ArcaBehavior.Reject);
        var rejected = await EmitAsync(tenant, arca, Guid.NewGuid());
        Assert.True(rejected.IsSuccess);
        Assert.False(rejected.Value.Authorized);
        Assert.Equal(1, rejected.Value.Number);

        // Segunda: tiene que volver a pedir el 1. Antes pedía el 2, ARCA contestaba
        // 10016, y desde ahí ninguna factura salía nunca más.
        arca.Next(ArcaBehavior.Authorize);
        var ok = await EmitAsync(tenant, arca, Guid.NewGuid());
        Assert.True(ok.Value.Authorized);
        Assert.Equal(1, ok.Value.Number);
    }

    [Fact]
    public async Task Un_rechazo_por_observaciones_guarda_el_motivo()
    {
        var arca = new FakeArca();
        var tenant = await SeedTenantAsync();

        arca.Next(ArcaBehavior.RejectWithObservationsOnly);
        var r = await EmitAsync(tenant, arca, Guid.NewGuid());

        Assert.False(r.Value.Authorized);
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
        var doc = await db.Documents.AsNoTracking().SingleAsync(d => d.Id == r.Value.DocumentId);
        Assert.Contains("10242", doc.Observations);
    }

    [Fact]
    public async Task Si_la_respuesta_se_pierde_pero_ARCA_autorizo_no_se_factura_dos_veces()
    {
        var arca = new FakeArca();
        var tenant = await SeedTenantAsync();
        var order = Guid.NewGuid();

        // ARCA autoriza el 1 y la respuesta no llega.
        arca.Next(ArcaBehavior.AuthorizeThenTimeout);
        var first = await EmitAsync(tenant, arca, order);
        Assert.True(first.IsFailure);
        Assert.Equal("Fiscal.AwaitingReconciliation", first.Error.Code);

        // El reintento le pregunta a ARCA, encuentra el 1 autorizado y lo adopta.
        var retry = await EmitAsync(tenant, arca, order);
        Assert.True(retry.IsSuccess);
        Assert.True(retry.Value.Authorized);
        Assert.Equal(1, retry.Value.Number);
        Assert.Equal(arca.CaeOf(1), retry.Value.Cae);

        // Una sola factura en ARCA, un solo pedido de CAE.
        Assert.Equal(1, arca.Last);
        Assert.Equal(1, arca.CaeRequests);
    }

    [Fact]
    public async Task Si_el_pedido_nunca_llego_el_reintento_usa_el_mismo_numero()
    {
        var arca = new FakeArca();
        var tenant = await SeedTenantAsync();
        var order = Guid.NewGuid();

        arca.Next(ArcaBehavior.TimeoutBeforeReaching);
        var first = await EmitAsync(tenant, arca, order);
        Assert.True(first.IsFailure);

        arca.Next(ArcaBehavior.Authorize);
        var retry = await EmitAsync(tenant, arca, order);
        Assert.True(retry.Value.Authorized);
        Assert.Equal(1, retry.Value.Number);
        Assert.Equal(1, arca.Last);
    }

    [Fact]
    public async Task Si_el_proceso_muere_despues_de_que_ARCA_autorizo_el_registro_sobrevive()
    {
        var arca = new FakeArca();
        var tenant = await SeedTenantAsync();
        var order = Guid.NewGuid();

        // El pedido sale, ARCA autoriza, y el proceso revienta antes de guardar
        // la respuesta. Sin write-ahead no quedaba nada que reconciliar y el
        // reintento emitía el 2: dos facturas con CAE para la misma venta.
        arca.Next(ArcaBehavior.AuthorizeThenCrash);
        await Assert.ThrowsAsync<InvalidOperationException>(() => EmitAsync(tenant, arca, order));

        var retry = await EmitAsync(tenant, arca, order);
        Assert.True(retry.Value.Authorized);
        Assert.Equal(1, retry.Value.Number);
        Assert.Equal(1, arca.Last);
    }

    [Fact]
    public async Task Una_venta_no_adopta_el_numero_de_otra()
    {
        var arca = new FakeArca();
        var tenant = await SeedTenantAsync();

        // La venta A pide el 1 y se corta después de que ARCA lo autorizó.
        arca.Next(ArcaBehavior.AuthorizeThenTimeout);
        await EmitAsync(tenant, arca, Guid.NewGuid(), grossMinor: 12_100);

        // La venta B, de otro importe, emite después: reconcilia el 1 (que es de
        // A) y emite el suyo con el 2. No se queda con la factura de A.
        arca.Next(ArcaBehavior.Authorize);
        var b = await EmitAsync(tenant, arca, Guid.NewGuid(), grossMinor: 50_000);
        Assert.True(b.Value.Authorized);
        Assert.Equal(2, b.Value.Number);
        Assert.NotEqual(arca.CaeOf(1), b.Value.Cae);
    }

    [Fact]
    public async Task El_CUIT_que_viaja_a_ARCA_es_el_de_la_configuracion()
    {
        var arca = new FakeArca();
        var tenant = await SeedTenantAsync();

        arca.Next(ArcaBehavior.Authorize);
        await EmitAsync(tenant, arca, Guid.NewGuid());

        // En cada llamada, sin excepción. Es el invariante que, roto, factura a
        // nombre de otro contribuyente con CAE válido.
        Assert.NotEmpty(arca.CuitsSeen);
        Assert.All(arca.CuitsSeen, c => Assert.Equal(EmisorCuit, c));
    }

    [Fact]
    public async Task Facturarse_a_uno_mismo_se_frena_antes_de_llamar_a_ARCA()
    {
        var arca = new FakeArca();
        var tenant = await SeedTenantAsync();

        var r = await EmitAsync(tenant, arca, Guid.NewGuid(), buyerDoc: EmisorCuit);

        Assert.True(r.IsFailure);
        Assert.Equal("Fiscal.SelfInvoice", r.Error.Code);
        Assert.Equal(0, arca.CaeRequests);
    }

    // ---- infraestructura del test --------------------------------------------------

    private async Task<Guid> SeedTenantAsync()
    {
        var tenantId = Guid.NewGuid();
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();

        var cfg = FiscalConfig.Create(tenantId, Cuit.Create(EmisorCuit).Value, "Tienda de prueba",
            FiscalCondition.ResponsableInscripto, FiscalEnvironment.Homologacion);
        db.Configs.Add(cfg);
        db.PointsOfSale.Add(FiscalPointOfSale.Create(tenantId, 1, "Web"));
        await db.SaveChangesAsync();
        return tenantId;
    }

    /// <summary>Cada intento con su propio scope, como cada vuelta del worker.</summary>
    private async Task<Result<EmitInvoiceResult>> EmitAsync(
        Guid tenantId, FakeArca arca, Guid orderId, long grossMinor = 12_100, string? buyerDoc = null)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
        var handler = new EmitInvoiceHandler(db, arca, new FakeAuthenticator(), NullLogger<EmitInvoiceHandler>.Instance);
        return await handler.EmitAsync(new EmitInvoiceCommand(tenantId, orderId, grossMinor, buyerDoc));
    }

    private sealed class FakeAuthenticator : IFiscalAuthenticator
    {
        public Task<Result<FiscalTicket>> GetTicketAsync(
            Guid tenantId, Cuit cuit, string service, FiscalEnvironment environment, CancellationToken ct = default) =>
            Task.FromResult(Result.Success(new FiscalTicket("T", "S", DateTime.UtcNow.AddHours(12))));
    }

    private enum ArcaBehavior
    {
        Authorize,
        Reject,
        RejectWithObservationsOnly,
        AuthorizeThenTimeout,
        TimeoutBeforeReaching,
        AuthorizeThenCrash,
    }

    /// <summary>
    /// Un ARCA en memoria con la regla que importa: solo acepta último+1, y lo
    /// que autoriza queda registrado aunque la respuesta nunca llegue.
    /// </summary>
    private sealed class FakeArca : IFiscalGateway
    {
        private readonly Queue<ArcaBehavior> _behaviors = new();
        private readonly Dictionary<long, (long DocNro, decimal Total, string Cae)> _authorized = [];

        public long Last { get; private set; }
        public int CaeRequests { get; private set; }
        public List<string> CuitsSeen { get; } = [];

        public void Next(ArcaBehavior behavior) => _behaviors.Enqueue(behavior);

        public string CaeOf(long number) => _authorized[number].Cae;

        public Task<Result<FiscalHealth>> CheckHealthAsync(FiscalEnvironment environment, CancellationToken ct = default) =>
            Task.FromResult(Result.Success(new FiscalHealth(true, true, true)));

        public Task<Result<long>> GetLastAuthorizedAsync(
            FiscalTicket auth, Cuit cuit, FiscalEnvironment environment, int ptoVta, CbteTipo cbteTipo, CancellationToken ct = default)
        {
            CuitsSeen.Add(cuit.Value);
            return Task.FromResult(Result.Success(Last));
        }

        public Task<Result<CaeOutcome>> RequestCaeAsync(
            FiscalTicket auth, Cuit cuit, FiscalEnvironment environment,
            int ptoVta, long number, DateOnly cbteFch, InvoiceDraft draft, CancellationToken ct = default)
        {
            CuitsSeen.Add(cuit.Value);
            CaeRequests++;
            var behavior = _behaviors.Count > 0 ? _behaviors.Dequeue() : ArcaBehavior.Authorize;

            if (behavior == ArcaBehavior.TimeoutBeforeReaching)
                return Task.FromResult(Result.Failure<CaeOutcome>(Error.Conflict(FiscalGatewayErrors.Network, "timeout")));

            // La regla de ARCA: exactamente último+1.
            if (number != Last + 1)
                return Task.FromResult(Result.Success(new CaeOutcome("R", null, null, [],
                    [new FiscalMessage("10016", "Numero no correlativo")], "<req/>", "<res/>")));

            switch (behavior)
            {
                case ArcaBehavior.Reject:
                    return Task.FromResult(Result.Success(new CaeOutcome("R", null, null, [],
                        [new FiscalMessage("10015", "Dato invalido")], "<req/>", "<res/>")));
                case ArcaBehavior.RejectWithObservationsOnly:
                    return Task.FromResult(Result.Success(new CaeOutcome("R", null, null,
                        [new FiscalMessage("10242", "Condicion frente al IVA del receptor invalida")], [], "<req/>", "<res/>")));
            }

            var cae = $"75{number:D12}";
            Last = number;
            _authorized[number] = (draft.Receptor.DocNro, draft.ImpTotal, cae);

            return behavior switch
            {
                ArcaBehavior.AuthorizeThenTimeout =>
                    Task.FromResult(Result.Failure<CaeOutcome>(Error.Conflict(FiscalGatewayErrors.Network, "timeout"))),
                ArcaBehavior.AuthorizeThenCrash =>
                    throw new InvalidOperationException("el proceso murió después de que ARCA autorizó"),
                _ => Task.FromResult(Result.Success(new CaeOutcome("A", cae, cbteFch.AddDays(10), [], [], "<req/>", "<res/>"))),
            };
        }

        public Task<Result<ConsultedComprobante?>> ConsultAsync(
            FiscalTicket auth, Cuit cuit, FiscalEnvironment environment,
            int ptoVta, CbteTipo cbteTipo, long number, CancellationToken ct = default)
        {
            CuitsSeen.Add(cuit.Value);
            ConsultedComprobante? found = _authorized.TryGetValue(number, out var a)
                ? new ConsultedComprobante(number, DocTipo.ConsumidorFinal, a.DocNro, a.Total,
                    DateOnly.FromDateTime(DateTime.UtcNow), "A", a.Cae, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10)))
                : null;
            return Task.FromResult(Result.Success(found));
        }

        public Task<Result<IReadOnlyList<ArcaPointOfSale>?>> GetPointsOfSaleAsync(
            FiscalTicket auth, Cuit cuit, FiscalEnvironment environment, CancellationToken ct = default) =>
            Task.FromResult(Result.Success<IReadOnlyList<ArcaPointOfSale>?>(null));
    }
}
