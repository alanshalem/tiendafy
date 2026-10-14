namespace Fiscal.Core.Domain;

/// <summary>
/// Condición frente al IVA para MOSTRAR precios (no para facturar). Suma
/// Exento, que la facturación electrónica de la tienda no cubre pero una
/// tienda puede ser.
/// </summary>
public enum PriceTaxCondition
{
    ResponsableInscripto = 0,
    Monotributo = 1,
    Exento = 2,
}

/// <summary>
/// Lo que la tienda tiene que mostrar de sí misma por ley, y cómo calcula el
/// "precio sin impuestos nacionales". Una fila por tienda.
///
/// Identidad del vendedor (pie de la tienda): razón social, CUIT, domicilio y
/// el QR "Data Fiscal" de ARCA — el comercio pega el link del formulario 960 o
/// sube la imagen del QR.
///
/// Precio sin impuestos nacionales (Ley 27.743, régimen de transparencia
/// fiscal; Res. SIC 4/2025 para la exhibición): para un Responsable Inscripto
/// es el precio dividido por (1 + IVA + otros impuestos nacionales
/// indirectos). Un monotributista o un exento no discrimina IVA: el precio ya
/// es el neto, y se muestra igual al final (o se apaga, si su contador así lo
/// indica).
///
/// Separado de <see cref="FiscalConfig"/> a propósito: aquello es para emitir
/// comprobantes con certificado, y muchas tiendas tienen que mostrar estos
/// datos sin facturar desde acá. Si la tienda ya configuró la facturación,
/// lo que falte acá se completa desde ahí.
/// </summary>
public sealed class StoreLegalInfo
{
    /// <summary>IVA general. Es el que aplica a casi todo lo que vende una tienda online.</summary>
    public const decimal DefaultVatRatePercent = 21m;

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    /// <summary>Razón social (o nombre y apellido del titular).</summary>
    public string? LegalName { get; private set; }

    /// <summary>11 dígitos, sin guiones.</summary>
    public string? Cuit { get; private set; }

    /// <summary>Domicilio legal / comercial.</summary>
    public string? Address { get; private set; }

    public PriceTaxCondition Condition { get; private set; }
    public decimal VatRatePercent { get; private set; }

    /// <summary>Impuestos internos u otros nacionales indirectos, si la tienda vende algo alcanzado.</summary>
    public decimal OtherNationalTaxesPercent { get; private set; }

    /// <summary>Mostrar la leyenda debajo del precio. Encendida por defecto: es una obligación.</summary>
    public bool ShowPriceWithoutTaxes { get; private set; }

    /// <summary>Link del QR "Data Fiscal" de ARCA (el que da el formulario F.960/D).</summary>
    public string? DataFiscalUrl { get; private set; }

    /// <summary>La imagen del QR, si el comercio prefirió subirla.</summary>
    public string? DataFiscalImageUrl { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    private StoreLegalInfo() { } // EF Core

    public static StoreLegalInfo CreateDefault(Guid tenantId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        Condition = PriceTaxCondition.ResponsableInscripto,
        VatRatePercent = DefaultVatRatePercent,
        OtherNationalTaxesPercent = 0m,
        ShowPriceWithoutTaxes = true,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    public void Update(
        string? legalName, string? cuit, string? address,
        PriceTaxCondition condition, decimal vatRatePercent, decimal otherNationalTaxesPercent,
        bool showPriceWithoutTaxes, string? dataFiscalUrl, string? dataFiscalImageUrl)
    {
        LegalName = Clean(legalName, 200);
        Cuit = Clean(cuit, 11);
        Address = Clean(address, 300);
        Condition = condition;
        VatRatePercent = Math.Clamp(vatRatePercent, 0m, 100m);
        OtherNationalTaxesPercent = Math.Clamp(otherNationalTaxesPercent, 0m, 100m);
        ShowPriceWithoutTaxes = showPriceWithoutTaxes;
        DataFiscalUrl = Clean(dataFiscalUrl, 500);
        DataFiscalImageUrl = Clean(dataFiscalImageUrl, 500);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Por cuánto se divide el precio final para llegar al precio sin
    /// impuestos nacionales. 1 = el precio ya es el neto (monotributo, exento).
    /// </summary>
    public decimal TaxDivisor =>
        Condition == PriceTaxCondition.ResponsableInscripto
            ? 1m + (VatRatePercent + OtherNationalTaxesPercent) / 100m
            : 1m;

    /// <summary>El precio sin impuestos nacionales, en centavos, redondeado al centavo.</summary>
    public long PriceWithoutTaxes(long finalPriceMinor) =>
        (long)Math.Round(finalPriceMinor / TaxDivisor, MidpointRounding.AwayFromZero);

    private static string? Clean(string? s, int max)
    {
        var t = s?.Trim();
        if (string.IsNullOrEmpty(t)) return null;
        return t.Length <= max ? t : t[..max];
    }
}
