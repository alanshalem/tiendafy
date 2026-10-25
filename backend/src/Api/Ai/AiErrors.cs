using Ai.Infrastructure;
using SharedKernel.Common;

namespace Api.Ai;

/// <summary>
/// Errores del gateway de IA. Ninguno es un 500: lo que es configuración o tope es un 409 y lo que
/// es una caída del proveedor es un 503. Los mensajes los lee el comercio: sin jerga técnica.
/// </summary>
public static class AiErrors
{
    public static readonly Error Disabled = Error.Conflict(
        "Ai.Disabled", "La inteligencia artificial está apagada en esta tienda. Prendela en Configuración → Inteligencia artificial.");

    /// <summary>Mismo código que <see cref="Disabled"/>: la palanca de emergencia de la plataforma (<c>Ai:Disabled</c>).</summary>
    public static readonly Error DisabledGlobally = Error.Conflict(
        "Ai.Disabled", "La inteligencia artificial está apagada por un rato. Probá de nuevo más tarde.");

    public static readonly Error NotConfigured = Error.Conflict(
        "Ai.TaskNotConfigured", "Elegí un modelo para esta tarea en Configuración → Inteligencia artificial.");

    public static readonly Error Budget = Error.Conflict(
        "Ai.BudgetExceeded", "Se alcanzó el tope mensual de inteligencia artificial de esta tienda. Podés subirlo en Configuración → Inteligencia artificial.");

    public static readonly Error Busy = Error.Conflict(
        "Ai.Busy", "Ya hay una tarea de inteligencia artificial en curso. Esperá a que termine.");

    public static readonly Error Unavailable = new(
        "Ai.Unavailable", "El servicio de inteligencia artificial no responde. Probá de nuevo en unos minutos.", ErrorType.Unavailable);

    public static readonly Error TimedOut = new(
        "Ai.TimedOut", "La inteligencia artificial tardó demasiado en responder. Probá de nuevo.", ErrorType.Unavailable);

    /// <summary>400, 401 o 403 del proveedor: es configuración, no caída, y no pasa al respaldo.</summary>
    public static Error BadKey(AiProvider provider) => Error.Conflict(
        "Ai.ProviderAuth", $"La clave de {provider} no es válida o no tiene saldo.");

    /// <summary>La tarea tiene modelo pero su proveedor no tiene clave cargada. Mismo código que <see cref="NotConfigured"/>.</summary>
    public static Error MissingKey(AiProvider provider) => Error.Conflict(
        "Ai.TaskNotConfigured", $"Falta la clave de {provider}.");
}
