using SharedKernel.Common;

namespace Checkout.Core.Domain;

/// <summary>Validación de dimensiones del paquete, compartida por las configs de carriers.</summary>
public static class PackageLimits
{
    /// <summary>Cada lado entre 1 y maxSideCm; el código de error lleva el prefijo del carrier.</summary>
    public static Result ValidateDimensions(string codePrefix, int length, int width, int height, int maxSideCm) =>
        length < 1 || length > maxSideCm || width < 1 || width > maxSideCm || height < 1 || height > maxSideCm
            ? Result.Failure(Error.Validation(
                $"{codePrefix}.InvalidDimensions", $"Cada dimensión debe estar entre 1 y {maxSideCm} cm."))
            : Result.Success();
}
