using Api.Endpoints;
using Customers.Infrastructure;

namespace UnitTests.Customers;

public class ContactMessageTests
{
    [Fact]
    public void Create_ContactoComun_SinConstancia()
    {
        var m = ContactMessage.Create(Guid.NewGuid(), "Ana", "ANA@Test.com", "Hola");
        Assert.Equal(ContactMessage.KindContact, m.Kind);
        Assert.Null(m.Reference);
        Assert.Null(m.OrderRef);
        Assert.Equal("ana@test.com", m.Email);
    }

    [Fact]
    public void Create_Arrepentimiento_GuardaConstanciaYPedido()
    {
        var m = ContactMessage.Create(
            Guid.NewGuid(), "Ana", "ana@test.com", "Solicitud",
            ContactMessage.KindRepentance, "ARR-ABC234", "  1234  ");
        Assert.Equal(ContactMessage.KindRepentance, m.Kind);
        Assert.Equal("ARR-ABC234", m.Reference);
        Assert.Equal("1234", m.OrderRef);
    }

    [Fact]
    public void Create_KindDesconocido_CaeAContacto()
    {
        var m = ContactMessage.Create(Guid.NewGuid(), "Ana", "a@t.com", "x", "hacker");
        Assert.Equal(ContactMessage.KindContact, m.Kind);
    }

    [Fact]
    public void NewRepentanceReference_FormatoLegibleSinAmbiguos()
    {
        for (var i = 0; i < 50; i++)
        {
            var reference = ContactEndpoints.NewRepentanceReference();
            Assert.Matches("^ARR-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$", reference);
        }
    }
}
