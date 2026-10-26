namespace Api.Purchasing;

/// <summary>
/// Lo que devuelve la lectura de una factura: la propuesta (la persona la revisa y confirma, nada se guarda)
/// con lo que sigue sin cerrar, si hubo segunda lectura y el emparejamiento de cada línea con la orden.
/// </summary>
/// <param name="Checks">Lo que sigue sin cerrar después de la corrección. Los números son los leídos, nunca recalculados.</param>
/// <param name="CorrectionRound">Hubo segunda lectura, aunque se haya descartado.</param>
/// <param name="Matches">Uno por línea, en el mismo orden.</param>
/// <param name="Warnings">Los del modelo más los de la cadena (la segunda lectura que no se pudo, las líneas sin emparejar).</param>
public sealed record InvoiceProposal(
    ScannedInvoice Invoice,
    IReadOnlyList<InvoiceIssue> Checks,
    bool CorrectionRound,
    IReadOnlyList<InvoiceLineMatch> Matches,
    IReadOnlyList<string> Warnings);
