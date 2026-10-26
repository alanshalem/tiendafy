using SharedKernel.Common;

namespace Api.Ai.Questions;

/// <summary>
/// Errores propios de los borradores de la bandeja. Los del gateway (<see cref="AiErrors"/>) vuelven tal cual.
/// Los mensajes los lee el comercio: sin jerga técnica.
/// </summary>
public static class QuestionDraftErrors
{
    public static readonly Error NotFound = Error.NotFound(
        "Ai.DraftNotFound", "No encontramos esa consulta en esta tienda.");

    public static readonly Error AlreadyAnswered = Error.Conflict(
        "Ai.AlreadyAnswered", "Esa consulta ya está respondida.");

    public static readonly Error NothingToAnswer = Error.Validation(
        "Ai.NothingToAnswer", "No hay un mensaje del comprador para contestar.");

    /// <summary>El modelo contestó sin texto: se puede reintentar.</summary>
    public static readonly Error EmptyDraft = new(
        "Ai.EmptyDraft", "La inteligencia artificial no propuso ninguna respuesta. Probá de nuevo.", ErrorType.Unavailable);

    public static readonly Error MeliUnavailable = new(
        "Ai.MeliUnavailable", "Mercado Libre no respondió. Probá de nuevo en unos minutos.", ErrorType.Unavailable);

    /// <summary>El mismo error que devuelven las pantallas de Mercado Libre sin una cuenta conectada.</summary>
    public static readonly Error MeliNotConnected = Error.Conflict(
        "Meli.NotConnected", "Conectá tu cuenta de Mercado Libre primero.");
}
