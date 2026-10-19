using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Payments.Infrastructure.MercadoPago;

namespace UnitTests.Payments;

/// <summary>
/// El <c>ts</c> de <c>x-signature</c>: las SDK oficiales lo leen en segundos,
/// un ejemplo de la documentación de Mercado Pago lo muestra en milisegundos.
/// Se aceptan los dos, y cualquier otra cosa es una firma inválida: antes, uno
/// en milisegundos hacía tirar a <c>FromUnixTimeSeconds</c> y el webhook daba 500.
/// </summary>
public class MercadoPagoWebhookSignatureTests
{
    private const string Secret = "secreto-de-prueba";
    private static readonly DateTimeOffset Now = new(2026, 10, 19, 15, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Acepta_el_ts_en_segundos_y_en_milisegundos()
    {
        Assert.True(MercadoPagoWebhookValidator.IsFresh(Now.ToUnixTimeSeconds().ToString(), Now));
        Assert.True(MercadoPagoWebhookValidator.IsFresh(Now.ToUnixTimeMilliseconds().ToString(), Now));
        Assert.True(MercadoPagoWebhookValidator.IsFresh(Now.AddMinutes(-4).ToUnixTimeSeconds().ToString(), Now));
        Assert.True(MercadoPagoWebhookValidator.IsFresh(Now.AddMinutes(4).ToUnixTimeMilliseconds().ToString(), Now));
    }

    [Fact]
    public void Fuera_de_los_cinco_minutos_no_vale()
    {
        Assert.False(MercadoPagoWebhookValidator.IsFresh(Now.AddMinutes(-6).ToUnixTimeSeconds().ToString(), Now));
        Assert.False(MercadoPagoWebhookValidator.IsFresh(Now.AddMinutes(6).ToUnixTimeMilliseconds().ToString(), Now));
    }

    [Theory]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("-1")]
    [InlineData("+1760886000")]
    [InlineData("1760886000.5")]
    [InlineData(" 1760886000")]
    [InlineData("1,760,886,000")]
    [InlineData("0")]
    [InlineData("99999999999")] // segundos del año 5138
    [InlineData("99999999999999999")] // milisegundos imposibles
    [InlineData("999999999999999999")] // 18 dígitos: el máximo que se lee
    [InlineData("9999999999999999999")] // no entra en un long
    [InlineData("123456789012345678901234567890")]
    [InlineData("١٧٦٠٨٨٦٠٠٠")] // dígitos que no son ASCII
    public void Un_ts_ilegible_o_imposible_es_firma_invalida(string ts) =>
        Assert.False(MercadoPagoWebhookValidator.IsFresh(ts, Now));

    [Fact]
    public void Una_firma_buena_con_ts_en_milisegundos_valida_y_una_con_ts_basura_no_tira()
    {
        var validator = new MercadoPagoWebhookValidator(Options.Create(new MercadoPagoOptions { WebhookSecret = Secret }));
        const string body = """{"type":"payment","data":{"id":"123456"}}""";

        var ms = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        Assert.True(validator.Validate(Header(ms, "req-1"), "req-1", null, body).IsValid);

        foreach (var ts in new[] { "99999999999999999", "abc", "9999999999999999999" })
            Assert.False(validator.Validate(Header(ts, "req-2"), "req-2", null, body).IsValid);
    }

    private static string Header(string ts, string requestId)
    {
        var v1 = Convert.ToHexString(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(Secret),
            Encoding.UTF8.GetBytes($"id:123456;request-id:{requestId};ts:{ts};"))).ToLowerInvariant();
        return $"ts={ts},v1={v1}";
    }
}
