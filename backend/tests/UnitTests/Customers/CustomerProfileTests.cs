using Api.Crm;
using Customers.Infrastructure;

namespace UnitTests.Customers;

/// <summary>
/// Reglas de la ficha del cliente que no necesitan base: las etiquetas, el
/// resumen de compras y cuándo una búsqueda se toma como teléfono.
/// </summary>
public class CustomerProfileTests
{
    private static Customer NewCustomer() =>
        Customer.Create(Guid.NewGuid(), "Ana", "ana@test.local", null, null, null).Value;

    [Fact]
    public void SetTags_saca_repetidas_sin_importar_mayusculas_y_conserva_la_primera()
    {
        var c = NewCustomer();
        Assert.True(c.SetTags([" VIP ", "vip", "Mayorista", "", null, "Vip"]).IsSuccess);
        Assert.Equal(["VIP", "Mayorista"], c.Tags);
    }

    [Fact]
    public void SetTags_rechaza_de_mas_y_largas_sin_tocar_las_que_habia()
    {
        var c = NewCustomer();
        c.SetTags(["gimnasio"]);

        var many = Enumerable.Range(1, Customer.MaxTags + 1).Select(i => $"t{i}");
        Assert.Equal("Customer.TooManyTags", c.SetTags(many).Error.Code);
        Assert.Equal("Customer.TagTooLong", c.SetTags([new string('x', Customer.MaxTagLength + 1)]).Error.Code);
        Assert.Equal(["gimnasio"], c.Tags);
    }

    [Fact]
    public void SetPurchaseStats_avisa_solo_si_cambio()
    {
        var c = NewCustomer();
        var at = new DateTime(2026, 8, 1, 12, 0, 0, DateTimeKind.Utc);
        Assert.True(c.SetPurchaseStats(2, 50_000_00, at));
        Assert.False(c.SetPurchaseStats(2, 50_000_00, at));
        Assert.Equal(2, c.OrdersCount);
        Assert.Equal(50_000_00, c.TotalSpentMinor);
        Assert.Equal(at, c.LastOrderAtUtc);
    }

    [Fact]
    public void SetNotes_vacia_la_borra_y_largas_no()
    {
        var c = NewCustomer();
        Assert.True(c.SetNotes("  paga siempre en efectivo ").IsSuccess);
        Assert.Equal("paga siempre en efectivo", c.Notes);
        Assert.True(c.SetNotes("   ").IsSuccess);
        Assert.Null(c.Notes);
        Assert.Equal("Customer.NotesTooLong", c.SetNotes(new string('x', 2001)).Error.Code);
    }

    [Theory]
    [InlineData("11 1234-5678", "1112345678")]
    [InlineData("+54 9 (11) 1234.5678", "5491112345678")]
    [InlineData("123456", "123456")]
    [InlineData("12345", null)] // muy corto: puede ser cualquier cosa
    [InlineData("Juan 1234567", null)] // con letras es un nombre
    [InlineData("ana@test.local", null)]
    [InlineData("", null)]
    public void Digits_reconoce_un_telefono(string query, string? expected) =>
        Assert.Equal(expected, CustomerPhoneSearch.Digits(query));

    [Fact]
    public void PurchaseStats_ticket_promedio_sin_compras_es_cero()
    {
        Assert.Equal(0, default(PurchaseStats).AverageMinor);
        Assert.Equal(25_000_00, new PurchaseStats(2, 50_000_00, null, null).AverageMinor);
    }
}
