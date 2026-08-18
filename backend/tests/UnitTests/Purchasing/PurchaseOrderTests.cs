using Purchasing.Infrastructure;

namespace UnitTests.Purchasing;

public class PurchaseOrderTests
{
    private static PurchaseOrder Draft()
    {
        var po = PurchaseOrder.Create(Guid.NewGuid(), "Proveedor Shenzhen").Value;
        Assert.True(po.UpdateDraft("Proveedor Shenzhen", "CNT-001", null, "USD", 1000m, 90).IsSuccess);
        return po;
    }

    private static readonly Guid VariantA = Guid.NewGuid();
    private static readonly Guid VariantB = Guid.NewGuid();

    private static void SetTwoItems(PurchaseOrder po)
    {
        // A: 100 u × USD 4 = 400 · B: 50 u × USD 8 = 400 → FOB 800, mitades.
        Assert.True(po.SetItems([
            (VariantA, "Disco 15kg", "", "DIS-15", 100, 4m),
            (VariantB, "Disco 25kg", "", "DIS-25", 50, 8m),
        ]).IsSuccess);
    }

    [Fact]
    public void LandedCost_prorates_expenses_by_fob_value()
    {
        var po = Draft();
        SetTwoItems(po);
        // Flete USD 200 (moneda OC) + despachante ARS 100.000 local.
        Assert.True(po.SetExpenses([("Flete marítimo", 200m, false), ("Despachante", 100_000m, true)]).IsSuccess);

        // Gastos ARS = 200×1000 + 100.000 = 300.000; cada ítem carga 150.000.
        // A: (400×1000 + 150.000)/100 = 5.500 ARS → 550.000 centavos.
        // B: (400×1000 + 150.000)/50 = 11.000 ARS → 1.100.000 centavos.
        var a = po.Items.First(i => i.VariantId == VariantA);
        var b = po.Items.First(i => i.VariantId == VariantB);
        Assert.Equal(550_000, po.LandedUnitCostArsMinor(a));
        Assert.Equal(1_100_000, po.LandedUnitCostArsMinor(b));
    }

    [Fact]
    public void Receive_requires_confirmation_and_marks_quantities()
    {
        var po = Draft();
        SetTwoItems(po);
        Assert.True(po.Receive(new Dictionary<Guid, int>(), null).IsFailure); // draft

        Assert.True(po.AdvanceTo(PurchaseOrderStatus.Confirmed).IsSuccess);
        Assert.True(po.AdvanceTo(PurchaseOrderStatus.InTransit).IsSuccess);

        var result = po.Receive(new Dictionary<Guid, int> { [VariantA] = 90 }, 1200m);
        Assert.True(result.IsSuccess);
        Assert.Equal(PurchaseOrderStatus.Received, po.Status);
        Assert.Equal(1200m, po.ExchangeRate); // TC definitivo pisa el estimado
        Assert.Equal(90, po.Items.First(i => i.VariantId == VariantA).ReceivedQuantity);
        Assert.Equal(50, po.Items.First(i => i.VariantId == VariantB).ReceivedQuantity); // default: lo pedido
    }

    [Fact]
    public void Flow_rejects_backwards_direct_receive_and_editing_after_confirm()
    {
        var po = Draft();
        SetTwoItems(po);
        Assert.True(po.AdvanceTo(PurchaseOrderStatus.Received).IsFailure);   // recibir va por Receive()
        Assert.True(po.AdvanceTo(PurchaseOrderStatus.InCustoms).IsSuccess);  // saltar hacia adelante OK
        Assert.True(po.AdvanceTo(PurchaseOrderStatus.Confirmed).IsFailure);  // atrás no
        Assert.True(po.SetItems([(VariantA, "X", "", "S", 1, 1m)]).IsFailure); // ya no es borrador
    }

    [Fact]
    public void Empty_draft_cannot_confirm_and_received_out_of_range_fails()
    {
        var po = Draft();
        Assert.True(po.AdvanceTo(PurchaseOrderStatus.Confirmed).IsFailure);

        SetTwoItems(po);
        Assert.True(po.AdvanceTo(PurchaseOrderStatus.Confirmed).IsSuccess);
        Assert.True(po.Receive(new Dictionary<Guid, int> { [VariantA] = 101 }, null).IsFailure);
    }
}
