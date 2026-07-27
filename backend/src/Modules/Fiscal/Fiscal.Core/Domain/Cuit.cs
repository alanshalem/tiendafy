using SharedKernel.Common;

namespace Fiscal.Core.Domain;

/// <summary>
/// CUIT/CUIL argentino validado (11 dígitos + dígito verificador módulo 11).
/// Se guarda normalizado sin guiones (formato que espera WSFEv1: DocNro/CUIT
/// como long). El dígito verificador se valida al construir — un CUIT inválido
/// nunca entra al sistema.
/// </summary>
public readonly record struct Cuit
{
    // Pesos del algoritmo módulo 11 de AFIP para los primeros 10 dígitos.
    private static readonly int[] Weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

    /// <summary>Los 11 dígitos, sin guiones (ej. "20304050607").</summary>
    public string Value { get; }

    private Cuit(string value) => Value = value;

    /// <summary>CUIT como número (para DocNro/CUIT del WS, que es long).</summary>
    public long AsLong => long.Parse(Value);

    /// <summary>Formato legible con guiones: 20-30405060-7.</summary>
    public string Formatted => $"{Value[..2]}-{Value[2..10]}-{Value[10..]}";

    public static Result<Cuit> Create(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return Result.Failure<Cuit>(Error.Validation("Cuit.Empty", "El CUIT es obligatorio."));

        var digits = new string([.. raw.Where(char.IsDigit)]);
        if (digits.Length != 11)
            return Result.Failure<Cuit>(Error.Validation("Cuit.Length", "El CUIT debe tener 11 dígitos."));

        if (!IsCheckDigitValid(digits))
            return Result.Failure<Cuit>(Error.Validation("Cuit.CheckDigit", "El CUIT no es válido (dígito verificador incorrecto)."));

        return new Cuit(digits);
    }

    /// <summary>Algoritmo oficial: suma ponderada de los 10 primeros, mód 11.</summary>
    private static bool IsCheckDigitValid(string digits)
    {
        var sum = 0;
        for (var i = 0; i < 10; i++)
            sum += (digits[i] - '0') * Weights[i];

        var mod = 11 - (sum % 11);
        var check = mod switch
        {
            11 => 0,
            10 => 9, // convención AFIP: resto 10 → 9 (usado para prefijos 23/24/27…)
            _ => mod,
        };
        return check == (digits[10] - '0');
    }

    public override string ToString() => Formatted;
}
