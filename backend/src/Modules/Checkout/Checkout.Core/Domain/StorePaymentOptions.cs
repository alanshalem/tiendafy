using SharedKernel.Common;

namespace Checkout.Core.Domain;

/// <summary>
/// Lo que la tienda promete sobre cómo se le paga, en un solo lugar: la
/// transferencia (con su descuento, los datos de la cuenta y cuánto se guarda
/// el stock), el efectivo al retirar y las cuotas sin interés que anuncia.
///
/// Antes el descuento y las cuotas eran números sueltos del diseño de la
/// tienda: la ficha decía "10% pagando con transferencia" y el checkout no
/// ofrecía transferencia. Por la Ley 24.240 (art. 7) lo que se anuncia obliga,
/// así que el número que se muestra y el que se cobra tienen que ser el mismo,
/// y ese número vive acá. Una fila por tienda; sin fila, la tienda nunca lo
/// configuró y el storefront sigue mostrando lo que tenía el diseño.
/// </summary>
public sealed class StorePaymentOptions
{
    public const int MaxDiscountPercent = 50;
    public const int MinHoldHours = 1;
    public const int MaxHoldHours = 168; // una semana
    public const int DefaultHoldHours = 48;
    public const int MaxInstallments = 24;
    public const int MaxInstructionsLength = 1000;
    public const int MaxNoteLength = 160;

    public Guid Id { get; private set; }
    public TenantId TenantId { get; private set; }

    // ------------------------------------------------------------ Transferencia
    public bool TransferEnabled { get; private set; }

    /// <summary>
    /// % de descuento pagando por transferencia o en efectivo. Es el mismo que
    /// anuncian la ficha y las tarjetas de producto ("precio con transferencia").
    /// </summary>
    public int DiscountPercent { get; private set; }

    public string? BankName { get; private set; }
    public string? AccountHolder { get; private set; }
    public string? HolderTaxId { get; private set; }
    public string? Cbu { get; private set; }
    public string? Alias { get; private set; }

    /// <summary>Qué tiene que hacer el comprador después de transferir ("mandanos el comprobante a…").</summary>
    public string? Instructions { get; private set; }

    /// <summary>
    /// Cuántas horas se guarda el stock esperando la transferencia. Vencido el
    /// plazo, la venta se cancela sola y el stock vuelve a estar a la venta.
    /// </summary>
    public int HoldHours { get; private set; } = DefaultHoldHours;

    // ----------------------------------------------------- Efectivo al retirar
    /// <summary>Solo se ofrece cuando el comprador elige retirar en el local.</summary>
    public bool CashOnPickupEnabled { get; private set; }

    // ---------------------------------------------------------------- Cuotas
    /// <summary>"Hasta N cuotas sin interés" que se anuncia en la tienda. 0 = no se anuncia.</summary>
    public int InstallmentsMax { get; private set; }

    /// <summary>Las condiciones de esas cuotas ("con tarjetas de crédito bancarias").</summary>
    public string? InstallmentsNote { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    private StorePaymentOptions() { } // EF Core

    public static StorePaymentOptions CreateDefault(TenantId tenantId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    public sealed record Input(
        bool TransferEnabled,
        int DiscountPercent,
        string? BankName,
        string? AccountHolder,
        string? HolderTaxId,
        string? Cbu,
        string? Alias,
        string? Instructions,
        int HoldHours,
        bool CashOnPickupEnabled,
        int InstallmentsMax,
        string? InstallmentsNote);

    public Result Update(Input input)
    {
        if (input.DiscountPercent is < 0 or > MaxDiscountPercent)
            return Result.Failure(Error.Validation("PaymentOptions.InvalidDiscount",
                $"El descuento tiene que estar entre 0 y {MaxDiscountPercent}%."));
        if (input.HoldHours is < MinHoldHours or > MaxHoldHours)
            return Result.Failure(Error.Validation("PaymentOptions.InvalidHold",
                $"El stock se puede guardar entre {MinHoldHours} y {MaxHoldHours} horas."));
        if (input.InstallmentsMax is < 0 or > MaxInstallments)
            return Result.Failure(Error.Validation("PaymentOptions.InvalidInstallments",
                $"Las cuotas van de 0 a {MaxInstallments}."));

        var cbu = Digits(input.Cbu);
        if (cbu is not null && cbu.Length != 22)
            return Result.Failure(Error.Validation("PaymentOptions.InvalidCbu",
                "El CBU o CVU tiene 22 números."));
        var alias = Text.Clip(input.Alias, 40);
        var holder = Text.Clip(input.AccountHolder, 120);

        // Prender la transferencia sin dónde transferir dejaría al comprador
        // con una venta reservada y ningún dato para pagarla.
        if (input.TransferEnabled && cbu is null && alias is null)
            return Result.Failure(Error.Validation("PaymentOptions.MissingAccount",
                "Para ofrecer transferencia cargá el CBU/CVU o el alias de la cuenta."));
        if (input.TransferEnabled && holder is null)
            return Result.Failure(Error.Validation("PaymentOptions.MissingHolder",
                "Para ofrecer transferencia cargá el titular de la cuenta."));

        TransferEnabled = input.TransferEnabled;
        DiscountPercent = input.DiscountPercent;
        BankName = Text.Clip(input.BankName, 80);
        AccountHolder = holder;
        HolderTaxId = Text.Clip(input.HolderTaxId, 20);
        Cbu = cbu;
        Alias = alias;
        Instructions = Text.Clip(input.Instructions, MaxInstructionsLength);
        HoldHours = input.HoldHours;
        CashOnPickupEnabled = input.CashOnPickupEnabled;
        InstallmentsMax = input.InstallmentsMax;
        InstallmentsNote = InstallmentsMax > 0 ? Text.Clip(input.InstallmentsNote, MaxNoteLength) : null;
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>¿Se puede pagar así este pedido? El efectivo solo con retiro en el local.</summary>
    public bool Offers(OfflinePaymentMethod method, bool isPickup) => method switch
    {
        OfflinePaymentMethod.Transfer => TransferEnabled,
        OfflinePaymentMethod.Cash => CashOnPickupEnabled && isPickup,
        _ => false,
    };

    private static string? Digits(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var digits = new string(raw.Where(char.IsAsciiDigit).ToArray());
        return digits.Length == 0 ? null : digits;
    }
}

/// <summary>Los medios de pago que no pasan por una pasarela: se cobran a mano.</summary>
public enum OfflinePaymentMethod
{
    Transfer = 0,
    Cash = 1,
}

/// <summary>
/// El nombre de cada medio en la API y en la orden (Order.PaymentProvider).
/// Cómo se combina su descuento con el cupón está en Order.UseOfflinePayment.
/// </summary>
public static class OfflinePayments
{
    public static string Wire(OfflinePaymentMethod method) => method switch
    {
        OfflinePaymentMethod.Cash => "cash",
        _ => "transfer",
    };

    public static bool TryParse(string? wire, out OfflinePaymentMethod method)
    {
        switch (wire?.Trim().ToLowerInvariant())
        {
            case "transfer":
                method = OfflinePaymentMethod.Transfer;
                return true;
            case "cash":
                method = OfflinePaymentMethod.Cash;
                return true;
            default:
                method = default;
                return false;
        }
    }
}
