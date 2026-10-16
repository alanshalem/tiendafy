using Orders.Core.Domain;

namespace Api.Fiscal;

/// <summary>
/// Presentación de comprobantes fiscales de una venta (labels, DTO del admin y
/// armado del PdfData). Vivía dentro de OrderEndpoints pero es lógica fiscal,
/// no de órdenes.
/// </summary>
public static class OrderComprobantePresenter
{
    public static bool IsNc(global::Fiscal.Core.Domain.CbteTipo t) =>
        t is global::Fiscal.Core.Domain.CbteTipo.NotaCreditoA
          or global::Fiscal.Core.Domain.CbteTipo.NotaCreditoB
          or global::Fiscal.Core.Domain.CbteTipo.NotaCreditoC;

    public static global::Fiscal.Core.Abstractions.ComprobantePdfData BuildPdfData(
        global::Fiscal.Core.Domain.FiscalDocument doc, Order? order, global::Fiscal.Core.Domain.FiscalConfig cfg)
    {
        var (letra, label) = CbteLabel(doc.CbteTipo);
        var emisorCondition = cfg.Condition == global::Fiscal.Core.Domain.FiscalCondition.Monotributo
            ? "Monotributista" : "Responsable Inscripto";
        // La condición con la que se emitió, no la que sugiere el documento: un
        // CUIL tiene forma de CUIT y su dueño es consumidor final (Factura B).
        var receptorCondition = doc.IssuedReceptor().Condicion switch
        {
            global::Fiscal.Core.Domain.CondicionIvaReceptor.ResponsableInscripto => "Responsable Inscripto",
            global::Fiscal.Core.Domain.CondicionIvaReceptor.Monotributo => "Responsable Monotributo",
            global::Fiscal.Core.Domain.CondicionIvaReceptor.Exento => "IVA Exento",
            _ => "Consumidor Final",
        };

        var items = new List<global::Fiscal.Core.Abstractions.ComprobantePdfItem>();
        if (order is not null)
        {
            foreach (var i in order.Items)
            {
                var name = string.IsNullOrWhiteSpace(i.VariantDescription) ? i.ProductName : $"{i.ProductName} · {i.VariantDescription}";
                items.Add(new global::Fiscal.Core.Abstractions.ComprobantePdfItem(name, i.Quantity, i.LineTotal.ToDecimal()));
            }
            if (order.ShippingCost.AmountInMinorUnits > 0)
                items.Add(new global::Fiscal.Core.Abstractions.ComprobantePdfItem(
                    $"Envío{(string.IsNullOrWhiteSpace(order.ShippingMethodName) ? "" : $" · {order.ShippingMethodName}")}", 1, order.ShippingCost.ToDecimal()));
        }

        return new global::Fiscal.Core.Abstractions.ComprobantePdfData(
            EmisorCuit: long.Parse(cfg.Cuit),
            EmisorName: cfg.BusinessName,
            EmisorConditionLabel: emisorCondition,
            Letra: letra,
            TipoCmp: (int)doc.CbteTipo,
            TipoLabel: label,
            PtoVta: doc.PtoVta,
            Number: doc.Number,
            Fecha: DateOnly.FromDateTime(doc.CreatedAtUtc),
            Cae: doc.Cae ?? "",
            CaeVto: doc.CaeVtoUtc is { } v ? DateOnly.FromDateTime(v) : null,
            TipoDocRec: (int)doc.DocTipo,
            NroDocRec: doc.DocNro,
            ReceptorDocLabel: ReceptorDocLabel(doc.DocTipo, doc.DocNro),
            ReceptorConditionLabel: receptorCondition,
            ImpNeto: doc.ImpNeto,
            ImpIVA: doc.ImpIVA,
            ImpTotal: doc.ImpTotal,
            Currency: "PES",
            Items: items,
            Leyenda: letra == "A" && doc.IssuedReceptor().Condicion == global::Fiscal.Core.Domain.CondicionIvaReceptor.Monotributo
                ? LeyendaMonotributo : null);
    }

    /// <summary>
    /// La que exige la RG 5003 en una A a un monotributista: el IVA discriminado
    /// solo le sirve dentro del régimen de la Ley 27.618.
    /// </summary>
    public const string LeyendaMonotributo =
        "El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del " +
        "Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley Nº 27.618";

    public static (string Letra, string Label) CbteLabel(global::Fiscal.Core.Domain.CbteTipo t) => t switch
    {
        global::Fiscal.Core.Domain.CbteTipo.FacturaA => ("A", "Factura A"),
        global::Fiscal.Core.Domain.CbteTipo.FacturaB => ("B", "Factura B"),
        global::Fiscal.Core.Domain.CbteTipo.FacturaC => ("C", "Factura C"),
        global::Fiscal.Core.Domain.CbteTipo.NotaCreditoA => ("A", "Nota de Crédito A"),
        global::Fiscal.Core.Domain.CbteTipo.NotaCreditoB => ("B", "Nota de Crédito B"),
        global::Fiscal.Core.Domain.CbteTipo.NotaCreditoC => ("C", "Nota de Crédito C"),
        _ => ("B", t.ToString()),
    };

    public static string ReceptorDocLabel(global::Fiscal.Core.Domain.DocTipo tipo, long nro) => tipo switch
    {
        global::Fiscal.Core.Domain.DocTipo.Cuit => $"CUIT {nro:00000000000}",
        global::Fiscal.Core.Domain.DocTipo.Dni => $"DNI {nro}",
        _ => "Consumidor Final",
    };

    // DTO de comprobante fiscal para el admin (sin request/response crudos).
    public static object FiscalDocDto(global::Fiscal.Core.Domain.FiscalDocument d) => new
    {
        d.Id,
        cbteTipo = d.CbteTipo.ToString(),
        d.PtoVta,
        d.Number,
        result = d.Result.ToString(),
        d.Cae,
        caeVto = d.CaeVtoUtc?.ToString("yyyy-MM-dd"),
        impTotal = d.ImpTotal,
        observations = d.Observations,
        errors = d.Errors,
        d.CreatedAtUtc,
    };

}
