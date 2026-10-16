using Customers.Infrastructure;
using Identity.Infrastructure;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;
using Support.Infrastructure;

namespace Api.Inbox;

/// <summary>A quién del equipo le toca una conversación.</summary>
public sealed record InboxAssignee(Guid UserId, string Name);

/// <summary>
/// Una conversación de cualquier canal, con la misma forma para todos. Lo
/// propio de cada canal (el pedido de la posventa, la publicación de la
/// pregunta) viaja en <see cref="Context"/>.
/// </summary>
public sealed record InboxThread(
    string Key,
    string Channel,
    string ExternalId,
    string Title,
    string? Subtitle,
    string Preview,
    DateTime LastActivityAtUtc,
    bool Unread,
    int UnreadCount,
    bool Archived,
    bool AwaitingReply,
    InboxAssignee? AssignedTo,
    object Context);

public sealed record InboxCounts(int Unread, int Mine, int MineUnread, IReadOnlyDictionary<string, int> ByChannel);

public sealed record InboxPage(
    IReadOnlyList<InboxThread> Items, int Total, InboxCounts Counts, IReadOnlyList<string> Channels,
    IReadOnlyList<string> Warnings);

/// <summary>Qué pidió ver el panel: canal, "sin leer", "mías", archivadas, y texto.</summary>
public sealed record InboxQuery(string? Channel, string? Filter, string? Search, int? Offset, int? Limit);

/// <summary>
/// La bandeja unificada: contacto, chat posventa, preguntas y mensajes de
/// Mercado Libre en una sola lista.
///
/// <para>
/// Vive en la Api y no en un módulo porque cruza cuatro: cada canal sigue
/// guardando lo suyo donde siempre y respondiendo por su propio endpoint; acá
/// solo se leen, se normalizan y se les suma el estado de la bandeja
/// (<see cref="InboxThreadState"/>: asignación, archivo, leído a mano).
/// </para>
///
/// <para>
/// Cada canal entra solo si la persona tiene su permiso: quien atiende Mercado
/// Libre y no lee el formulario de contacto ve una bandeja sin contacto, en
/// vez de un error. La lista se arma en memoria con ventanas acotadas por
/// canal (las 200 conversaciones más nuevas de cada uno, las 50 preguntas más
/// nuevas de ML): es una cola de trabajo, no un archivo histórico.
/// </para>
/// </summary>
public sealed class InboxService(
    CustomersDbContext customers,
    SupportDbContext support,
    OrdersDbContext orders,
    MeliDbContext meli,
    MeliInboxSource meliSource)
{
    /// <summary>Cuántas conversaciones por canal mira la bandeja.</summary>
    public const int WindowPerChannel = 200;

    /// <summary>Hasta cuándo un chat de ML ya leído sigue en la bandeja.</summary>
    private static readonly TimeSpan MeliMessageRetention = TimeSpan.FromDays(60);

    /// <summary>El permiso que pide cada canal: el mismo que su pantalla de siempre.</summary>
    public static Permission PermissionFor(string channel) => channel switch
    {
        InboxChannel.Contact => Permission.MessagesRead,
        InboxChannel.Support => Permission.SupportChat,
        _ => Permission.MeliOperate,
    };

    /// <summary>Los canales que esta persona puede atender, en el orden de la bandeja.</summary>
    public static IReadOnlyList<string> ChannelsFor(MemberAccess access) =>
        [.. InboxChannel.All.Where(c => access.Can(PermissionFor(c)))];

    public async Task<InboxPage> ListAsync(Guid tenantId, Guid userId, MemberAccess access, InboxQuery query, CancellationToken ct)
    {
        var allowed = ChannelsFor(access);
        var (threads, warnings) = await LoadAsync(tenantId, allowed, ct);

        var open = threads.Where(t => !t.Archived).ToList();
        var counts = new InboxCounts(
            open.Count(t => t.Unread),
            open.Count(t => t.AssignedTo?.UserId == userId),
            open.Count(t => t.AssignedTo?.UserId == userId && t.Unread),
            allowed.ToDictionary(c => c, c => open.Count(t => t.Channel == c && t.Unread)));

        IEnumerable<InboxThread> visible = query.Filter?.Trim().ToLowerInvariant() switch
        {
            "archivadas" => threads.Where(t => t.Archived),
            "sin-leer" => open.Where(t => t.Unread),
            "mias" => open.Where(t => t.AssignedTo?.UserId == userId),
            "sin-asignar" => open.Where(t => t.AssignedTo is null),
            _ => open,
        };
        if (InboxChannel.IsKnown(query.Channel)) visible = visible.Where(t => t.Channel == query.Channel);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            visible = visible.Where(t =>
                t.Title.Contains(term, StringComparison.OrdinalIgnoreCase)
                || (t.Subtitle?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false)
                || t.Preview.Contains(term, StringComparison.OrdinalIgnoreCase));
        }

        var ordered = visible.OrderByDescending(t => t.LastActivityAtUtc).ToList();
        var (skip, take) = Api.Endpoints.Paging.Window(query.Offset, query.Limit);
        return new InboxPage([.. ordered.Skip(skip).Take(take)], ordered.Count, counts, allowed, warnings);
    }

    /// <summary>Solo los contadores (el menú lateral los pide seguido).</summary>
    public async Task<InboxCounts> CountsAsync(Guid tenantId, Guid userId, MemberAccess access, CancellationToken ct)
    {
        var page = await ListAsync(tenantId, userId, access, new InboxQuery(null, null, null, 0, 1), ct);
        return page.Counts;
    }

    private async Task<(List<InboxThread> Threads, List<string> Warnings)> LoadAsync(
        Guid tenantId, IReadOnlyList<string> channels, CancellationToken ct)
    {
        var states = (await support.InboxStates
                .Where(s => s.TenantId == tenantId && channels.Contains(s.Channel))
                .ToListAsync(ct))
            .ToDictionary(s => (s.Channel, s.ExternalId));
        InboxThreadState? StateOf(string channel, string id) => states.GetValueOrDefault((channel, id));

        var threads = new List<InboxThread>();
        var warnings = new List<string>();

        if (channels.Contains(InboxChannel.Contact)) threads.AddRange(await ContactAsync(tenantId, StateOf, ct));
        if (channels.Contains(InboxChannel.Support)) threads.AddRange(await SupportAsync(tenantId, StateOf, ct));

        if (channels.Contains(InboxChannel.MeliQuestion) || channels.Contains(InboxChannel.MeliMessage))
        {
            var snapshot = await meliSource.GetAsync(tenantId, ct);
            if (snapshot.Error is not null) warnings.Add(snapshot.Error);
            if (snapshot.Connected)
            {
                threads.AddRange(MeliQuestions(snapshot, StateOf));
                threads.AddRange(await MeliMessagesAsync(tenantId, snapshot, states, ct));
            }
        }

        return (threads, warnings);
    }

    // ---------------------------------------------------------------- canales

    private async Task<List<InboxThread>> ContactAsync(
        Guid tenantId, Func<string, string, InboxThreadState?> stateOf, CancellationToken ct)
    {
        var rows = await customers.ContactMessages.AsNoTracking()
            .Where(m => m.TenantId == tenantId)
            .OrderByDescending(m => m.CreatedAtUtc)
            .Take(WindowPerChannel)
            .ToListAsync(ct);
        var ids = rows.Select(r => r.Id.ToString()).ToList();
        var lastReplies = (await support.InboxReplies.AsNoTracking()
                .Where(r => r.TenantId == tenantId && r.Channel == InboxChannel.Contact && ids.Contains(r.ExternalId))
                .GroupBy(r => r.ExternalId)
                .Select(g => new { g.Key, Last = g.Max(r => r.CreatedAtUtc), Count = g.Count() })
                .ToListAsync(ct))
            .ToDictionary(r => r.Key);

        return [.. rows.Select(m =>
        {
            var id = m.Id.ToString();
            var state = stateOf(InboxChannel.Contact, id);
            var replied = lastReplies.GetValueOrDefault(id);
            var unread = !m.Read || state?.MarkedUnread == true;
            var repentance = m.Kind == ContactMessage.KindRepentance;
            return new InboxThread(
                Key(InboxChannel.Contact, id), InboxChannel.Contact, id,
                m.Name,
                m.Email,
                Preview(m.Body),
                replied is null || replied.Last < m.CreatedAtUtc ? m.CreatedAtUtc : replied.Last,
                unread, unread ? 1 : 0,
                state?.IsArchived(m.CreatedAtUtc) == true,
                AwaitingReply: replied is null,
                Assignee(state),
                new
                {
                    email = m.Email,
                    body = m.Body,
                    kind = m.Kind,
                    repentance,
                    reference = m.Reference,
                    orderRef = m.OrderRef,
                    replies = replied?.Count ?? 0,
                });
        })];
    }

    private async Task<List<InboxThread>> SupportAsync(
        Guid tenantId, Func<string, string, InboxThreadState?> stateOf, CancellationToken ct)
    {
        var conversations = await support.Conversations.AsNoTracking()
            .Where(c => c.TenantId == tenantId)
            .OrderByDescending(c => c.LastMessageAtUtc)
            .Take(WindowPerChannel)
            .ToListAsync(ct);
        if (conversations.Count == 0) return [];

        var ids = conversations.Select(c => c.Id).ToList();
        // El número de pedido (#1042) de cada conversación, en una sola consulta.
        var orderIds = conversations.Select(c => c.OrderId).Distinct().ToList();
        var tenant = TenantId.From(tenantId);
        var numbers = await orders.Orders.AsNoTracking()
            .Where(o => o.TenantId == tenant && orderIds.Contains(o.Id))
            .Select(o => new { o.Id, o.Number })
            .ToDictionaryAsync(o => o.Id, o => o.Number, ct);
        // El último mensaje de cada hilo (la vista previa) y el último del
        // CLIENTE: con ese se decide si una conversación archivada tiene algo
        // nuevo — que conteste el equipo no la tiene que desarchivar.
        var last = (await support.Messages.AsNoTracking()
                .Where(m => ids.Contains(m.ConversationId))
                .GroupBy(m => m.ConversationId)
                .Select(g => g.OrderByDescending(m => m.CreatedAtUtc).First())
                .ToListAsync(ct))
            .ToDictionary(m => m.ConversationId);
        var lastFromCustomer = (await support.Messages.AsNoTracking()
                .Where(m => ids.Contains(m.ConversationId) && !m.IsFromStaff)
                .GroupBy(m => m.ConversationId)
                .Select(g => new { g.Key, At = g.Max(m => m.CreatedAtUtc) })
                .ToListAsync(ct))
            .ToDictionary(x => x.Key, x => x.At);

        return [.. conversations.Select(c =>
        {
            var id = c.Id.ToString();
            var state = stateOf(InboxChannel.Support, id);
            var lastMessage = last.GetValueOrDefault(c.Id);
            var incomingAt = lastFromCustomer.TryGetValue(c.Id, out var at) ? at : c.CreatedAtUtc;
            var unread = c.UnreadForStaff > 0 || state?.MarkedUnread == true;
            var number = OrderLabel.For(numbers.GetValueOrDefault(c.OrderId), c.OrderId);
            return new InboxThread(
                Key(InboxChannel.Support, id), InboxChannel.Support, id,
                c.CustomerEmail,
                $"Pedido {number}",
                lastMessage is null ? "" : Preview(lastMessage.Body.Length > 0 ? lastMessage.Body : $"📎 {lastMessage.AttachmentName}"),
                c.LastMessageAtUtc,
                unread, Math.Max(c.UnreadForStaff, unread ? 1 : 0),
                state?.IsArchived(incomingAt) == true,
                AwaitingReply: lastMessage is { IsFromStaff: false },
                Assignee(state),
                new
                {
                    conversationId = c.Id,
                    orderId = c.OrderId,
                    orderNumber = number,
                    status = c.Status.ToString().ToUpperInvariant(),
                });
        })];
    }

    private static IEnumerable<InboxThread> MeliQuestions(
        MeliInboxSnapshot snapshot, Func<string, string, InboxThreadState?> stateOf) =>
        snapshot.Questions.Select(q =>
        {
            var id = q.Id.ToString(System.Globalization.CultureInfo.InvariantCulture);
            var state = stateOf(InboxChannel.MeliQuestion, id);
            // Una pregunta sin responder está "sin leer" hasta que alguien la
            // abre: es trabajo pendiente, y ML no tiene "leído" para preguntas.
            var unread = state?.MarkedUnread == true
                || (q.Unanswered && (state?.ReadAtUtc is null || state.ReadAtUtc < q.CreatedAtUtc));
            return new InboxThread(
                Key(InboxChannel.MeliQuestion, id), InboxChannel.MeliQuestion, id,
                q.Listing?.Title ?? q.ItemId ?? "Pregunta en Mercado Libre",
                q.Unanswered ? "Sin responder" : "Respondida",
                Preview(q.Text),
                q.AnsweredAtUtc ?? q.CreatedAtUtc,
                unread, unread ? 1 : 0,
                state?.IsArchived(q.CreatedAtUtc) == true,
                AwaitingReply: q.Unanswered,
                Assignee(state),
                new
                {
                    questionId = q.Id,
                    text = q.Text,
                    status = q.Status,
                    dateCreated = q.CreatedAtUtc,
                    answer = q.AnswerText is null ? null : new { text = q.AnswerText, dateCreated = q.AnsweredAtUtc },
                    listing = q.Listing,
                    demo = snapshot.Demo,
                });
        });

    /// <summary>
    /// Chats de posventa de ML. La API solo dice qué packs tienen algo sin
    /// leer: lo que se vio una vez queda anotado en el estado de la bandeja,
    /// así un chat leído no desaparece de la lista en la pasada siguiente.
    /// </summary>
    private async Task<List<InboxThread>> MeliMessagesAsync(
        Guid tenantId, MeliInboxSnapshot snapshot, Dictionary<(string, string), InboxThreadState> states,
        CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var unreadByPack = snapshot.UnreadPacks.ToDictionary(
            p => p.PackId.ToString(System.Globalization.CultureInfo.InvariantCulture), p => p.Count);

        var tracked = states.Values.Where(s => s.Channel == InboxChannel.MeliMessage).ToDictionary(s => s.ExternalId);
        var packIds = unreadByPack.Keys.Union(tracked.Keys).ToList();
        if (packIds.Count == 0) return [];

        var numericIds = packIds.Select(p => long.TryParse(p, out var v) ? v : 0).Where(v => v != 0).ToList();
        var orders = await meli.Orders.AsNoTracking()
            .Where(o => o.TenantId == tenantId
                && ((o.PackId != null && numericIds.Contains(o.PackId.Value)) || numericIds.Contains(o.MeliOrderId)))
            .ToListAsync(ct);
        MeliOrder? OrderOf(string packId) => orders.FirstOrDefault(o =>
            (o.PackId ?? o.MeliOrderId).ToString(System.Globalization.CultureInfo.InvariantCulture) == packId);

        var dirty = false;
        foreach (var packId in packIds)
        {
            var count = unreadByPack.GetValueOrDefault(packId);
            if (!tracked.TryGetValue(packId, out var state))
            {
                if (count == 0) continue;
                state = InboxThreadState.Create(tenantId, InboxChannel.MeliMessage, packId);
                support.InboxStates.Add(state);
                tracked[packId] = state;
            }
            // La demo dice "sin leer" siempre: una vez leído, queda leído.
            if (snapshot.Demo && state.ReadAtUtc is not null) count = 0;
            if (state.ExternalUnread != count || state.LastSeenActivityAtUtc is null || state.Title is null)
            {
                state.ObserveExternal(count, OrderOf(packId)?.BuyerNickname, now);
                dirty = true;
            }
        }
        if (dirty)
        {
            try { await support.SaveChangesAsync(ct); }
            catch (DbUpdateException)
            {
                // Dos paneles anotaron el mismo pack a la vez: el índice único
                // deja uno solo y la próxima pasada lo encuentra.
                foreach (var entry in support.ChangeTracker.Entries<InboxThreadState>().ToList())
                    entry.State = EntityState.Detached;
            }
        }

        return [.. tracked.Values
            .Where(s => s.LastSeenActivityAtUtc is { } seen && (s.ExternalUnread > 0 || now - seen < MeliMessageRetention))
            .Select(s =>
            {
                var order = OrderOf(s.ExternalId);
                var unread = s.ExternalUnread > 0 || s.MarkedUnread;
                var activity = s.LastSeenActivityAtUtc ?? now;
                return new InboxThread(
                    Key(InboxChannel.MeliMessage, s.ExternalId), InboxChannel.MeliMessage, s.ExternalId,
                    s.Title ?? order?.BuyerNickname ?? "Comprador de Mercado Libre",
                    order is null ? $"Pack {s.ExternalId}" : $"Venta {order.MeliOrderId}",
                    s.ExternalUnread > 0
                        ? (s.ExternalUnread == 1 ? "1 mensaje sin leer" : $"{s.ExternalUnread} mensajes sin leer")
                        : "Chat de la venta",
                    activity,
                    unread, Math.Max(s.ExternalUnread, unread ? 1 : 0),
                    s.IsArchived(activity),
                    AwaitingReply: s.ExternalUnread > 0,
                    Assignee(s),
                    new
                    {
                        packId = long.TryParse(s.ExternalId, out var pack) ? pack : 0,
                        meliOrderId = order?.MeliOrderId,
                        buyerNickname = order?.BuyerNickname,
                        total = order?.TotalAmount,
                        currency = order?.CurrencyId,
                        demo = snapshot.Demo,
                    });
            })];
    }

    // ---------------------------------------------------------------- helpers

    public static string Key(string channel, string externalId) => $"{channel}:{externalId}";

    private static InboxAssignee? Assignee(InboxThreadState? state) =>
        state?.AssignedUserId is { } id ? new InboxAssignee(id, state.AssignedUserName ?? "") : null;

    /// <summary>Un renglón de vista previa: sin saltos de línea y hasta 160 caracteres.</summary>
    internal static string Preview(string text)
    {
        var flat = string.Join(' ', text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return Text.Cap(flat, 160);
    }
}
