using Api.Auth;
using Api.Meli;
using Customers.Infrastructure;
using Identity.Infrastructure;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

/// <summary>
/// "Para hacer hoy" del Inicio: las colas reales del día, contadas en la base.
///
/// Antes el Inicio pedía listados (las últimas 50 ventas de ML, por ejemplo)
/// y contaba en el navegador: el número se clavaba en 50 aunque hubiera 300.
/// Acá cada cola es un COUNT con la misma regla que usa su listado, así el
/// número del aviso es lo que aparece al tocarlo.
///
/// Cada contador sale solo si la persona puede ver esa cola: los que no, van
/// en null y el panel no los muestra (a Soporte no le sirve "facturá ML").
/// </summary>
public static class HomeEndpoints
{
    public static RouteGroupBuilder MapHomeEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/home/todo", async (
            HttpContext http, ITenantContext tenant, IOrderRepository orders, CustomersDbContext customers,
            MeliDbContext meli, MeliTokenService tokens, MeliClient meliClient,
            global::Fiscal.Infrastructure.Persistence.FiscalDbContext fiscal, CancellationToken ct) =>
        {
            var access = await http.GetAccessAsync();
            if (access is null) return AuthExtensions.NotAMember();
            var tid = tenant.TenantId;

            int? toDispatch = null, pendingTransfers = null;
            if (access.Can(Permission.OrdersRead))
            {
                // Lo mismo que "Por despachar" de Ventas: cobradas sin despachar.
                toDispatch = await orders.CountAsync(tid, new OrderListFilter(Status: nameof(OrderStatus.Paid)), ct);
                // Transferencias que el cliente dijo que iba a hacer y todavía
                // nadie confirmó. Si la tienda no usa ese circuito, da 0.
                pendingTransfers = await orders.CountAsync(tid, new OrderListFilter(
                    Status: nameof(OrderStatus.PendingPayment), Payment: OrderPayment.Transfer), ct);
            }

            object? messages = null;
            if (access.Can(Permission.MessagesRead))
            {
                var unread = customers.ContactMessages.AsNoTracking()
                    .Where(m => m.TenantId == tid.Value && !m.Read);
                var repentance = unread.Where(m => m.Kind == ContactMessage.KindRepentance);
                messages = new
                {
                    unreadContact = await unread.CountAsync(m => m.Kind != ContactMessage.KindRepentance, ct),
                    repentance = await repentance.CountAsync(ct),
                    // El plazo corre desde la más vieja sin atender.
                    oldestRepentanceAtUtc = await repentance.MinAsync(m => (DateTime?)m.CreatedAtUtc, ct),
                };
            }

            object? mercadoLibre = null;
            if (access.Can(Permission.MeliOperate))
            {
                var connection = await meli.Connections.AsNoTracking().FirstOrDefaultAsync(ct);
                if (connection is not null)
                {
                    mercadoLibre = new
                    {
                        unbilled = await MeliOrderFilters.OnlyUnbilled(meli.Orders.AsNoTracking()).CountAsync(ct),
                        unanswered = await UnansweredQuestionsAsync(connection, tokens, meliClient, ct),
                    };
                }
            }

            // Para que el aviso de ML sin facturar lleve a facturar o, si todavía
            // no se puede, a configurar la facturación.
            bool? fiscalReady = access.Can(Permission.FiscalEmit)
                ? (await Api.Fiscal.FiscalReadiness.CheckAsync(fiscal, tid.Value, ct)).Ready
                : null;

            return Results.Ok(new { toDispatch, pendingTransfers, messages, mercadoLibre, fiscalReady });
        }).RequireAnyPermission(Permission.OrdersRead, Permission.MessagesRead, Permission.MeliOperate);

        return group;
    }

    /// <summary>
    /// Preguntas sin responder en ML. No hay copia local (las preguntas se
    /// leen en vivo), así que se le pide a ML solo el total. Si ML no
    /// contesta, null: el Inicio no puede romperse porque ML esté lento.
    /// </summary>
    private static async Task<int?> UnansweredQuestionsAsync(
        MeliConnection connection, MeliTokenService tokens, MeliClient client, CancellationToken ct)
    {
        if (connection.IsDemo)
            return System.Text.Json.JsonSerializer.SerializeToElement(MeliDemoFeed.Questions("UNANSWERED"))
                .GetProperty("total").GetInt32();
        try
        {
            var token = await tokens.GetValidTokenAsync(connection.TenantId, ct);
            if (token is null) return null;
            using var doc = await client.GetAsync(token,
                $"/questions/search?seller_id={connection.MeliUserId}&api_version=4&status=UNANSWERED&limit=1", ct);
            return doc.RootElement.TryGetProperty("total", out var total)
                && total.ValueKind == System.Text.Json.JsonValueKind.Number
                ? total.GetInt32()
                : null;
        }
        catch (MeliException)
        {
            return null;
        }
    }
}
