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

    /// <summary>El modelo contestó, pero sin texto: se puede reintentar, no es un 500.</summary>
    public static readonly Error Empty = new(
        "Ai.Empty", "La inteligencia artificial devolvió una respuesta vacía. Probá de nuevo.", ErrorType.Unavailable);

    public static readonly Error TimedOut = new(
        "Ai.TimedOut", "La inteligencia artificial tardó demasiado en responder. Probá de nuevo.", ErrorType.Unavailable);

    /// <summary>
    /// Falló algo que no es el proveedor (una herramienta, el parseo de la respuesta, la base): no pasa
    /// al respaldo ni cuenta para el corte por fallas, pero tampoco es un 500.
    /// </summary>
    public static readonly Error Failed = new(
        "Ai.Failed", "No se pudo completar la tarea de inteligencia artificial. Probá de nuevo en unos minutos.", ErrorType.Unavailable);

    /// <summary>El proveedor rechazó el pedido (un 4xx que no es la clave): no pasa al respaldo ni cuenta como caída.</summary>
    public static readonly Error Rejected = Error.Conflict(
        "Ai.Rejected", "El proveedor rechazó el pedido (por ejemplo, porque era demasiado largo).");

    /// <summary>401, 402, 403, o un 400 que habla de la clave o del saldo: es configuración, no caída, y no pasa al respaldo.</summary>
    public static Error BadKey(AiProvider provider) => Error.Conflict(
        "Ai.ProviderAuth", $"La clave de {provider} no es válida o no tiene saldo.");

    /// <summary>La tarea tiene modelo pero su proveedor no tiene clave cargada. Mismo código que <see cref="NotConfigured"/>.</summary>
    public static Error MissingKey(AiProvider provider) => Error.Conflict(
        "Ai.TaskNotConfigured", $"Falta la clave de {provider}.");
}
