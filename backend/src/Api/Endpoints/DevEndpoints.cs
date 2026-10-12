using Api.Auth;
using Api.Startup;
using Identity.Infrastructure;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

/// <summary>
/// Herramientas de desarrollo. Se montan SOLO en Development (ver
/// <c>PipelineExtensions.MapApiV1</c>): fuera de ahí las rutas no existen.
/// </summary>
public static class DevEndpoints
{
    public static RouteGroupBuilder MapDevEndpoints(this RouteGroupBuilder group)
    {
        var dev = group.MapGroup("/dev").RequireTenant();

        // Llena la tienda ACTIVA con una operación de ejemplo para poder mostrar
        // el panel con datos. Idempotente: lo que ya existe no se toca.
        dev.MapPost("/demo-seed", async (
            ITenantContext tenant, DemoDataSeeder seeder, bool? reset, CancellationToken ct) =>
        {
            // reset=true borra la demo anterior antes de rehacerla. Explícito a
            // propósito: sin el parámetro, sembrar nunca destruye nada.
            var removed = reset == true ? await seeder.ResetAsync(tenant.TenantId, ct) : 0;
            var report = await seeder.SeedAsync(tenant.TenantId, ct);
            return Results.Ok(new { removed, created = report.Created, skipped = report.Skipped });
        }).RequirePermission(Permission.TenantAdmin); // con reset borra datos de la tienda: solo el dueño

        return group;
    }
}
