using Api.Ai;

namespace UnitTests.Api.Ai;

public sealed class AiConcurrencyTests
{
    [Fact]
    public void TryEnter_dos_veces_la_misma_clave_da_null_hasta_liberar()
    {
        var concurrency = new AiConcurrency();

        var first = concurrency.TryEnter("assistant", "user-1");
        Assert.NotNull(first);
        Assert.Null(concurrency.TryEnter("assistant", "user-1"));

        first.Dispose();
        first.Dispose(); // idempotente

        var second = concurrency.TryEnter("assistant", "user-1");
        Assert.NotNull(second);
        Assert.Null(concurrency.TryEnter("assistant", "user-1"));
        second.Dispose();
    }

    [Fact]
    public void Otra_clave_u_otro_alcance_no_chocan()
    {
        var concurrency = new AiConcurrency();

        using var a = concurrency.TryEnter("assistant", "x");
        using var b = concurrency.TryEnter("assistant", "y");
        using var c = concurrency.TryEnter("catalog-job", "x");

        Assert.NotNull(a);
        Assert.NotNull(b);
        Assert.NotNull(c);
    }

    [Fact]
    public void Un_dispose_repetido_de_una_entrada_vieja_no_libera_la_nueva()
    {
        var concurrency = new AiConcurrency();

        var old = concurrency.TryEnter("assistant", "u");
        old!.Dispose();
        using var current = concurrency.TryEnter("assistant", "u");
        old.Dispose();

        Assert.Null(concurrency.TryEnter("assistant", "u"));
    }
}
