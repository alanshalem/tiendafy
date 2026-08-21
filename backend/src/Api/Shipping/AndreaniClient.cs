using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Checkout.Core.Domain;
using SharedKernel.Common;

namespace Api.Shipping;

public sealed class AndreaniException(string message, HttpStatusCode? status = null)
    : CarrierException(message, status);

/// <summary>Tarifa devuelta por Andreani. Los importes vienen como texto y se parsean con punto decimal.</summary>
public sealed record AndreaniRate(decimal TotalWithTax, decimal TotalWithoutTax, decimal AforadoGrams);

/// <summary>Un bulto tal como lo espera la API: kilos y volumen en cm³.</summary>
public sealed record AndreaniPackage(decimal Kilos, int VolumeCm, decimal DeclaredValue);

public sealed record AndreaniShipmentResult(
    string TrackingNumber,
    IReadOnlyList<string> AllTrackingNumbers,
    string? LabelUrl,
    string? BranchName,
    string? RawState);

public sealed record AndreaniTraceEvent(
    DateTime OccurredAtUtc, int StateId, string? State, int? ReasonId, string? Reason, string? Branch);

/// <summary>
/// Cliente de la API de Andreani.
///
/// Cuatro cosas que se verificaron contra la API real y que condicionan todo:
///
/// 1. <b>El path de cotización es <c>/v1/tarifas</c>, no <c>/tarifas</c>.</b> La
///    documentación oficial escribe el segundo; el primero responde 200 y el
///    segundo 403.
/// 2. <b>Cotizar no requiere token.</b> Se puede cotizar antes de tener
///    credenciales; el resto de la API sí las pide.
/// 3. <b>Los importes vienen como string</b> con punto decimal. Parsearlos con
///    la cultura del servidor convierte "5806.97" en 580697.
/// 4. <b>Un código postal inexistente NO da error</b>: devuelve una tarifa
///    genérica. La validación del destino es responsabilidad nuestra.
/// </summary>
public sealed class AndreaniClient(HttpClient http, ILogger<AndreaniClient> logger)
{
    /// <summary>Cotizar es parte del checkout: si tarda, se prefiere no ofrecer la opción a trabar la compra.</summary>
    private static readonly TimeSpan QuoteTimeout = TimeSpan.FromSeconds(6);
    private static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(20);

    /// <summary>
    /// Peso aforado en gramos: el mayor entre el peso real y el volumétrico.
    /// Es lo que Andreani cobra. Se calcula acá además de leerlo de la
    /// respuesta, para poder mostrar el dato antes de cotizar.
    /// </summary>
    public static decimal AforadoGrams(decimal kilos, int volumeCm, decimal factor) =>
        Math.Max(kilos * 1000m, volumeCm * factor);

    /// <summary>
    /// <c>GET /v1/tarifas</c>. Una tarifa por llamada: para ofrecer domicilio y
    /// sucursal hay que llamar dos veces, con un contrato distinto cada vez.
    /// </summary>
    public async Task<AndreaniRate?> QuoteAsync(
        AndreaniConfig config, string contract, string destinationPostalCode,
        IReadOnlyList<AndreaniPackage> packages, CancellationToken ct)
    {
        if (packages.Count == 0) return null;

        var query = new StringBuilder()
            .Append("?cpDestino=").Append(Uri.EscapeDataString(destinationPostalCode))
            .Append("&contrato=").Append(Uri.EscapeDataString(contract));

        if (!string.IsNullOrWhiteSpace(config.ClientCode))
            query.Append("&cliente=").Append(Uri.EscapeDataString(config.ClientCode));
        if (!string.IsNullOrWhiteSpace(config.OriginBranch))
            query.Append("&sucursalOrigen=").Append(Uri.EscapeDataString(config.OriginBranch));

        // El formato bultos[N][campo] es el que entiende la API — se verificó
        // que responde con tarifa real.
        for (var i = 0; i < packages.Count; i++)
        {
            var p = packages[i];
            query.Append($"&bultos[{i}][kilos]=").Append(Num(p.Kilos))
                 .Append($"&bultos[{i}][volumen]=").Append(p.VolumeCm.ToString(CultureInfo.InvariantCulture))
                 .Append($"&bultos[{i}][valorDeclarado]=").Append(Num(p.DeclaredValue));
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(QuoteTimeout);

        try
        {
            // Sin token a propósito: este endpoint no lo pide.
            using var response = await http.GetAsync($"{config.BaseUrl}/v1/tarifas{query}", timeout.Token);
            var body = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Andreani /v1/tarifas devolvió {Status} para el contrato {Contract}: {Body}",
                    (int)response.StatusCode, Logging.LogValue.Safe(contract), Logging.LogValue.Safe(body, 200));
                return null;
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (!root.TryGetProperty("tarifaConIva", out var withTax)) return null;

            return new AndreaniRate(
                Decimal(withTax, "total"),
                root.TryGetProperty("tarifaSinIva", out var withoutTax) ? Decimal(withoutTax, "total") : 0m,
                ParseDecimal(JsonRead.GetString(root, "pesoAforado")));
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException or TaskCanceledException or JsonException)
        {
            // El checkout nunca se cae por el cotizador: sin tarifa, no se
            // ofrece la opción y se sigue con los demás medios de envío.
            logger.LogWarning(ex, "Andreani no pudo cotizar el contrato {Contract}.", Logging.LogValue.Safe(contract));
            return null;
        }
    }

    /// <summary>
    /// <c>POST /login</c>. El token vuelve en un header de respuesta, no en el
    /// cuerpo, y se reenvía en <c>x-authorization-token</c> — no como Bearer.
    /// </summary>
    public async Task<string> LoginAsync(AndreaniConfig config, string password, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(DefaultTimeout);

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{config.BaseUrl}/login");
        var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{config.Username}:{password}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);

        using var response = await http.SendAsync(request, timeout.Token);
        if (!response.IsSuccessStatusCode)
        {
            throw new AndreaniException(response.StatusCode switch
            {
                HttpStatusCode.Unauthorized => "Usuario o contraseña de Andreani incorrectos.",
                // Andreani restringe por IP en algunos contratos: un 403 con
                // credenciales buenas suele ser eso, no un permiso del usuario.
                HttpStatusCode.Forbidden => "Andreani rechazó la conexión. Puede faltar habilitar la IP del servidor.",
                _ => "No se pudo conectar con Andreani.",
            }, response.StatusCode);
        }

        if (!response.Headers.TryGetValues("x-authorization-token", out var values))
            throw new AndreaniException("Andreani no devolvió el token de acceso.");

        return values.FirstOrDefault() ?? throw new AndreaniException("Andreani devolvió un token vacío.");
    }

    /// <summary>
    /// <c>POST /ordenes-de-envio</c>. <b>Sin reintentos.</b> Andreani no tiene
    /// idempotencia ni endpoint de cancelación: reintentar un timeout puede
    /// generar un segundo envío que no se puede anular y que se factura igual.
    /// </summary>
    public async Task<AndreaniShipmentResult> CreateShipmentAsync(
        AndreaniConfig config, string token, object payload, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(DefaultTimeout);

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{config.BaseUrl}/ordenes-de-envio")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload, ApiJson.Web), Encoding.UTF8, "application/json"),
        };
        request.Headers.TryAddWithoutValidation("x-authorization-token", token);

        using var response = await http.SendAsync(request, timeout.Token);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            logger.LogError("Andreani rechazó la orden de envío con {Status}: {Body}",
                (int)response.StatusCode, Logging.LogValue.Safe(body, 400));
            throw new AndreaniException(DescribeError(body, response.StatusCode), response.StatusCode);
        }

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;

        // Hay un número de seguimiento POR BULTO, no uno por envío. El del
        // primer bulto es el que se le muestra al comprador; se guardan todos.
        var numbers = new List<string>();
        string? labelUrl = null;

        if (root.TryGetProperty("bultos", out var bultos) && bultos.ValueKind == JsonValueKind.Array)
        {
            foreach (var bulto in bultos.EnumerateArray())
            {
                if (JsonRead.GetString(bulto, "numeroDeEnvio") is { Length: > 0 } number)
                    numbers.Add(number);

                // La URL de la etiqueta se toma tal cual viene: el path cambió
                // entre versiones de la API y armarlo a mano es un 404 seguro.
                if (labelUrl is null && bulto.TryGetProperty("linking", out var linking)
                    && linking.ValueKind == JsonValueKind.Array)
                {
                    labelUrl = linking.EnumerateArray()
                        .Where(l => string.Equals(JsonRead.GetString(l, "meta"), "Etiqueta", StringComparison.OrdinalIgnoreCase))
                        .Select(l => JsonRead.GetString(l, "contenido"))
                        .FirstOrDefault(u => !string.IsNullOrWhiteSpace(u));
                }
            }
        }

        if (numbers.Count == 0)
            throw new AndreaniException("Andreani no devolvió el número de seguimiento del envío.");

        string? branch = null;
        if (root.TryGetProperty("sucursalDeDistribucion", out var sucursal) && sucursal.ValueKind == JsonValueKind.Object)
            branch = JsonRead.GetString(sucursal, "descripcion");

        return new AndreaniShipmentResult(numbers[0], numbers, labelUrl, branch, JsonRead.GetString(root, "estado"));
    }

    /// <summary>Descarga la etiqueta desde la URL que devolvió Andreani.</summary>
    public async Task<byte[]> GetLabelAsync(string labelUrl, string token, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(DefaultTimeout);

        using var request = new HttpRequestMessage(HttpMethod.Get, labelUrl);
        request.Headers.TryAddWithoutValidation("x-authorization-token", token);

        using var response = await http.SendAsync(request, timeout.Token);
        if (!response.IsSuccessStatusCode)
            throw new AndreaniException("No se pudo descargar la etiqueta de Andreani.", response.StatusCode);

        return await response.Content.ReadAsByteArrayAsync(ct);
    }

    /// <summary>
    /// <c>GET /envios/{n}/trazas</c>. Ojo: los campos de esta respuesta
    /// arrancan en MAYÚSCULA (<c>Fecha</c>, <c>EstadoId</c>), al revés que el
    /// resto de la API, y la fecha viene sin zona horaria — es hora de
    /// Argentina.
    /// </summary>
    public async Task<IReadOnlyList<AndreaniTraceEvent>> GetTracesAsync(
        AndreaniConfig config, string token, string trackingNumber, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(DefaultTimeout);

        using var request = new HttpRequestMessage(HttpMethod.Get,
            $"{config.BaseUrl}/envios/{Uri.EscapeDataString(trackingNumber)}/trazas");
        request.Headers.TryAddWithoutValidation("x-authorization-token", token);

        using var response = await http.SendAsync(request, timeout.Token);
        if (!response.IsSuccessStatusCode)
        {
            // El seguimiento requiere habilitación explícita de Andreani por
            // usuario: un 403 acá suele ser eso, no un problema del envío.
            throw new AndreaniException(response.StatusCode == HttpStatusCode.Forbidden
                ? "Andreani no tiene habilitado el seguimiento para este usuario. Pedíselo a tu ejecutivo."
                : "No se pudo consultar el seguimiento en Andreani.", response.StatusCode);
        }

        var body = await response.Content.ReadAsStringAsync(ct);
        using var doc = JsonDocument.Parse(body);
        if (!doc.RootElement.TryGetProperty("eventos", out var eventos) || eventos.ValueKind != JsonValueKind.Array)
            return [];

        return eventos.EnumerateArray().Select(e => new AndreaniTraceEvent(
            ToUtc(JsonRead.GetString(e, "Fecha")),
            e.TryGetProperty("EstadoId", out var sid) && sid.TryGetInt32(out var stateId) ? stateId : 0,
            JsonRead.GetString(e, "Estado"),
            e.TryGetProperty("MotivoId", out var rid) && rid.TryGetInt32(out var reasonId) ? reasonId : null,
            JsonRead.GetString(e, "Motivo"),
            JsonRead.GetString(e, "Sucursal"))).ToList();
    }

    // ----------------------------------------------------------------- Interno

    private static string Num(decimal value) =>
        value.ToString("0.###", CultureInfo.InvariantCulture);

    private static decimal Decimal(JsonElement element, string property) =>
        ParseDecimal(JsonRead.GetString(element, property));

    /// <summary>
    /// Los importes de Andreani son texto con punto decimal. Con la cultura del
    /// servidor, "5806.97" se lee como 580697 — el error clásico y silencioso.
    /// </summary>
    private static decimal ParseDecimal(string? raw) =>
        decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out var value) ? value : 0m;

    /// <summary>Las trazas traen la hora de Argentina sin offset.</summary>
    private static DateTime ToUtc(string? raw) =>
        DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out var local)
            ? DateTime.SpecifyKind(local.AddHours(3), DateTimeKind.Utc)
            : DateTime.UtcNow;

    /// <summary>
    /// Andreani devuelve dos formas de error distintas según el endpoint: un
    /// array de {code, property, message} y un ProblemDetails. Se soportan las
    /// dos porque conviven en la misma API.
    /// </summary>
    private static string DescribeError(string body, HttpStatusCode status)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            if (root.ValueKind == JsonValueKind.Array && root.GetArrayLength() > 0)
            {
                var messages = root.EnumerateArray()
                    .Select(e => JsonRead.GetString(e, "message"))
                    .Where(m => !string.IsNullOrWhiteSpace(m))
                    .Take(3);
                var joined = string.Join(" · ", messages);
                if (!string.IsNullOrWhiteSpace(joined)) return $"Andreani rechazó el envío: {joined}";
            }

            if (root.ValueKind == JsonValueKind.Object
                && JsonRead.GetString(root, "detail") is { Length: > 0 } detail)
            {
                return $"Andreani rechazó el envío: {detail}";
            }
        }
        catch (JsonException)
        {
            // Sin cuerpo interpretable queda el mensaje genérico de abajo.
        }

        return status == HttpStatusCode.BadRequest
            ? "Andreani rechazó los datos del envío. Revisá la dirección y los datos del destinatario."
            : "Andreani no pudo generar el envío en este momento.";
    }
}
