using System.Text.Json;

namespace SharedKernel.Common;

/// <summary>
/// Las opciones JSON "web" (camelCase) de todo el backend, en UNA instancia.
///
/// Varios módulos escriben blobs que otros leen —los items de una venta de
/// Mercado Libre, por ejemplo—: si escritor y lector no usan exactamente las
/// mismas opciones, la deserialización devuelve defaults en silencio (ya pasó:
/// las cantidades de los items de ML llegaban en 0). Vivía en la Api; acá la
/// pueden usar también los adaptadores de los módulos sin duplicarla.
/// </summary>
public static class JsonDefaults
{
    public static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
}
