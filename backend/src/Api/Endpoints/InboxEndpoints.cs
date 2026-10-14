using Api.Auth;
using Api.Inbox;
using Customers.Infrastructure;
using Identity.Infrastructure;
using Identity.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;
using Support.Infrastructure;

namespace Api.Endpoints;

/// <summary>
/// Bandeja unificada (ver <see cref="InboxService"/>). Listar y los contadores
/// son de quien atiende ALGÚN canal; cada acción sobre una conversación pide
/// el permiso de SU canal. Responder no pasa por acá: cada canal sigue
/// contestando por su endpoint de siempre (posventa, preguntas y mensajes de
/// ML, y la respuesta por email del formulario de contacto).
/// </summary>
public static class InboxEndpoints
{
    private static readonly Permission[] AnyChannel =
        [Permission.SupportChat, Permission.MessagesRead, Permission.MeliOperate];

    public static RouteGroupBuilder MapInboxEndpoints(this RouteGroupBuilder group)
    {
        var inbox = group.MapGroup("/inbox").RequireTenant();

        inbox.MapGet("/", async (
            HttpContext http, ITenantContext tenant, InboxService service, CancellationToken ct,
            string? channel = null, string? filter = null, string? q = null, int? offset = null, int? limit = null) =>
        {
            var access = await http.GetAccessAsync();
            var userId = http.User.GetUserId();
            if (access is null || userId is null) return AuthExtensions.NotAMember();

            var page = await service.ListAsync(
                tenant.TenantId.Value, userId.Value, access, new InboxQuery(channel, filter, q, offset, limit), ct);
            return Results.Ok(new
            {
                items = page.Items,
                total = page.Total,
                counts = page.Counts,
                channels = page.Channels,
                warnings = page.Warnings,
            });
        }).RequireAnyPermission(AnyChannel);

        // Los números del menú lateral: se piden cada minuto desde cada panel abierto.
        inbox.MapGet("/counts", async (
            HttpContext http, ITenantContext tenant, InboxService service, CancellationToken ct) =>
        {
            var access = await http.GetAccessAsync();
            var userId = http.User.GetUserId();
            if (access is null || userId is null) return AuthExtensions.NotAMember();
            return Results.Ok(await service.CountsAsync(tenant.TenantId.Value, userId.Value, access, ct));
        }).RequireAnyPermission(AnyChannel);

        // A quién se le puede asignar: la gente del equipo con el permiso de
        // cada canal. No pasa por /members (que pide "Ver el equipo"): quien
        // atiende tiene que poder pasarle una consulta a un compañero.
        inbox.MapGet("/assignees", async (
            ITenantContext tenant, IAccessService accessService, AppIdentityDbContext identity, CancellationToken ct) =>
        {
            var members = await accessService.MembersAsync(tenant.TenantId.Value, ct);
            var ids = members.Keys.ToList();
            var users = await identity.Users.AsNoTracking()
                .Where(u => ids.Contains(u.Id))
                .Select(u => new { u.Id, u.DisplayName, u.Email })
                .ToListAsync(ct);
            return Results.Ok(new
            {
                items = users
                    .Select(u => new
                    {
                        userId = u.Id,
                        name = DisplayName(u.DisplayName, u.Email),
                        email = u.Email,
                        channels = InboxService.ChannelsFor(members[u.Id]),
                    })
                    .Where(u => u.channels.Count > 0)
                    .OrderBy(u => u.name, StringComparer.OrdinalIgnoreCase),
            });
        }).RequireAnyPermission(AnyChannel);

        var thread = inbox.MapGroup("/threads/{channel}/{externalId}");

        thread.MapPut("/assignee", async (
            string channel, string externalId, AssignInboxRequest request, HttpContext http,
            ITenantContext tenant, SupportDbContext db, IAccessService accessService, AppIdentityDbContext identity,
            CustomersDbContext customers, CancellationToken ct) =>
        {
            if (await CheckAsync(http, channel, externalId, tenant, db, customers, ct) is { } denied) return denied;

            var state = await StateAsync(db, tenant.TenantId.Value, channel, externalId, ct);
            if (request.UserId is not { } assigneeId)
            {
                state.Unassign();
            }
            else
            {
                // Se le asigna a alguien que puede atender ESE canal: pasarle una
                // pregunta de ML a quien no tiene "Atender Mercado Libre" es
                // dejarla sin respuesta (y mostrarle algo que la matriz le niega).
                var members = await accessService.MembersAsync(tenant.TenantId.Value, ct);
                if (!members.TryGetValue(assigneeId, out var assigneeAccess))
                    return Error.Validation("Inbox.NotAMember", "Esa persona no es del equipo de la tienda.").ToProblem();
                if (!assigneeAccess.Can(InboxService.PermissionFor(channel)))
                    return Error.Validation("Inbox.AssigneeCannot",
                        "Esa persona no tiene permiso para atender este canal. Dáselo en Roles y permisos.").ToProblem();

                var user = await identity.Users.AsNoTracking()
                    .Where(u => u.Id == assigneeId)
                    .Select(u => new { u.DisplayName, u.Email })
                    .FirstAsync(ct);
                state.Assign(assigneeId, DisplayName(user.DisplayName, user.Email));
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new
            {
                assignedTo = state.AssignedUserId is { } id ? new InboxAssignee(id, state.AssignedUserName ?? "") : null,
            });
        }).RequireAnyPermission(AnyChannel);

        thread.MapPost("/read", async (
            string channel, string externalId, HttpContext http, ITenantContext tenant,
            SupportDbContext db, CustomersDbContext customers, MeliInboxSource meli, CancellationToken ct) =>
        {
            if (await CheckAsync(http, channel, externalId, tenant, db, customers, ct) is { } denied) return denied;
            var tid = tenant.TenantId.Value;

            // Leído en el canal mismo donde existe (así la pantalla de siempre
            // también lo ve leído) y en la bandeja para los que no lo tienen.
            switch (channel)
            {
                case InboxChannel.Contact:
                    var message = await customers.ContactMessages.FirstAsync(m => m.Id == Guid.Parse(externalId) && m.TenantId == tid, ct);
                    message.MarkRead();
                    await customers.SaveChangesAsync(ct);
                    break;
                case InboxChannel.Support:
                    var conversation = await db.Conversations.FirstAsync(c => c.Id == Guid.Parse(externalId) && c.TenantId == tid, ct);
                    conversation.MarkReadByStaff();
                    break;
                default:
                    meli.Invalidate(tid);
                    break;
            }

            var existing = await db.InboxStates.FirstOrDefaultAsync(
                s => s.TenantId == tid && s.Channel == channel && s.ExternalId == externalId, ct);
            // Sin fila no hay nada que guardar para contacto y posventa: el
            // canal ya lo sabe. Las preguntas de ML no tienen "leído" propio.
            var state = existing ?? (channel is InboxChannel.MeliQuestion or InboxChannel.MeliMessage
                ? await StateAsync(db, tid, channel, externalId, ct)
                : null);
            state?.MarkRead();
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireAnyPermission(AnyChannel);

        thread.MapPost("/unread", async (
            string channel, string externalId, HttpContext http, ITenantContext tenant,
            SupportDbContext db, CustomersDbContext customers, CancellationToken ct) =>
        {
            if (await CheckAsync(http, channel, externalId, tenant, db, customers, ct) is { } denied) return denied;
            (await StateAsync(db, tenant.TenantId.Value, channel, externalId, ct)).MarkUnread();
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireAnyPermission(AnyChannel);

        thread.MapPost("/archive", async (
            string channel, string externalId, HttpContext http, ITenantContext tenant,
            SupportDbContext db, CustomersDbContext customers, CancellationToken ct) =>
        {
            if (await CheckAsync(http, channel, externalId, tenant, db, customers, ct) is { } denied) return denied;
            (await StateAsync(db, tenant.TenantId.Value, channel, externalId, ct)).Archive();
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireAnyPermission(AnyChannel);

        thread.MapPost("/unarchive", async (
            string channel, string externalId, HttpContext http, ITenantContext tenant,
            SupportDbContext db, CustomersDbContext customers, CancellationToken ct) =>
        {
            if (await CheckAsync(http, channel, externalId, tenant, db, customers, ct) is { } denied) return denied;
            (await StateAsync(db, tenant.TenantId.Value, channel, externalId, ct)).Unarchive();
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireAnyPermission(AnyChannel);

        return group;
    }

    /// <summary>
    /// Canal conocido, permiso de ESE canal y conversación de esta tienda.
    /// Null = seguir; si no, la respuesta de error.
    /// </summary>
    private static async Task<IResult?> CheckAsync(
        HttpContext http, string channel, string externalId, ITenantContext tenant,
        SupportDbContext db, CustomersDbContext customers, CancellationToken ct)
    {
        if (!InboxChannel.IsKnown(channel) || externalId.Length is 0 or > 64) return Results.NotFound();

        var access = await http.GetAccessAsync();
        if (access is null) return AuthExtensions.NotAMember();
        if (!access.Can(InboxService.PermissionFor(channel)))
            return Results.Problem(title: "Auth.Forbidden",
                detail: "No tenés permiso para atender este canal.", statusCode: StatusCodes.Status403Forbidden);

        var tid = tenant.TenantId.Value;
        var exists = channel switch
        {
            InboxChannel.Contact => Guid.TryParse(externalId, out var cid)
                && await customers.ContactMessages.AnyAsync(m => m.Id == cid && m.TenantId == tid, ct),
            InboxChannel.Support => Guid.TryParse(externalId, out var sid)
                && await db.Conversations.AnyAsync(c => c.Id == sid && c.TenantId == tid, ct),
            // Preguntas y packs de ML viven en ML: no hay copia local contra la
            // que validar, solo la forma del id.
            _ => long.TryParse(externalId, out var mid) && mid > 0,
        };
        return exists ? null : Results.NotFound();
    }

    /// <summary>La fila de estado de la conversación (se crea al primer uso).</summary>
    private static async Task<InboxThreadState> StateAsync(
        SupportDbContext db, Guid tenantId, string channel, string externalId, CancellationToken ct)
    {
        var state = await db.InboxStates.FirstOrDefaultAsync(
            s => s.TenantId == tenantId && s.Channel == channel && s.ExternalId == externalId, ct);
        if (state is not null) return state;
        state = InboxThreadState.Create(tenantId, channel, externalId);
        db.InboxStates.Add(state);
        return state;
    }

    private static string DisplayName(string? displayName, string? email) =>
        string.IsNullOrWhiteSpace(displayName) ? email ?? "Sin nombre" : displayName;
}

/// <summary>Asignar (UserId) o liberar (null) una conversación.</summary>
public sealed record AssignInboxRequest(Guid? UserId);
