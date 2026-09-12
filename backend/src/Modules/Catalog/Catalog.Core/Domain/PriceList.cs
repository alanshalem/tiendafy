using SharedKernel.Common;

namespace Catalog.Core.Domain;

/// <summary>
/// Una lista de precios: mayorista, minorista, distribuidor, un canal puntual.
///
/// La lista NO guarda un precio por producto salvo que alguien lo escriba a
/// mano. Guarda una REGLA —un porcentaje sobre otra lista o sobre el precio
/// del producto— y el precio se calcula al pedirlo.
///
/// Es lo que hace que la lista siga viva: con precios copiados, subir el
/// catálogo 20% deja la mayorista en los números del mes pasado y nadie se
/// entera hasta que se factura mal. Con una regla, cambiar el precio del
/// producto mueve todas las listas a la vez, y lo que se escribió a mano —que
/// es la excepción y se ve como tal— sigue mandando sobre la regla.
/// </summary>
public sealed class PriceList
{
    /// <summary>Tope del porcentaje, en más y en menos. −100% sería regalar.</summary>
    public const decimal MaxAdjustmentPercent = 400m;

    /// <summary>
    /// Cuántas listas encadenadas se resuelven antes de rendirse. Una lista
    /// sobre otra sobre otra es legítimo (mayorista → distribuidor); veinte es
    /// un error de carga.
    /// </summary>
    public const int MaxChainDepth = 10;

    public Guid Id { get; private set; }
    public TenantId TenantId { get; private set; }

    public string Name { get; private set; } = string.Empty;
    public string Currency { get; private set; } = "ARS";

    /// <summary>
    /// Sobre qué se calcula. Null = sobre el precio del producto, que es la
    /// lista de todos los días y no necesita existir como fila.
    /// </summary>
    public Guid? BasedOnPriceListId { get; private set; }

    /// <summary>Cuánto se mueve respecto de la base: −30 es treinta por ciento menos.</summary>
    public decimal AdjustmentPercent { get; private set; }

    /// <summary>Redondeo comercial del resultado (<see cref="PriceRounding"/>).</summary>
    public string Rounding { get; private set; } = PriceRounding.None;

    public string? Notes { get; private set; }
    public bool Active { get; private set; } = true;
    public int SortOrder { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private PriceList() { } // EF Core

    public static Result<PriceList> Create(TenantId tenantId, string? name, string? currency)
    {
        var trimmed = (name ?? string.Empty).Trim();
        if (trimmed.Length is < 2 or > 60)
            return Result.Failure<PriceList>(Error.Validation(
                "PriceList.Name", "El nombre de la lista tiene entre 2 y 60 caracteres."));

        return Result.Success(new PriceList
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = trimmed,
            Currency = NormalizeCurrency(currency),
            CreatedAtUtc = DateTime.UtcNow,
        });
    }

    public Result Update(
        string? name,
        string? currency,
        Guid? basedOnPriceListId,
        decimal adjustmentPercent,
        string? rounding,
        string? notes,
        bool active,
        int sortOrder)
    {
        var trimmed = (name ?? string.Empty).Trim();
        if (trimmed.Length is < 2 or > 60)
            return Result.Failure(Error.Validation(
                "PriceList.Name", "El nombre de la lista tiene entre 2 y 60 caracteres."));

        if (basedOnPriceListId == Id)
            return Result.Failure(Error.Validation(
                "PriceList.SelfReference", "Una lista no se puede calcular sobre sí misma."));

        if (Math.Abs(adjustmentPercent) > MaxAdjustmentPercent)
            return Result.Failure(Error.Validation(
                "PriceList.Adjustment", $"El ajuste va entre −{MaxAdjustmentPercent}% y {MaxAdjustmentPercent}%."));

        if (adjustmentPercent <= -100m)
            return Result.Failure(Error.Validation(
                "PriceList.Adjustment", "Un descuento del 100% dejaría todo en cero."));

        if (!PriceRounding.IsValid(rounding))
            return Result.Failure(Error.Validation("PriceList.Rounding", "Ese modo de redondeo no existe."));

        Name = trimmed;
        Currency = NormalizeCurrency(currency);
        BasedOnPriceListId = basedOnPriceListId;
        AdjustmentPercent = decimal.Round(adjustmentPercent, 2);
        Rounding = rounding!;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim()[..Math.Min(notes.Trim().Length, 300)];
        Active = active;
        SortOrder = sortOrder;
        return Result.Success();
    }

    /// <summary>
    /// Aplica la regla a un precio base. Nunca devuelve menos de un centavo:
    /// un precio en cero se vende gratis, y eso no es un descuento sino un bug.
    /// </summary>
    public long Apply(long baseMinor)
    {
        var adjusted = baseMinor * (1m + AdjustmentPercent / 100m);
        var rounded = PriceRounding.Apply((long)Math.Round(adjusted, MidpointRounding.AwayFromZero), Rounding);
        return Math.Max(1, rounded);
    }

    private static string NormalizeCurrency(string? currency)
    {
        var value = (currency ?? string.Empty).Trim().ToUpperInvariant();
        return value.Length == 3 ? value : "ARS";
    }
}

/// <summary>
/// El precio escrito a mano para una variante en una lista. Gana siempre sobre
/// la regla: se carga justamente cuando el porcentaje no da el número que se
/// quiere para ESE producto.
/// </summary>
public sealed class PriceListItem
{
    public Guid Id { get; private set; }
    public TenantId TenantId { get; private set; }
    public Guid PriceListId { get; private set; }
    public Guid VariantId { get; private set; }
    public long PriceMinor { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private PriceListItem() { } // EF Core

    public static Result<PriceListItem> Create(TenantId tenantId, Guid priceListId, Guid variantId, long priceMinor)
    {
        if (priceMinor <= 0)
            return Result.Failure<PriceListItem>(Error.Validation(
                "PriceList.Price", "El precio tiene que ser mayor a cero."));

        return Result.Success(new PriceListItem
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            PriceListId = priceListId,
            VariantId = variantId,
            PriceMinor = priceMinor,
            UpdatedAtUtc = DateTime.UtcNow,
        });
    }

    public Result ChangePrice(long priceMinor)
    {
        if (priceMinor <= 0)
            return Result.Failure(Error.Validation("PriceList.Price", "El precio tiene que ser mayor a cero."));

        PriceMinor = priceMinor;
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }
}
