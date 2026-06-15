using Microsoft.AspNetCore.Identity;

namespace Identity.Infrastructure;

/// <summary>
/// Usuario global de plataforma (staff de tiendas). Un usuario puede
/// administrar varias tiendas vía memberships (próximo paso del módulo).
/// Los compradores (shoppers) son una población separada, por tienda —
/// NO van acá (ver sección 9 de la propuesta de arquitectura).
/// </summary>
public sealed class AppUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
