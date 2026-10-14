using Reviews.Infrastructure;

namespace UnitTests.Reviews;

/// <summary>
/// Reglas de una reseña: qué se publica de quien opina, qué se valida, la
/// aprobación automática y cuándo una denuncia la saca de la tienda.
/// </summary>
public class ProductReviewTests
{
    private static ProductReview Create(int rating = 5, string body = "Muy buen producto, lo recomiendo.", bool autoApprove = true, int photos = 0) =>
        ProductReview.Create(
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            rating, "Título", body, "Ana P.", "ANA@mail.com ", "Mate", null,
            [.. Enumerable.Range(0, photos).Select(i => $"https://cdn/x/{i}.jpg")], autoApprove).Value;

    [Theory]
    [InlineData("ana maría pérez", "Ana P.")]
    [InlineData("  JUAN  ", "Juan")]
    [InlineData("Lucía de la Torre", "Lucía T.")]
    [InlineData("", "Comprador")]
    [InlineData(null, "Comprador")]
    [InlineData("123 456", "Comprador")]
    public void El_nombre_publico_es_nombre_e_inicial(string? full, string expected) =>
        Assert.Equal(expected, ProductReview.DisplayName(full));

    [Theory]
    [InlineData(0)]
    [InlineData(6)]
    public void Las_estrellas_van_de_1_a_5(int rating) =>
        Assert.True(ProductReview.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            rating, null, "Un texto suficientemente largo.", "Ana", "a@b.c", "Mate", null, [], true).IsFailure);

    [Fact]
    public void Un_texto_muy_corto_no_es_una_resena() =>
        Assert.True(ProductReview.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            5, null, "  Bueno  ", "Ana", "a@b.c", "Mate", null, [], true).IsFailure);

    [Fact]
    public void Hasta_cuatro_fotos() =>
        Assert.True(ProductReview.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            5, null, "Un texto suficientemente largo.", "Ana", "a@b.c", "Mate", null,
            ["1", "2", "3", "4", "5"], true).IsFailure);

    [Fact]
    public void Sin_aprobacion_automatica_queda_pendiente()
    {
        var review = Create(autoApprove: false);
        Assert.Equal(ReviewStatus.Pending, review.Status);
        Assert.Null(review.ModeratedAtUtc);
        Assert.Equal("ana@mail.com", review.BuyerEmail);
    }

    [Fact]
    public void La_configuracion_decide_desde_cuantas_estrellas_se_publica_sola()
    {
        var settings = ReviewSettings.Defaults(Guid.NewGuid());
        Assert.True(settings.AutoApproves(4));
        Assert.False(settings.AutoApproves(3));
        Assert.True(settings.Update(null, 7, true).IsSuccess);
        Assert.False(settings.AutoApproves(5));
        Assert.True(settings.Update(6, 7, true).IsFailure);
        Assert.True(settings.Update(4, 0, true).IsFailure);
    }

    [Fact]
    public void Tres_denuncias_la_sacan_de_la_tienda_y_aprobarla_las_limpia()
    {
        var review = Create();
        review.CountReport();
        review.CountReport();
        Assert.Equal(ReviewStatus.Approved, review.Status);
        review.CountReport();
        Assert.Equal(ReviewStatus.Pending, review.Status);
        Assert.True(review.Flagged);

        review.Approve();
        Assert.Equal(ReviewStatus.Approved, review.Status);
        Assert.False(review.Flagged);
        Assert.Equal(0, review.ReportCount);
    }

    [Fact]
    public void Una_oculta_no_vuelve_por_denuncias()
    {
        var review = Create();
        review.Hide();
        for (var i = 0; i < 5; i++) review.CountReport();
        Assert.Equal(ReviewStatus.Hidden, review.Status);
    }

    [Fact]
    public void La_respuesta_vacia_se_borra()
    {
        var review = Create();
        Assert.True(review.SetReply("  ¡Gracias!  ").IsSuccess);
        Assert.Equal("¡Gracias!", review.Reply);
        Assert.NotNull(review.RepliedAtUtc);
        Assert.True(review.SetReply("   ").IsSuccess);
        Assert.Null(review.Reply);
        Assert.Null(review.RepliedAtUtc);
        Assert.True(review.SetReply(new string('x', ProductReview.MaxReply + 1)).IsFailure);
    }
}
