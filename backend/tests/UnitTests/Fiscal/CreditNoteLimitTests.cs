using Fiscal.Core.Domain;

namespace UnitTests.Fiscal;

/// <summary>
/// Varias notas de crédito por venta: el tope acumulado contra la factura y
/// las claves que evitan emitir dos veces la misma.
/// </summary>
public sealed class CreditNoteLimitTests
{
    // Factura de $12.100, en centavos.
    private const long Factura = 12_100_00;

    [Fact]
    public void Lo_que_queda_descuenta_lo_acreditado_y_lo_que_esta_en_curso()
    {
        Assert.Equal(Factura, CreditNoteLimit.Remaining(Factura, 0, 0));
        Assert.Equal(7_100_00, CreditNoteLimit.Remaining(Factura, 3_000_00, 2_000_00));
        // Nunca negativo, aunque algo viejo se haya pasado.
        Assert.Equal(0, CreditNoteLimit.Remaining(Factura, 13_000_00, 0));
    }

    [Fact]
    public void Un_pedido_a_mano_que_entra_justo_pasa()
    {
        var r = CreditNoteLimit.Check(Factura, 10_000_00, 0, 2_100_00);
        Assert.True(r.IsSuccess);
        Assert.Equal(2_100_00, r.Value);
    }

    [Fact]
    public void Un_pedido_a_mano_que_se_pasa_por_un_centavo_es_un_error_que_dice_cuanto_queda()
    {
        var r = CreditNoteLimit.Check(Factura, 10_000_00, 0, 2_100_01);
        Assert.True(r.IsFailure);
        Assert.Equal(CreditNoteErrors.ExceedsInvoice, r.Error.Code);
        Assert.Contains("2.100,00", r.Error.Message);
    }

    [Fact]
    public void Lo_que_esta_en_curso_tambien_cuenta_para_el_tope()
    {
        // Una NC esperando la respuesta de ARCA puede terminar autorizada.
        var r = CreditNoteLimit.Check(Factura, 0, 12_000_00, 200_00);
        Assert.Equal(CreditNoteErrors.ExceedsInvoice, r.Error.Code);
    }

    [Fact]
    public void Con_la_factura_acreditada_entera_lo_dice()
    {
        var r = CreditNoteLimit.Check(Factura, Factura, 0, 1);
        Assert.Contains("acreditada entera", r.Error.Message);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-100)]
    public void Un_monto_cero_o_negativo_no_es_una_nota_de_credito(long monto)
    {
        Assert.Equal(CreditNoteErrors.InvalidAmount, CreditNoteLimit.Check(Factura, 0, 0, monto).Error.Code);
    }

    [Fact]
    public void Un_reembolso_se_acredita_hasta_lo_que_queda_de_la_factura()
    {
        // Lo devuelto, si entra.
        Assert.Equal(3_000_00, CreditNoteLimit.Clamp(Factura, 0, 0, 3_000_00));
        // Si la factura fue por menos que lo cobrado, hasta lo que queda.
        Assert.Equal(2_100_00, CreditNoteLimit.Clamp(Factura, 10_000_00, 0, 5_000_00));
        // Nada que acreditar: cero (no se encola).
        Assert.Equal(0, CreditNoteLimit.Clamp(Factura, Factura, 0, 5_000_00));
    }

    [Fact]
    public void Los_importes_de_los_comprobantes_pasan_a_centavos_sin_perder_nada()
    {
        Assert.Equal(12_100_00, CreditNoteLimit.ToMinor(12_100.00m));
        Assert.Equal(1_234_57, CreditNoteLimit.ToMinor(1_234.565m)); // al centavo, hacia arriba en la mitad
    }

    [Fact]
    public void El_mismo_reembolso_da_siempre_la_misma_clave_y_otro_da_otra()
    {
        var reembolso = Guid.NewGuid();
        Assert.Equal(CreditNoteKeys.ForRefund(reembolso), CreditNoteKeys.ForRefund(reembolso));
        Assert.NotEqual(CreditNoteKeys.ForRefund(reembolso), CreditNoteKeys.ForRefund(Guid.NewGuid()));

        // El aviso repetido de la pasarela: el mismo tramo, la misma clave.
        Assert.Equal(CreditNoteKeys.ForGatewayRefund(0, 3_000_00), CreditNoteKeys.ForGatewayRefund(0, 3_000_00));
        Assert.NotEqual(CreditNoteKeys.ForGatewayRefund(0, 3_000_00), CreditNoteKeys.ForGatewayRefund(3_000_00, 6_000_00));

        // Las claves de cada origen no se pisan entre sí.
        Assert.NotEqual(CreditNoteKeys.MeliCancellation, CreditNoteKeys.ForManual("abcdef12"));
        Assert.All([CreditNoteKeys.ForRefund(reembolso), CreditNoteKeys.ForGatewayRefund(0, 1), CreditNoteKeys.ForManual(new string('a', 64))],
            k => Assert.True(k.Length <= 100)); // entra en la columna
    }

    [Theory]
    [InlineData("8f14e45f-ceea-4c6b-9b2d-4a1c3e0f7a11", true)]
    [InlineData("abcdefgh", true)]
    [InlineData("corta", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    [InlineData("con espacios adentro", false)]
    public void La_clave_que_manda_el_panel_tiene_que_ser_razonable(string? clave, bool valida)
    {
        Assert.Equal(valida, CreditNoteKeys.IsValidClientKey(clave));
    }
}
