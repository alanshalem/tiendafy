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

    // ------------------------------------------------- umbral y condición de IVA

    /// <summary>El umbral por defecto (RG 5.700/2025): $10.000.000, en centavos.</summary>
    private const long Umbral = 10_000_000_00;

    [Fact]
    public async Task Una_venta_anonima_sobre_el_umbral_no_se_manda_a_ARCA()
    {
        // El umbral se guardaba y nadie lo leía: la factura salía anónima y
        // volvía rechazada. Ahora se corta antes, con un mensaje que dice qué
        // falta, y sin gastar una llamada.
        var arca = new FakeArca();
        var tenant = await SeedTenantAsync();

        var r = await EmitAsync(tenant, arca, Guid.NewGuid(), grossMinor: Umbral);

        Assert.True(r.IsFailure);
        Assert.Equal(EmissionErrors.BuyerIdRequired, r.Error.Code);
        Assert.Contains("10.000.000", r.Error.Message);
        Assert.Equal(0, arca.CaeRequests);
    }

    [Fact]
    public async Task Con_documento_la_misma_venta_se_factura()
    {
        var arca = new FakeArca();
        arca.Next(ArcaBehavior.Authorize);
        var tenant = await SeedTenantAsync();

        var r = await EmitAsync(tenant, arca, Guid.NewGuid(), grossMinor: Umbral, buyerDoc: "30111222");

        Assert.True(r.Value.Authorized);
    }

    [Fact]
    public async Task Por_debajo_del_umbral_sigue_saliendo_anonima()
    {
        var arca = new FakeArca();
        arca.Next(ArcaBehavior.Authorize);
        var tenant = await SeedTenantAsync();

        var r = await EmitAsync(tenant, arca, Guid.NewGuid(), grossMinor: Umbral - 1);

        Assert.True(r.Value.Authorized);
        Assert.Equal(DocTipo.ConsumidorFinal, arca.LastDraft!.Receptor.DocTipo);
    }

    [Fact]
    public async Task La_condicion_declarada_llega_al_comprobante()
    {
        // Una persona física Responsable Inscripto: el CUIT solo dice "persona
        // física", y sin declararlo sale B. Declarado (por el comercio o el
        // padrón), sale A.
        var tenant = await SeedTenantAsync();

        var sinDeclarar = new FakeArca();
        sinDeclarar.Next(ArcaBehavior.Authorize);
        await EmitAsync(tenant, sinDeclarar, Guid.NewGuid(), buyerDoc: "20-12345678-6");
        Assert.Equal(CbteTipo.FacturaB, sinDeclarar.LastDraft!.CbteTipo);

        var otraTienda = await SeedTenantAsync();
        var declarada = new FakeArca();
        declarada.Next(ArcaBehavior.Authorize);
        await EmitAsync(otraTienda, declarada, Guid.NewGuid(), buyerDoc: "20-12345678-6",
            declared: CondicionIvaReceptor.ResponsableInscripto);
        Assert.Equal(CbteTipo.FacturaA, declarada.LastDraft!.CbteTipo);
        Assert.Equal(CondicionIvaReceptor.ResponsableInscripto, declarada.LastDraft.Receptor.Condicion);
    }

    // ------------------------------------------------- nota de crédito

    [Fact]
    public async Task La_NC_de_una_A_declarada_sale_A_al_mismo_receptor()
    {
        // Factura A a un RI persona física: la condición la declaró el comercio
        // (o el padrón). El reembolso encola la NC con el documento de la venta
        // y sin condición: antes salía B, y ARCA la rechaza.
        var arca = new FakeArca();
        var tenant = await SeedTenantAsync();
        var order = Guid.NewGuid();

        var factura = await EmitAsync(tenant, arca, order, buyerDoc: "20-12345678-6",
            declared: CondicionIvaReceptor.ResponsableInscripto);
        Assert.Equal(nameof(CbteTipo.FacturaA), factura.Value.CbteTipo);

        var nc = await EmitAsync(tenant, arca, order, buyerDoc: "20123456786", creditNote: true);

        Assert.True(nc.Value.Authorized);
        Assert.Equal(CbteTipo.NotaCreditoA, arca.LastDraft!.CbteTipo);
        Assert.Equal(new Receptor(DocTipo.Cuit, 20123456786, CondicionIvaReceptor.ResponsableInscripto), arca.LastDraft.Receptor);
        Assert.Equal(new CbteAsoc(CbteTipo.FacturaA, 1, factura.Value.Number), Assert.Single(arca.LastDraft.CbtesAsoc));
    }

    [Fact]
    public async Task La_NC_de_una_B_va_al_documento_con_que_se_facturo()
    {
        // El comercio corrigió el documento al facturar: la venta dice uno, la
        // factura salió con otro. La NC acredita la factura, no la venta.
        var arca = new FakeArca();
        var tenant = await SeedTenantAsync();
        var order = Guid.NewGuid();

        var factura = await EmitAsync(tenant, arca, order, buyerDoc: "30111222");
        Assert.Equal(nameof(CbteTipo.FacturaB), factura.Value.CbteTipo);

        await EmitAsync(tenant, arca, order, buyerDoc: "27999888", creditNote: true);

        Assert.Equal(CbteTipo.NotaCreditoB, arca.LastDraft!.CbteTipo);
        Assert.Equal(new Receptor(DocTipo.Dni, 30111222, CondicionIvaReceptor.ConsumidorFinal), arca.LastDraft.Receptor);
        Assert.Equal(CbteTipo.FacturaB, Assert.Single(arca.LastDraft.CbtesAsoc).Tipo);
    }

    [Fact]
    public async Task La_NC_de_una_C_sale_C()
    {
        var arca = new FakeArca();
        var tenant = await SeedTenantAsync(FiscalCondition.Monotributo);
        var order = Guid.NewGuid();

        var factura = await EmitAsync(tenant, arca, order, buyerDoc: "30111222");
        Assert.Equal(nameof(CbteTipo.FacturaC), factura.Value.CbteTipo);

        await EmitAsync(tenant, arca, order, creditNote: true);

        Assert.Equal(CbteTipo.NotaCreditoC, arca.LastDraft!.CbteTipo);
        Assert.Equal(new Receptor(DocTipo.Dni, 30111222, CondicionIvaReceptor.ConsumidorFinal), arca.LastDraft.Receptor);
        Assert.Empty(arca.LastDraft.Iva);
    }

    [Fact]
    public async Task La_NC_de_Mercado_Libre_sin_documento_copia_el_de_la_factura()
    {
        // La sincronización de Mercado Libre encola la NC sin documento (null):
        // antes eso era consumidor final siempre, aunque la venta se hubiera
        // facturado A a una empresa.
        var arca = new FakeArca();
        var tenant = await SeedTenantAsync();
        var mlSale = Guid.NewGuid();

        await EmitAsync(tenant, arca, mlSale, buyerDoc: "30-71234567-1",
            declared: CondicionIvaReceptor.ResponsableInscripto);
        Assert.Equal(CbteTipo.FacturaA, arca.LastDraft!.CbteTipo);

        await EmitAsync(tenant, arca, mlSale, buyerDoc: null, creditNote: true);

        Assert.Equal(CbteTipo.NotaCreditoA, arca.LastDraft!.CbteTipo);
        Assert.Equal(new Receptor(DocTipo.Cuit, 30712345671, CondicionIvaReceptor.ResponsableInscripto), arca.LastDraft.Receptor);
    }

    [Fact]
    public async Task La_condicion_del_receptor_queda_guardada_en_el_comprobante()
    {
        var arca = new FakeArca();
        var tenant = await SeedTenantAsync();

        var r = await EmitAsync(tenant, arca, Guid.NewGuid(), buyerDoc: "20-12345678-6",
            declared: CondicionIvaReceptor.Monotributo);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
        var doc = await db.Documents.AsNoTracking().SingleAsync(d => d.Id == r.Value.DocumentId);
        Assert.Equal(CondicionIvaReceptor.Monotributo, doc.ReceptorCondicion);
    }

    private async Task<Guid> SeedTenantAsync(FiscalCondition condition = FiscalCondition.ResponsableInscripto)
    {
        var tenantId = Guid.NewGuid();
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();

        var cfg = FiscalConfig.Create(tenantId, Cuit.Create(EmisorCuit).Value, "Tienda de prueba",
            condition, FiscalEnvironment.Homologacion);
        db.Configs.Add(cfg);
        db.PointsOfSale.Add(FiscalPointOfSale.Create(tenantId, 1, "Web"));
        await db.SaveChangesAsync();
        return tenantId;
    }

    /// <summary>Cada intento con su propio scope, como cada vuelta del worker.</summary>
    private async Task<Result<EmitInvoiceResult>> EmitAsync(
        Guid tenantId, FakeArca arca, Guid orderId, long grossMinor = 12_100, string? buyerDoc = null,
        CondicionIvaReceptor? declared = null, bool creditNote = false)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
        var handler = new EmitInvoiceHandler(db, arca, new FakeAuthenticator(), NullLogger<EmitInvoiceHandler>.Instance);
        return await handler.EmitAsync(new EmitInvoiceCommand(
            tenantId, orderId, grossMinor, buyerDoc, CreditNote: creditNote, BuyerIvaCondition: declared));
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

        /// <summary>El último comprobante que se le pidió autorizar.</summary>
        public InvoiceDraft? LastDraft { get; private set; }
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
            LastDraft = draft;
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
