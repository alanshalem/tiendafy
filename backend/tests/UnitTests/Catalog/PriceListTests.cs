using Catalog.Core.Domain;
using SharedKernel.Common;

namespace UnitTests.Catalog;

/// <summary>
/// Las listas de precios: la regla, la cadena de una lista sobre otra, y los
/// dos casos que dejan precios que nadie puede explicar — el ciclo y el precio
/// escrito a mano que se olvida que está ahí.
/// </summary>
public sealed class PriceListTests
{
    private static readonly TenantId Tenant = TenantId.From(Guid.NewGuid());

    private static PriceList List(
        string name, decimal percent, Guid? basedOn = null, string rounding = PriceRounding.None)
    {
        var list = PriceList.Create(Tenant, name, "ARS").Value;
        var updated = list.Update(name, "ARS", basedOn, percent, rounding, null, true, 0);
        Assert.True(updated.IsSuccess, updated.IsFailure ? updated.Error.Message : null);
        return list;
    }

    [Fact]
    public void La_lista_aplica_su_porcentaje_al_precio_del_producto()
    {
        var mayorista = List("Mayorista", -30);
        var resolver = new PriceResolver([mayorista], []);

        Assert.Equal(70_000, resolver.Resolve(mayorista.Id, Guid.NewGuid(), 100_000));
        // Sin lista, el precio del producto sin tocar.
        Assert.Equal(100_000, resolver.Resolve(null, Guid.NewGuid(), 100_000));
    }

    [Fact]
    public void Una_lista_se_puede_calcular_sobre_otra()
    {
        var mayorista = List("Mayorista", -30);
        var distribuidor = List("Distribuidor", -10, basedOn: mayorista.Id);
        var resolver = new PriceResolver([mayorista, distribuidor], []);

        // 100.000 − 30% = 70.000, y de ahí − 10% = 63.000. No es −40%.
        Assert.Equal(63_000, resolver.Resolve(distribuidor.Id, Guid.NewGuid(), 100_000));
    }

    [Fact]
    public void El_precio_escrito_a_mano_gana_sobre_la_regla_y_se_ve_que_es_a_mano()
    {
        var variant = Guid.NewGuid();
        var mayorista = List("Mayorista", -30);
        var manual = PriceListItem.Create(Tenant, mayorista.Id, variant, 55_000).Value;
        var resolver = new PriceResolver([mayorista], [manual]);

        Assert.Equal(55_000, resolver.Resolve(mayorista.Id, variant, 100_000));
        Assert.True(resolver.Explain(mayorista.Id, variant, 100_000).IsManual);

        // Otra variante de la misma lista sigue la regla.
        Assert.False(resolver.Explain(mayorista.Id, Guid.NewGuid(), 100_000).IsManual);
        Assert.Equal(70_000, resolver.Resolve(mayorista.Id, Guid.NewGuid(), 100_000));
    }

    [Fact]
    public void Un_precio_a_mano_corta_la_cadena_hacia_arriba()
    {
        var variant = Guid.NewGuid();
        var mayorista = List("Mayorista", -30);
        var distribuidor = List("Distribuidor", -10, basedOn: mayorista.Id);
        // Se fija el precio EN la lista mayorista; la de distribuidor sigue
        // calculando su 10% sobre ese número, no sobre el del producto.
        var manual = PriceListItem.Create(Tenant, mayorista.Id, variant, 50_000).Value;
        var resolver = new PriceResolver([mayorista, distribuidor], [manual]);

        Assert.Equal(45_000, resolver.Resolve(distribuidor.Id, variant, 100_000));
    }

    [Fact]
    public void Un_ciclo_no_cuelga_ni_tira_el_catalogo_abajo()
    {
        // Dos listas apuntándose entre sí no se pueden guardar por la API, pero
        // si llegaran así a la base el catálogo tiene que seguir respondiendo.
        var a = PriceList.Create(Tenant, "Lista A", "ARS").Value;
        var b = PriceList.Create(Tenant, "Lista B", "ARS").Value;
        a.Update("Lista A", "ARS", b.Id, -10, PriceRounding.None, null, true, 0);
        b.Update("Lista B", "ARS", a.Id, -10, PriceRounding.None, null, true, 0);

        var resolver = new PriceResolver([a, b], []);
        var price = resolver.Resolve(a.Id, Guid.NewGuid(), 100_000);

        // Cae al precio del producto con los descuentos que alcanzó a aplicar,
        // pero termina: lo que importa es que responde.
        Assert.True(price is > 0 and <= 100_000);
    }

    [Fact]
    public void Guardar_un_ciclo_se_rechaza_antes()
    {
        var a = List("Lista A", -10);
        var b = List("Lista B", -10, basedOn: a.Id);
        var c = List("Lista C", -10, basedOn: b.Id);
        var resolver = new PriceResolver([a, b, c], []);

        // A sobre C cerraría A → C → B → A.
        Assert.True(resolver.CanBaseOn(a.Id, c.Id).IsFailure);
        Assert.True(resolver.CanBaseOn(a.Id, a.Id).IsFailure);

        // Una cadena que no se cierra sí vale.
        var d = List("Lista D", -10);
        Assert.True(resolver.CanBaseOn(d.Id, c.Id).IsSuccess);
        Assert.True(resolver.CanBaseOn(a.Id, null).IsSuccess);
    }

    [Fact]
    public void Una_lista_que_ya_no_existe_devuelve_el_precio_del_producto()
    {
        var resolver = new PriceResolver([], []);
        Assert.Equal(100_000, resolver.Resolve(Guid.NewGuid(), Guid.NewGuid(), 100_000));
    }

    [Fact]
    public void El_redondeo_comercial_se_aplica_despues_del_porcentaje()
    {
        var lista = List("Con terminación", -30, rounding: PriceRounding.NineNinety);
        var resolver = new PriceResolver([lista], []);

        // 123.456 − 30% = 86.419,20 → terminación 990 → 85.990.
        Assert.Equal(85_990_00, resolver.Resolve(lista.Id, Guid.NewGuid(), 123_456_00));
    }

    [Fact]
    public void Ningun_precio_queda_en_cero()
    {
        var lista = List("Casi regalado", -99);
        var resolver = new PriceResolver([lista], []);

        Assert.True(resolver.Resolve(lista.Id, Guid.NewGuid(), 50) >= 1);
    }

    [Fact]
    public void Los_ajustes_imposibles_se_rechazan()
    {
        var lista = PriceList.Create(Tenant, "Lista", "ARS").Value;

        // Regalar no es un descuento.
        Assert.True(lista.Update("Lista", "ARS", null, -100, PriceRounding.None, null, true, 0).IsFailure);
        // Ni multiplicar por seis.
        Assert.True(lista.Update("Lista", "ARS", null, 500, PriceRounding.None, null, true, 0).IsFailure);
        // Un redondeo inventado tampoco.
        Assert.True(lista.Update("Lista", "ARS", null, 10, "raro", null, true, 0).IsFailure);
        // Y una lista sobre sí misma.
        Assert.True(lista.Update("Lista", "ARS", lista.Id, 10, PriceRounding.None, null, true, 0).IsFailure);

        Assert.True(lista.Update("Lista", "ARS", null, 12.5m, PriceRounding.Hundred, null, true, 0).IsSuccess);
        Assert.Equal(12.5m, lista.AdjustmentPercent);
    }

    [Fact]
    public void Un_nombre_vacio_no_crea_lista()
    {
        Assert.True(PriceList.Create(Tenant, "", "ARS").IsFailure);
        Assert.True(PriceList.Create(Tenant, "A", "ARS").IsFailure);
        // Una moneda rara cae a pesos en vez de romper.
        Assert.Equal("ARS", PriceList.Create(Tenant, "Lista", "peso").Value.Currency);
        Assert.Equal("USD", PriceList.Create(Tenant, "Lista", "usd").Value.Currency);
    }
}
