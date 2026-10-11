using Api.Endpoints;

namespace UnitTests.Api;

/// <summary>
/// El saneo de lo que pide el cliente en un listado.
///
/// Estas cuatro líneas estaban copiadas en una docena de endpoints, cada una
/// con su tope escrito a mano. Lo que cuidan es chico y aburrido hasta que
/// falta: sin el techo, <c>?limit=100000</c> se trae la tabla entera a memoria;
/// sin el piso, <c>?limit=0</c> devuelve una página vacía para siempre y el
/// listado "no anda" sin que nada falle.
/// </summary>
public sealed class PagingTests
{
    [Fact]
    public void Sin_parametros_usa_los_valores_por_defecto()
    {
        var (skip, take) = Paging.Window(null, null);
        Assert.Equal(0, skip);
        Assert.Equal(Paging.DefaultLimit, take);
    }

    [Fact]
    public void Un_limite_desmedido_se_corta_en_el_techo()
    {
        Assert.Equal(Paging.MaxLimit, Paging.Window(0, 100_000).Take);
        Assert.Equal(100, Paging.Window(0, 100_000, maxLimit: 100).Take);
    }

    [Fact]
    public void Un_limite_de_cero_o_negativo_no_deja_la_pagina_vacia()
    {
        Assert.Equal(1, Paging.Window(0, 0).Take);
        Assert.Equal(1, Paging.Window(0, -5).Take);
    }

    [Fact]
    public void Un_offset_negativo_es_el_principio()
    {
        Assert.Equal(0, Paging.Window(-10, 20).Skip);
    }

    [Fact]
    public void Lo_que_pide_el_cliente_se_respeta_cuando_es_razonable()
    {
        var (skip, take) = Paging.Window(40, 20);
        Assert.Equal(40, skip);
        Assert.Equal(20, take);
    }

    [Fact]
    public void El_default_tambien_respeta_el_techo()
    {
        // Un endpoint con un default más alto que su propio máximo no puede
        // terminar devolviendo más de lo que dijo que iba a devolver.
        Assert.Equal(10, Paging.Window(0, null, defaultLimit: 50, maxLimit: 10).Take);
    }
}
