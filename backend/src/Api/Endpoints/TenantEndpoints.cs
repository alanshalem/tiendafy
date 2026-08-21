using System.Security.Claims;
using Api.Auth;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;
using Tenancy.Contracts;
using Tenancy.Core.Domain;
using Tenancy.Core.Features.CreateTenant;
using Tenancy.Core.Features.UpdateTenant;

namespace Api.Endpoints;

public static class TenantEndpoints
{
    public static RouteGroupBuilder MapTenantEndpoints(this RouteGroupBuilder group)
    {
        var tenants = group.MapGroup("/tenants");

        // Crear tienda: el usuario autenticado queda como dueño (membresía).
        tenants.MapPost("/", async (CreateTenantRequest request, CreateTenantHandler handler, ClaimsPrincipal user, IMembershipService memberships, CancellationToken ct) =>
        {
            var userId = user.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var result = await handler.HandleAsync(new CreateTenantCommand(request.Name, request.Subdomain), ct);
            if (!result.IsSuccess) return result.Error.ToProblem();
            await memberships.AddOwnerAsync(userId.Value, result.Value.Id, ct);
            return Results.Created($"/api/v1/tenants/{result.Value.Id}", result.Value);
        }).RequireAuthorization();

        // Tablero del grupo: la misma lista de tiendas pero con el pulso de cada
        // una al lado. Sin esto, comparar dos tiendas propias obliga a entrar a
        // cada una y anotar los números a mano.
        //
        // Los DbContext filtran por la tienda ACTIVA (el header X-Tenant-Id), así
        // que hay que ignorar ese filtro y acotar a mano a las tiendas del usuario.
        // Se consulta de a una tienda por vez: son un puñado, y una query por
        // tienda es imposible de confundir con una fuga entre tenants.
        tenants.MapGet("/overview", async (
            ITenancyService service, ClaimsPrincipal user, IMembershipService memberships,
            global::Orders.Infrastructure.Persistence.OrdersDbContext ordersDb,
            Catalog.Infrastructure.Persistence.CatalogDbContext catalogDb,
            int? days, CancellationToken ct) =>
        {
            var userId = user.GetUserId();
            if (userId is null) return Results.Unauthorized();

            var window = Math.Clamp(days ?? 30, 1, 365);
            var since = DateTime.UtcNow.AddDays(-window);
            var previousSince = since.AddDays(-window);

            var ids = await memberships.TenantIdsForUserAsync(userId.Value, ct);
            var items = new List<object>();

            foreach (var id in ids)
            {
                var tenantId = TenantId.From(id);

                var paid = await ordersDb.Orders.AsNoTracking().IgnoreQueryFilters()
                    .Where(o => o.TenantId == tenantId
                        && global::Orders.Core.Domain.OrderStatuses.Earning.Contains(o.Status)
                        && o.PaidAtUtc >= previousSince)
                    .Select(o => new { o.PaidAtUtc, Amount = o.NetRevenue.AmountInMinorUnits, o.Total.Currency })
                    .ToListAsync(ct);

                var current = paid.Where(o => o.PaidAtUtc >= since).ToList();
                var previous = paid.Where(o => o.PaidAtUtc < since).ToList();

                var lastOrder = await ordersDb.Orders.AsNoTracking().IgnoreQueryFilters()
                    .Where(o => o.TenantId == tenantId && global::Orders.Core.Domain.OrderStatuses.Earning.Contains(o.Status))
                    .OrderByDescending(o => o.PaidAtUtc)
                    .Select(o => o.PaidAtUtc)
                    .FirstOrDefaultAsync(ct);

                var published = await catalogDb.Products.AsNoTracking().IgnoreQueryFilters()
                    .CountAsync(p => p.TenantId == tenantId && p.Status == Catalog.Core.Domain.ProductStatus.Active, ct);

                items.Add(new
                {
                    tenantId = id,
                    orders = current.Count,
                    revenueMinor = current.Sum(o => o.Amount),
                    previousRevenueMinor = previous.Sum(o => o.Amount),
                    currency = current.Count > 0 ? current[0].Currency : SharedKernel.Common.Money.DefaultCurrency,
                    publishedProducts = published,
                    lastOrderAtUtc = lastOrder,
                });
            }

            return Results.Ok(new { days = window, items });
        }).RequireAuthorization();

        // Sólo las tiendas del usuario autenticado.
        tenants.MapGet("/", async (ITenancyService service, ClaimsPrincipal user, IMembershipService memberships, CancellationToken ct) =>
        {
            var userId = user.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var ids = await memberships.TenantIdsForUserAsync(userId.Value, ct);
            var items = new List<object>();
            foreach (var id in ids)
            {
                var t = await service.GetByIdAsync(id, ct);
                if (t is not null) items.Add(t);
            }
            return Results.Ok(new { items, nextCursor = (string?)null, hasMore = false });
        }).RequireAuthorization();

        // Estado REAL del dominio propio de la tienda activa.
        //
        // Antes el panel mostraba "Activado · SSL activado" fijo, sin consultar
        // nada: un dominio recién cargado y sin DNS apuntado se veía igual que
        // uno funcionando. Eso es peor que no mostrar nada, porque da por
        // resuelto un paso que el comerciante todavía tiene que hacer en su
        // proveedor de dominios.
        tenants.MapGet("/domain-status", async (
            ITenantContext tenant, ITenancyService service, IConfiguration cfg, CancellationToken ct) =>
        {
            var store = await service.GetByIdAsync(tenant.TenantId.Value, ct);
            if (store is null) return Results.NotFound();

            var platform = (cfg["Tenancy:PlatformBaseDomain"] ?? "localhost").ToLowerInvariant();
            var custom = store.CustomDomain;

            if (string.IsNullOrWhiteSpace(custom))
            {
                return Results.Ok(new
                {
                    subdomain = $"{store.Subdomain}.{platform}",
                    customDomain = (string?)null,
                    platformTarget = platform,
                });
            }

            // Se comparan las IPs a las que resuelve cada uno: si el dominio
            // propio llega al mismo lugar que la plataforma, el CNAME está
            // puesto. Es lo mismo que haría alguien a mano con un nslookup.
            var (customIps, customError) = await ResolveAsync(custom, ct);
            var (platformIps, _) = await ResolveAsync(platform, ct);

            var resolves = customIps.Count > 0;
            var pointsHere = resolves && platformIps.Count > 0 && customIps.Intersect(platformIps).Any();

            return Results.Ok(new
            {
                subdomain = $"{store.Subdomain}.{platform}",
                customDomain = custom,
                platformTarget = platform,
                resolves,
                pointsHere,
                addresses = customIps,
                error = customError,
            });
        }).RequireTenant().RequirePermission(Permission.TenantAdmin);

        tenants.MapGet("/{id:guid}", async (Guid id, ITenancyService service, ClaimsPrincipal user, IMembershipService memberships, CancellationToken ct) =>
        {
            if (await NotMember(user, id, memberships, ct)) return Forbidden();
            var tenant = await service.GetByIdAsync(id, ct);
            return tenant is null ? Results.NotFound() : Results.Ok(tenant);
        }).RequireAuthorization();

        // Disponibilidad de nombre/subdominio para el form de creación (admin).
        tenants.MapGet("/check", async (
            ITenantRepository repository,
            CancellationToken ct,
            string? subdomain = null,
            string? name = null,
            Guid? excludeId = null) =>
        {
            var subdomainValid = string.IsNullOrWhiteSpace(subdomain) || Subdomain.Create(subdomain).IsSuccess;
            var subdomainAvailable = string.IsNullOrWhiteSpace(subdomain)
                || (subdomainValid && !await repository.SubdomainExistsAsync(subdomain, excludeId, ct));
            var nameAvailable = string.IsNullOrWhiteSpace(name)
                || !await repository.NameExistsAsync(name, excludeId, ct);

            return Results.Ok(new { subdomainValid, subdomainAvailable, nameAvailable });
        }).RequireAuthorization();

        // Cambiar nombre/subdominio/dominio: acción sensible → solo el dueño.
        tenants.MapPatch("/{id:guid}", async (Guid id, UpdateTenantRequest request, UpdateTenantHandler handler, ClaimsPrincipal user, IMembershipService memberships, CancellationToken ct) =>
        {
            if (await NotOwner(user, id, memberships, ct)) return OwnerOnly();
            var result = await handler.UpdateAsync(
                new UpdateTenantCommand(id, request.Name, request.Subdomain, request.CustomDomain), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        }).RequireAuthorization();

        tenants.MapPost("/{id:guid}/archive", async (Guid id, UpdateTenantHandler handler, ClaimsPrincipal user, IMembershipService memberships, CancellationToken ct) =>
        {
            if (await NotOwner(user, id, memberships, ct)) return OwnerOnly();
            var result = await handler.ArchiveAsync(id, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        }).RequireAuthorization();

        tenants.MapPost("/{id:guid}/activate", async (Guid id, UpdateTenantHandler handler, ClaimsPrincipal user, IMembershipService memberships, CancellationToken ct) =>
        {
            if (await NotOwner(user, id, memberships, ct)) return OwnerOnly();
            var result = await handler.ActivateAsync(id, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        }).RequireAuthorization();

        // Soft-delete: marca CANCELED. No borra físico (productos/temas referencian el id).
        // Solo el dueño puede eliminar la tienda.
        tenants.MapDelete("/{id:guid}", async (Guid id, UpdateTenantHandler handler, ClaimsPrincipal user, IMembershipService memberships, CancellationToken ct) =>
        {
            if (await NotOwner(user, id, memberships, ct)) return OwnerOnly();
            var result = await handler.DeleteAsync(id, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        }).RequireAuthorization();

        // BORRADO DEFINITIVO — SOLO EN DESARROLLO. Purga toda la data del tenant
        // (cada tabla con columna tenant_id) y la fila de la tienda. En producción
        // devuelve 404 (el borrado real es lógico, vía MapDelete de arriba).
        tenants.MapDelete("/{id:guid}/purge", async (
            Guid id, IHostEnvironment env, ClaimsPrincipal user, IMembershipService memberships,
            Tenancy.Infrastructure.Persistence.TenancyDbContext db, CancellationToken ct) =>
        {
            if (!env.IsDevelopment()) return Results.NotFound();
            if (await NotOwner(user, id, memberships, ct)) return OwnerOnly();

            var conn = db.Database.GetDbConnection();
            await conn.OpenAsync(ct);
            try
            {
                // Mejor esfuerzo: desactivar FKs si el rol de la conexión lo permite.
                await Exec(conn, "SET session_replication_role = replica", ct, swallow: true);

                var tables = new List<string>();
                await using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT table_name FROM information_schema.columns WHERE column_name = 'tenant_id' AND table_schema = 'public'";
                    await using var reader = await cmd.ExecuteReaderAsync(ct);
                    while (await reader.ReadAsync(ct)) tables.Add(reader.GetString(0));
                }
                foreach (var t in tables)
                {
                    if (!System.Text.RegularExpressions.Regex.IsMatch(t, "^[a-z0-9_]+$")) continue;
                    await Exec(conn, $"DELETE FROM \"{t}\" WHERE tenant_id = @id", ct, swallow: true, id);
                }

                // La tabla tenants usa "id" (no tenant_id); nada le hace FK, así que borra siempre.
                await Exec(conn, "DELETE FROM tenants WHERE id = @id", ct, swallow: false, id);
                await Exec(conn, "SET session_replication_role = DEFAULT", ct, swallow: true);
            }
            finally { await conn.CloseAsync(); }

            return Results.NoContent();
        }).RequireAuthorization();

        // Resolución por host — pública (storefront + admin la usan para resolver
        // tienda). Acepta también ?domain= porque es el "ask" del on-demand TLS de
        // Caddy: 200 = emitir certificado para ese host, 404 = rechazar.
        tenants.MapGet("/resolve", async (ITenancyService service, CancellationToken ct, string? host = null, string? domain = null) =>
        {
            var h = host ?? domain;
            if (string.IsNullOrWhiteSpace(h)) return Results.BadRequest();
            var tenant = await service.ResolveByHostAsync(h, ct);
            return tenant is null ? Results.NotFound() : Results.Ok(tenant);
        });

        return group;
    }

    /// <summary>Ejecuta un comando ADO parametrizado por @id. Con swallow tolera errores (FK).</summary>
    private static async Task Exec(System.Data.Common.DbConnection conn, string sql, CancellationToken ct, bool swallow, Guid? id = null)
    {
        try
        {
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = sql;
            if (id is { } g)
            {
                var p = cmd.CreateParameter();
                p.ParameterName = "id";
                p.Value = g;
                cmd.Parameters.Add(p);
            }
            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch when (swallow) { /* best-effort: seguir con las demás tablas */ }
    }

    private static async Task<bool> NotMember(ClaimsPrincipal user, Guid tenantId, IMembershipService memberships, CancellationToken ct)
    {
        var userId = user.GetUserId();
        return userId is null || !await memberships.IsMemberAsync(userId.Value, tenantId, ct);
    }

    /// <summary>Gestión sensible de la tienda (dominio, borrado): exige rol dueño.</summary>
    private static async Task<bool> NotOwner(ClaimsPrincipal user, Guid tenantId, IMembershipService memberships, CancellationToken ct)
    {
        var userId = user.GetUserId();
        return userId is null || !await memberships.IsOwnerAsync(userId.Value, tenantId, ct);
    }

    private static IResult Forbidden() =>
        Results.Problem(title: "Auth.Forbidden", detail: "No tenés acceso a esta tienda.", statusCode: StatusCodes.Status403Forbidden);

    private static IResult OwnerOnly() =>
        Results.Problem(title: "Auth.Forbidden", detail: "Solo el dueño de la tienda puede hacer esto.", statusCode: StatusCodes.Status403Forbidden);
    /// <summary>
    /// A qué direcciones resuelve un dominio. Devuelve la lista vacía y el
    /// motivo si no resuelve — que es justo el caso que hay que mostrarle al
    /// comerciante cuando todavía no cargó el registro en su proveedor.
    /// </summary>
    private static async Task<(List<string> Addresses, string? Error)> ResolveAsync(string host, CancellationToken ct)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(5));

            var entries = await System.Net.Dns.GetHostAddressesAsync(host, timeout.Token);
            return ([.. entries.Select(a => a.ToString())], null);
        }
        catch (Exception ex) when (ex is System.Net.Sockets.SocketException or OperationCanceledException)
        {
            return ([], "El dominio todavía no resuelve. Puede tardar hasta 48 horas desde que cargás el registro.");
        }
    }

}

public sealed record CreateTenantRequest(string Name, string Subdomain);

public sealed record UpdateTenantRequest(string Name, string Subdomain, string? CustomDomain);
