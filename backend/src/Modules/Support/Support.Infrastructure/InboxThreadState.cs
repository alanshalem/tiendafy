namespace Support.Infrastructure;

/// <summary>
/// Los canales que junta la bandeja unificada. Cada uno guarda sus mensajes
/// donde siempre (contacto en Customers, posventa acá, Mercado Libre en ML);
/// la bandeja solo los lista juntos y les agrega lo que ningún canal tenía:
/// a quién del equipo le toca, si se archivó y cómo se marcó de leída.
/// </summary>
public static class InboxChannel
{
    public const string Contact = "contacto";
    public const string Support = "posventa";
    public const string MeliQuestion = "ml-pregunta";
    public const string MeliMessage = "ml-mensaje";

    public static readonly IReadOnlyList<string> All = [Contact, Support, MeliQuestion, MeliMessage];

    public static bool IsKnown(string? channel) => channel is not null && All.Contains(channel);
}

/// <summary>
/// Lo que la bandeja sabe de una conversación de cualquier canal. La fila
/// nace recién cuando alguien hace algo con la conversación (la asigna, la
/// archiva, la marca) o cuando el canal no tiene historia propia que leer
/// (los mensajes de Mercado Libre: la API solo dice qué packs tienen algo sin
/// leer, y sin esta fila un pack leído desaparecería de la bandeja).
///
/// <para>
/// Archivar no es para siempre: una conversación archivada vuelve sola a la
/// bandeja cuando el cliente escribe de nuevo (actividad entrante posterior al
/// archivo). Archivar una consulta resuelta y perderse la repregunta es el
/// error que esto evita.
/// </para>
/// </summary>
public sealed class InboxThreadState
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Channel { get; private set; } = null!;

    /// <summary>Id de la conversación en su canal (guid, id de pregunta o de pack de ML).</summary>
    public string ExternalId { get; private set; } = null!;

    public Guid? AssignedUserId { get; private set; }

    /// <summary>Snapshot del nombre de quien la tiene (evita ir a Identity para pintar la lista).</summary>
    public string? AssignedUserName { get; private set; }

    public DateTime? AssignedAtUtc { get; private set; }
    public DateTime? ArchivedAtUtc { get; private set; }

    /// <summary>Cuándo alguien del equipo la leyó (para canales sin "leído" propio: preguntas de ML).</summary>
    public DateTime? ReadAtUtc { get; private set; }

    /// <summary>"Marcar como no leída" a mano: manda sobre lo que diga el canal hasta que se vuelva a leer.</summary>
    public bool MarkedUnread { get; private set; }

    /// <summary>
    /// Última actividad entrante que vio la bandeja en canales sin historia
    /// local (packs de ML): es la fecha con la que se ordena y se desarchiva.
    /// </summary>
    public DateTime? LastSeenActivityAtUtc { get; private set; }

    /// <summary>Mensajes sin leer que informó el canal la última vez (packs de ML).</summary>
    public int ExternalUnread { get; private set; }

    /// <summary>Título guardado para canales que no lo traen al listar (apodo del comprador de ML).</summary>
    public string? Title { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    private InboxThreadState() { } // EF Core

    public static InboxThreadState Create(Guid tenantId, string channel, string externalId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        Channel = channel,
        ExternalId = externalId.Trim(),
        UpdatedAtUtc = DateTime.UtcNow,
    };

    public void Assign(Guid userId, string userName)
    {
        AssignedUserId = userId;
        AssignedUserName = userName.Length > 200 ? userName[..200] : userName;
        AssignedAtUtc = DateTime.UtcNow;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void Unassign()
    {
        AssignedUserId = null;
        AssignedUserName = null;
        AssignedAtUtc = null;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void Archive()
    {
        ArchivedAtUtc = DateTime.UtcNow;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void Unarchive()
    {
        ArchivedAtUtc = null;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void MarkRead()
    {
        ReadAtUtc = DateTime.UtcNow;
        MarkedUnread = false;
        ExternalUnread = 0;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void MarkUnread()
    {
        MarkedUnread = true;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Archivada mientras no haya entrado nada nuevo después de archivarla.
    /// </summary>
    public bool IsArchived(DateTime lastIncomingAtUtc) =>
        ArchivedAtUtc is { } archived && archived >= lastIncomingAtUtc;

    /// <summary>
    /// Lo que informa un canal sin historia local en cada pasada: cuántos
    /// mensajes sin leer tiene. Si pasó de cero a algo, entró actividad nueva
    /// (y con eso se ordena y se desarchiva).
    /// </summary>
    public void ObserveExternal(int unread, string? title, DateTime nowUtc)
    {
        if (unread > 0 && ExternalUnread == 0) LastSeenActivityAtUtc = nowUtc;
        LastSeenActivityAtUtc ??= nowUtc;
        ExternalUnread = Math.Max(0, unread);
        if (!string.IsNullOrWhiteSpace(title)) Title = title.Length > 200 ? title[..200] : title;
        UpdatedAtUtc = nowUtc;
    }
}

/// <summary>
/// Una respuesta mandada desde la bandeja en un canal que no guarda historia
/// propia: el formulario de contacto se contesta por email, y sin esto nadie
/// del equipo sabría si ya se respondió ni qué se dijo.
/// </summary>
public sealed class InboxReply
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Channel { get; private set; } = null!;
    public string ExternalId { get; private set; } = null!;
    public Guid? AuthorUserId { get; private set; }
    public string AuthorName { get; private set; } = null!;
    public string Body { get; private set; } = null!;
    public DateTime CreatedAtUtc { get; private set; }

    private InboxReply() { } // EF Core

    public static InboxReply Create(
        Guid tenantId, string channel, string externalId, Guid? authorUserId, string authorName, string body)
    {
        var text = body.Trim();
        return new InboxReply
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Channel = channel,
            ExternalId = externalId,
            AuthorUserId = authorUserId,
            AuthorName = authorName.Length > 200 ? authorName[..200] : authorName,
            Body = text.Length > 4000 ? text[..4000] : text,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }
}
