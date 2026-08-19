using Customers.Infrastructure;

namespace UnitTests.Customers;

/// <summary>
/// Reglas de los avisos de favoritos. El corazón es intención de compra: el
/// aviso tiene que llegar cuando de verdad cambió algo, y no convertirse en
/// una cadena de mails que termina en la carpeta de spam.
/// </summary>
public class FavoriteAlertTests
{
    private static readonly DateTime Now = new(2026, 8, 19, 12, 0, 0, DateTimeKind.Utc);

    private static CustomerFavorite Watching(long priceMinor, bool outOfStock = false)
    {
        var favorite = CustomerFavorite.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        favorite.Watch(priceMinor, outOfStock);
        return favorite;
    }

    [Fact]
    public void SinHaberMiradoAntes_NoAvisaNada() =>
        Assert.False(CustomerFavorite.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid())
            .ShouldAlertPriceDrop(1_000_00, Now));

    [Fact]
    public void BajaDeVerdad_Avisa() =>
        Assert.True(Watching(10_000_00).ShouldAlertPriceDrop(8_000_00, Now));

    /// <summary>Una baja de menos del 5 % no le importa a nadie: no se escribe por un redondeo.</summary>
    [Fact]
    public void BajaMinima_NoAvisa() =>
        Assert.False(Watching(10_000_00).ShouldAlertPriceDrop(9_900_00, Now));

    [Fact]
    public void SubidaDePrecio_NoAvisa() =>
        Assert.False(Watching(10_000_00).ShouldAlertPriceDrop(12_000_00, Now));

    [Fact]
    public void AvisadoHaceUnRato_NoVuelveAAvisar()
    {
        var favorite = Watching(10_000_00);
        favorite.MarkAlerted(Now.AddHours(-2));
        Assert.False(favorite.ShouldAlertPriceDrop(5_000_00, Now));
    }

    [Fact]
    public void AlDiaSiguiente_PuedeVolverAAvisar()
    {
        var favorite = Watching(10_000_00);
        favorite.MarkAlerted(Now.AddDays(-2));
        Assert.True(favorite.ShouldAlertPriceDrop(5_000_00, Now));
    }

    [Fact]
    public void VolvioElStock_AvisaSoloSiEstabaAgotado()
    {
        Assert.True(Watching(1_000_00, outOfStock: true).ShouldAlertBackInStock(available: true, Now));
        Assert.False(Watching(1_000_00, outOfStock: false).ShouldAlertBackInStock(available: true, Now));
        Assert.False(Watching(1_000_00, outOfStock: true).ShouldAlertBackInStock(available: false, Now));
    }
}
