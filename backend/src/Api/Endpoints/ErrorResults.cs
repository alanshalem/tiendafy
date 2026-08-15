using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Mapeo Error de dominio → RFC 7807 problem+json. Es LA utilidad de salida de
/// error de toda la API (140+ call-sites); vive acá y no en un endpoint suelto.
/// </summary>
public static class ErrorResults
{
    public static IResult ToProblem(this Error error)
    {
        var status = error.Type switch
        {
            ErrorType.Validation => StatusCodes.Status400BadRequest,
            ErrorType.NotFound => StatusCodes.Status404NotFound,
            ErrorType.Conflict => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status500InternalServerError,
        };

        return Results.Problem(
            title: error.Code,
            detail: error.Message,
            statusCode: status);
    }
}
