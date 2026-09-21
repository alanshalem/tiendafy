namespace Fiscal.Core.Domain;

/// <summary>
/// Lo que significan de verdad algunos errores de ARCA.
///
/// La documentación dice qué campos lleva cada método, no qué hacer cuando
/// falla. Los mensajes crudos ("ValidacionDeToken: No aparecio CUIT en lista de
/// relaciones") no le dicen nada a quien vende, y algunos significan más de una
/// cosa. Acá van solo los que conocemos con certeza: un error sin entrada se
/// muestra tal cual lo manda ARCA, que es mejor que inventarle una causa.
/// </summary>
public static class ArcaErrorCatalog
{
    /// <summary>
    /// Explicación accionable para un código de WSFEv1, o null si no la hay.
    /// </summary>
    public static string? Explain(string code) => code switch
    {
        // El mismo código tapa dos causas que no se pueden distinguir desde la
        // respuesta: la relación CUIT ↔ certificado no existe, o existe pero el
        // contribuyente no está habilitado para facturar (monotributo dado de
        // baja por deuda, por ejemplo). Por eso se nombran las dos.
        "600" =>
            "ARCA no reconoce la relación entre el CUIT que factura y el certificado. Puede ser una de dos cosas, " +
            "y ARCA usa el mismo error para ambas: (1) el CUIT configurado no es el del certificado y ese CUIT no " +
            "le delegó el servicio de Factura Electrónica en el Administrador de Relaciones; o (2) la relación " +
            "existe pero el contribuyente está inhabilitado para facturar (por ejemplo, monotributo dado de baja " +
            "por deuda). Revisá primero el estado del contribuyente en ARCA.",

        "10016" =>
            "El número de comprobante no es el próximo que ARCA espera para ese punto de venta. El sistema se " +
            "vuelve a sincronizar con ARCA en el próximo intento; si se repite, alguien está emitiendo con el " +
            "mismo punto de venta desde otro sistema.",

        _ => null,
    };

    /// <summary>
    /// Explicación para un fault de WSAA, a partir del texto del fault.
    /// </summary>
    public static string? ExplainWsaaFault(string fault)
    {
        if (fault.Contains("alreadyAuthenticated", StringComparison.OrdinalIgnoreCase))
            return "ARCA ya entregó un ticket de acceso vigente para este certificado y no da otro hasta que venza " +
                   "(dura hasta 12 horas). Pasa si se perdió el ticket guardado —una base restaurada— o si el mismo " +
                   "certificado se usa en otro sistema. Se resuelve solo cuando vence; no usen el mismo " +
                   "certificado en dos sistemas.";

        if (fault.Contains("notAuthorized", StringComparison.OrdinalIgnoreCase))
            return "El certificado existe pero no está autorizado para el servicio de Factura Electrónica (wsfe). " +
                   "En ARCA, en el Administrador de Relaciones o en WSASS (homologación), creá la autorización del " +
                   "certificado al servicio wsfe.";

        return null;
    }

    /// <summary>
    /// El mensaje de ARCA con la explicación al lado, si la hay. El original se
    /// conserva siempre: es lo que se busca en Google o se le manda al contador.
    /// </summary>
    public static string Describe(string code, string message) =>
        Explain(code) is { } why ? $"{code}: {message} — {why}" : $"{code}: {message}";
}
