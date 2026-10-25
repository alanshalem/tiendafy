namespace SharedKernel.Common;

/// <summary>
/// Resultado de operación sin excepciones para fallas esperadas
/// (validación, not-found, regla de negocio). Excepciones quedan para
/// fallas inesperadas (DB caída, bug).
/// </summary>
public class Result
{
    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;
    public Error Error { get; }

    protected Result(bool isSuccess, Error error)
    {
        if (isSuccess && error != Error.None)
            throw new InvalidOperationException("Successful result cannot carry an error.");
        if (!isSuccess && error == Error.None)
            throw new InvalidOperationException("Failed result must carry an error.");

        IsSuccess = isSuccess;
        Error = error;
    }

    public static Result Success() => new(true, Error.None);
    public static Result Failure(Error error) => new(false, error);

    public static Result<T> Success<T>(T value) => new(value, true, Error.None);
    public static Result<T> Failure<T>(Error error) => new(default, false, error);
}

public class Result<T> : Result
{
    private readonly T? _value;

    public T Value => IsSuccess
        ? _value!
        : throw new InvalidOperationException("Cannot access Value of a failed result.");

    internal Result(T? value, bool isSuccess, Error error) : base(isSuccess, error)
    {
        _value = value;
    }

    public static implicit operator Result<T>(T value) => Success(value);
}

/// <summary>Categoría del error — los hosts HTTP la mapean a status code.</summary>
public enum ErrorType
{
    Failure = 0,     // 500
    Validation = 1,  // 400
    NotFound = 2,    // 404
    Conflict = 3,    // 409
    Unavailable = 4, // 503: un servicio externo no responde (por ejemplo, el proveedor de IA)
}

/// <summary>
/// Error con código estable (para API responses y logs) + mensaje humano.
/// </summary>
public sealed record Error(string Code, string Message, ErrorType Type = ErrorType.Failure)
{
    public static readonly Error None = new(string.Empty, string.Empty);

    /// <summary>
    /// "No existe" de una entidad por id. El mensaje lo lee el comercio o el
    /// comprador: va en castellano y sin el id (un GUID no le dice nada a nadie).
    /// </summary>
    public static Error NotFound(string entity, object id) =>
        new($"{entity}.NotFound", $"{Noun(entity)} no existe o ya no está disponible.", ErrorType.NotFound);

    /// <summary>"No existe" con código y mensaje propios.</summary>
    public static Error NotFound(string code, string message) =>
        new(code, message, ErrorType.NotFound);

    private static string Noun(string entity) => entity switch
    {
        "Category" => "La categoría",
        "Checkout" => "La compra",
        "Image" => "La imagen",
        "Order" => "La venta",
        "Product" => "El producto",
        "Reservation" => "La reserva de stock",
        "Tenant" => "La tienda",
        "Variant" => "La variante",
        _ => "Lo que buscás",
    };

    public static Error Validation(string code, string message) =>
        new(code, message, ErrorType.Validation);

    public static Error Conflict(string code, string message) =>
        new(code, message, ErrorType.Conflict);
}
