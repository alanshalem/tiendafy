using Checkout.Core.Domain;
using Checkout.Infrastructure.Carriers;
using Orders.Core.Domain;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using SharedKernel.Common;

namespace Api.Fulfillment;

/// <summary>
/// Qué pasó con la etiqueta de una venta: <c>ok</c>, <c>sin-envio</c> (no
/// hay envío creado con un carrier), <c>no-soportado</c> (el carrier no la da
/// por API) o <c>error</c> (el carrier no respondió).
/// </summary>
public sealed record LabelOutcome(Guid OrderId, string Number, string? Carrier, string Status, string? Reason);

public sealed record LabelBatch(IReadOnlyList<LabelOutcome> Results, byte[]? Pdf);

/// <summary>
/// Etiquetas de envío de varias ventas en UN pdf, para imprimirlas de una vez.
///
/// <para>
/// Reusa el código de cada carrier tal cual lo usa el detalle de la venta
/// (login de Andreani y la URL de etiqueta que devolvió al crear el envío;
/// el PDF proxied de Zipnova). Correo Argentino no entrega la etiqueta por
/// API —MiCorreo la imprime desde su web—, y se dice así en vez de fallar.
/// Cada venta va por su lado: un carrier caído no frena las demás etiquetas,
/// y el resultado cuenta qué pasó con cada una.
/// </para>
/// </summary>
public sealed class CarrierLabels(
    FulfillmentService fulfillment,
    IOrderRepository orders,
    IAndreaniRepository andreani,
    IZipnovaRepository zipnova,
    ShippingSecretProtector protector,
    AndreaniClient andreaniClient,
    ZipnovaClient zipnovaClient,
    ILogger<CarrierLabels> logger)
{
    public async Task<LabelBatch> BuildAsync(TenantId tenantId, IReadOnlyList<Guid> orderIds, CancellationToken ct)
    {
        var ids = orderIds.Distinct().Take(FulfillmentService.MaxBatch).ToList();
        var shipments = await fulfillment.ShipmentsAsync(tenantId.Value, ids, ct);
        var results = new List<LabelOutcome>(ids.Count);
        var pdfs = new List<byte[]>();

        // Un login de Andreani por lote, no uno por etiqueta.
        string? andreaniToken = null;
        AndreaniConfig? andreaniConfig = null;
        ZipnovaConfig? zipnovaConfig = null;

        foreach (var id in ids)
        {
            var number = FulfillmentService.Number(id);
            var order = await orders.GetByIdAsync(tenantId, id, ct);
            if (order is null)
            {
                results.Add(new LabelOutcome(id, number, null, "error", "La venta no existe en esta tienda."));
                continue;
            }

            if (!shipments.TryGetValue(id, out var shipment))
            {
                var carrier = Carrier.FromMethodName(order.ShippingMethodName, order.IsPickup);
                results.Add(carrier switch
                {
                    Carrier.Correo => new LabelOutcome(id, number, carrier, "no-soportado",
                        "Correo Argentino no entrega la etiqueta por API: imprimila desde MiCorreo."),
                    Carrier.Pickup => new LabelOutcome(id, number, carrier, "no-soportado",
                        "Es retiro en el local: no lleva etiqueta de envío."),
                    _ => new LabelOutcome(id, number, carrier, "sin-envio",
                        "Todavía no tiene envío creado con un carrier (crealo desde la venta)."),
                });
                continue;
            }

            try
            {
                if (shipment.Carrier == Carrier.Andreani)
                {
                    andreaniConfig ??= await andreani.GetConfigAsync(tenantId.Value, ct);
                    var record = await andreani.GetShipmentByOrderAsync(tenantId.Value, id, ct);
                    if (andreaniConfig is null || record is null || string.IsNullOrWhiteSpace(record.LabelUrl))
                    {
                        results.Add(new LabelOutcome(id, number, shipment.Carrier, "error",
                            "Andreani no devolvió la etiqueta de este envío."));
                        continue;
                    }
                    andreaniToken ??= await andreaniClient.LoginAsync(
                        andreaniConfig, protector.Unprotect(andreaniConfig.PasswordEncrypted), ct);
                    pdfs.Add(await andreaniClient.GetLabelAsync(record.LabelUrl, andreaniToken, ct));
                }
                else
                {
                    zipnovaConfig ??= await zipnova.GetConfigAsync(tenantId.Value, ct);
                    var record = await zipnova.GetShipmentByOrderAsync(tenantId.Value, id, ct);
                    if (zipnovaConfig is null || record is null)
                    {
                        results.Add(new LabelOutcome(id, number, shipment.Carrier, "error",
                            "Zipnova no está configurado en la tienda."));
                        continue;
                    }
                    pdfs.Add(await zipnovaClient.GetLabelPdfAsync(
                        Api.Endpoints.ZipnovaEndpoints.Credentials(zipnovaConfig, protector), record.ShipmentId, ct));
                }
                results.Add(new LabelOutcome(id, number, shipment.Carrier, "ok", null));
            }
            catch (CarrierException ex)
            {
                logger.LogWarning("Etiqueta de {Carrier} falló para la venta {OrderId}: {Message}", shipment.Carrier, id, ex.Message);
                results.Add(new LabelOutcome(id, number, shipment.Carrier, "error", ex.Message));
            }
        }

        return new LabelBatch(results, pdfs.Count == 0 ? null : Merge(pdfs));
    }

    /// <summary>
    /// Une los PDF en uno. QuestPDF opera sobre archivos (qpdf por debajo), así
    /// que pasan por la carpeta temporal y se borran al terminar.
    /// </summary>
    public static byte[] Merge(IReadOnlyList<byte[]> pdfs)
    {
        if (pdfs.Count == 1) return pdfs[0];

        QuestPDF.Settings.License = LicenseType.Community;
        var dir = Path.Combine(Path.GetTempPath(), $"tiendafy-labels-{Guid.NewGuid():N}");
        Directory.CreateDirectory(dir);
        try
        {
            var files = pdfs.Select((bytes, i) =>
            {
                var path = Path.Combine(dir, $"{i:D3}.pdf");
                File.WriteAllBytes(path, bytes);
                return path;
            }).ToList();

            var output = Path.Combine(dir, "merged.pdf");
            var operation = DocumentOperation.LoadFile(files[0]);
            foreach (var file in files.Skip(1)) operation = operation.MergeFile(file);
            operation.Save(output);
            return File.ReadAllBytes(output);
        }
        finally
        {
            try { Directory.Delete(dir, recursive: true); }
            catch (IOException) { /* lo limpia el sistema: no vale romper la descarga por esto */ }
        }
    }
}
