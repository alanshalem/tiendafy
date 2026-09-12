using Finance.Infrastructure;

namespace UnitTests.Api;

/// <summary>
/// Las reglas de la cuenta corriente y los recibos.
///
/// Son las que, si fallan, dejan un saldo equivocado sin que nadie se entere
/// hasta que un cliente discute la cuenta. Por eso se prueban las dos
/// direcciones del signo, y sobre todo los límites de lo que se puede imputar.
/// </summary>
public sealed class FinanceLedgerTests
{
    private static readonly Guid Tenant = Guid.NewGuid();
    private static readonly Guid Party = Guid.NewGuid();

    private static LedgerEntry Entry(LedgerEntryKind kind, long amount, PartyKind party = PartyKind.Customer) =>
        LedgerEntry.Create(Tenant, party, Party, kind, amount, "ARS", LedgerDocType.Sale, "Venta #1").Value;

    [Fact]
    public void El_saldo_se_lee_desde_nuestro_lado_en_los_dos_casos()
    {
        // Cliente: le vendimos 1000 y nos pagó 400 → nos debe 600.
        var cliente = new[] { Entry(LedgerEntryKind.Debit, 1000), Entry(LedgerEntryKind.Credit, 400) };
        Assert.Equal(600, cliente.Sum(e => e.SignedAmountMinor));

        // Proveedor: nos facturó 1000 y le pagamos 400 → le debemos 600, y eso
        // se expresa en negativo. Una sola fórmula para los dos.
        var proveedor = new[]
        {
            Entry(LedgerEntryKind.Credit, 1000, PartyKind.Supplier),
            Entry(LedgerEntryKind.Debit, 400, PartyKind.Supplier),
        };
        Assert.Equal(-600, proveedor.Sum(e => e.SignedAmountMinor));
    }

    [Fact]
    public void Un_comprobante_no_se_puede_imputar_mas_de_lo_que_debe()
    {
        var factura = Entry(LedgerEntryKind.Debit, 1000);

        Assert.True(factura.Settle(600).IsSuccess);
        Assert.Equal(400, factura.PendingMinor);

        // Cobrar 500 sobre un saldo de 400 dejaría la factura sobrepagada y el
        // excedente invisible. Se rechaza entero.
        var excedido = factura.Settle(500);
        Assert.True(excedido.IsFailure);
        Assert.Equal(400, factura.PendingMinor);

        Assert.True(factura.Settle(400).IsSuccess);
        Assert.Equal(0, factura.PendingMinor);
    }

    [Fact]
    public void Anular_un_recibo_devuelve_el_pendiente()
    {
        var factura = Entry(LedgerEntryKind.Debit, 1000);
        factura.Settle(1000);
        Assert.Equal(0, factura.PendingMinor);

        factura.Unsettle(1000);
        Assert.Equal(1000, factura.PendingMinor);
    }

    [Fact]
    public void Un_recibo_no_puede_imputar_mas_de_lo_que_cobra()
    {
        var cuenta = Guid.NewGuid();
        var factura = Guid.NewGuid();

        var malo = Receipt.Create(
            Tenant, ReceiptKind.Collection, "REC-0001", PartyKind.Customer, Party, "Cliente", "ARS", null, null,
            payments: [(cuenta, 500)],
            allocations: [(factura, 900)]);

        Assert.True(malo.IsFailure);

        // Imputar de menos sí vale: lo que sobra queda a cuenta.
        var bueno = Receipt.Create(
            Tenant, ReceiptKind.Collection, "REC-0001", PartyKind.Customer, Party, "Cliente", "ARS", null, null,
            payments: [(cuenta, 500)],
            allocations: [(factura, 200)]);

        Assert.True(bueno.IsSuccess);
        Assert.Equal(500, bueno.Value.TotalMinor);
        Assert.Equal(300, bueno.Value.UnallocatedMinor);
    }

    [Fact]
    public void Un_recibo_puede_cobrarse_con_varias_cuentas()
    {
        var efectivo = Guid.NewGuid();
        var banco = Guid.NewGuid();

        var receipt = Receipt.Create(
            Tenant, ReceiptKind.Collection, "REC-0002", PartyKind.Customer, Party, "Cliente", "ARS", null, null,
            payments: [(efectivo, 300), (banco, 700)],
            allocations: []).Value;

        Assert.Equal(1000, receipt.TotalMinor);
        Assert.Equal(2, receipt.Payments.Count);
        Assert.Equal(1000, receipt.UnallocatedMinor);
    }

    [Fact]
    public void Un_recibo_sin_cuenta_no_existe()
    {
        // Sin decir de dónde sale la plata, el movimiento de caja no se puede
        // generar y el recibo sería un papel sin contrapartida.
        var sinCuenta = Receipt.Create(
            Tenant, ReceiptKind.Collection, "REC-0003", PartyKind.Customer, Party, "Cliente", "ARS", null, null,
            payments: [], allocations: []);

        Assert.True(sinCuenta.IsFailure);
    }

    [Fact]
    public void El_saldo_de_una_cuenta_sale_de_sus_movimientos()
    {
        var account = FinancialAccount.Create(Tenant, "Caja local", FinancialAccountKind.Cash, "ARS", 10_000, null).Value;
        var movimientos = new[]
        {
            AccountMovement.Create(Tenant, account.Id, AccountMovementKind.In, 5_000, "ARS", "Cobro").Value,
            AccountMovement.Create(Tenant, account.Id, AccountMovementKind.Out, 2_000, "ARS", "Gasto").Value,
        };

        Assert.Equal(13_000, account.OpeningBalanceMinor + movimientos.Sum(m => m.SignedAmountMinor));
    }

    [Fact]
    public void Un_movimiento_sin_importe_no_se_crea()
    {
        var cero = AccountMovement.Create(Tenant, Guid.NewGuid(), AccountMovementKind.In, 0, "ARS", "Nada");
        Assert.True(cero.IsFailure);

        var negativo = AccountMovement.Create(Tenant, Guid.NewGuid(), AccountMovementKind.Out, -100, "ARS", "Menos");
        Assert.True(negativo.IsFailure);
    }
}
