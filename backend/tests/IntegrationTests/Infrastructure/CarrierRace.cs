namespace IntegrationTests;

/// <summary>
/// Dos pedidos de creación de envío a la vez, como un doble clic o dos
/// operadores despachando la misma venta.
///
/// <para>
/// Para que la carrera sea la peor posible y no dependa de la suerte, el
/// carrier simulado frena al primer pedido ADENTRO de la llamada (ya pasó por
/// "¿hay envío?" y está creando) hasta que el segundo terminó. Si el guard
/// mirara solamente la tabla de envíos, el segundo también llamaría al carrier.
/// </para>
/// </summary>
public static class CarrierRace
{
    public static async Task<(HttpResponseMessage First, HttpResponseMessage Second)> RunAsync(
        FakeHttp http, HttpMethod method, string carrierUrl,
        Func<HttpResponseMessage> carrierResponse, Func<Task<HttpResponseMessage>> send)
    {
        var gate = new ManualResetEventSlim(false);
        var before = http.SentTo(carrierUrl).Count;
        http.On(method, carrierUrl, (_, _) =>
        {
            gate.Wait(TimeSpan.FromSeconds(30));
            return carrierResponse();
        });

        var first = send();
        try
        {
            var deadline = DateTime.UtcNow.AddSeconds(15);
            while (http.SentTo(carrierUrl).Count == before)
            {
                if (first.IsCompleted)
                    Assert.Fail($"El primer pedido terminó sin llegar al carrier: {(int)(await first).StatusCode} " +
                        await (await first).Content.ReadAsStringAsync());
                if (DateTime.UtcNow > deadline) Assert.Fail("El primer pedido nunca llegó al carrier.");
                await Task.Delay(20);
            }

            var second = await send();
            gate.Set();
            return (await first, second);
        }
        finally
        {
            gate.Set();
            // La ruta queda respondiendo sin frenar, para el resto del test.
            http.On(method, carrierUrl, (_, _) => carrierResponse());
        }
    }
}
