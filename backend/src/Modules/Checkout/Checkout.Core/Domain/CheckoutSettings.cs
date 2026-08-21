using SharedKernel.Common;

namespace Checkout.Core.Domain;

/// <summary>
/// Cómo se comporta el checkout de una tienda: qué datos se le piden al
/// comprador y qué se le muestra. Una fila por tenant.
///
/// Vive en la base y no en el navegador del comerciante a propósito: lo que
/// configura acá lo tiene que leer el storefront, y antes esto se guardaba en
/// localStorage — cada navegador tenía su propia configuración y el comprador
/// nunca veía ninguna.
/// </summary>
public sealed class CheckoutSettings
{
    public const int MaxLabelLength = 60;
    public const int MaxMessageLength = 500;

    public Guid Id { get; private set; }
    public TenantId TenantId { get; private set; }

    /// <summary>Formulario y resumen en una sola columna en vez de dos.</summary>
    public bool SingleColumn { get; private set; }

    /// <summary>El teléfono es obligatorio para terminar la compra.</summary>
    public bool RequirePhone { get; private set; } = true;

    /// <summary>
    /// El DNI o CUIT es obligatorio. Con factura electrónica activada conviene
    /// pedirlo siempre: sin documento, ARCA solo admite consumidor final y con
    /// tope de monto.
    /// </summary>
    public bool RequireDocument { get; private set; }

    /// <summary>Campo libre para que el comprador aclare algo del pedido.</summary>
    public bool CustomerNoteEnabled { get; private set; } = true;
    public string CustomerNoteLabel { get; private set; } = "Aclaraciones sobre tu pedido";

    /// <summary>Mensaje propio en la pantalla que ve el comprador al terminar.</summary>
    public bool OrderMessageEnabled { get; private set; }
    public string OrderMessageText { get; private set; } = string.Empty;

    public DateTime UpdatedAtUtc { get; private set; }

    private CheckoutSettings() { } // EF Core

    public static CheckoutSettings CreateDefault(TenantId tenantId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    public void Update(
        bool singleColumn,
        bool requirePhone,
        bool requireDocument,
        bool customerNoteEnabled,
        string? customerNoteLabel,
        bool orderMessageEnabled,
        string? orderMessageText)
    {
        SingleColumn = singleColumn;
        RequirePhone = requirePhone;
        RequireDocument = requireDocument;
        CustomerNoteEnabled = customerNoteEnabled;

        // Una etiqueta vacía dejaría el campo sin nombre en el checkout: el
        // comprador vería un cuadro de texto suelto sin saber qué escribir.
        var label = (customerNoteLabel ?? string.Empty).Trim();
        CustomerNoteLabel = label.Length == 0
            ? "Aclaraciones sobre tu pedido"
            : Truncate(label, MaxLabelLength);

        OrderMessageEnabled = orderMessageEnabled;
        OrderMessageText = Truncate((orderMessageText ?? string.Empty).Trim(), MaxMessageLength);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}
