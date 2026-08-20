using Analytics.Infrastructure;
using Api.Crm;
using Catalog.Core.Domain;
using Catalog.Infrastructure.Persistence;
using Checkout.Core.Domain;
using Checkout.Infrastructure.Persistence;
using Content.Infrastructure;
using Customers.Infrastructure;
using Discounts.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Notifications.Infrastructure;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using Purchasing.Infrastructure;
using SharedKernel.Common;
using Support.Infrastructure;

namespace Api.Startup;

/// <summary>
/// Llena una tienda con una operación de ejemplo verosímil: ventas repartidas
/// en tres meses, clientes, visitas, cupones usados, compras a proveedores,
/// consultas y campañas. Existe para poder MOSTRAR el panel — con la base
/// vacía, doce pantallas dicen "todavía no hay nada" y no se ve qué hacen.
///
/// SOLO en Development, y detrás de un endpoint explícito: nada de esto se
/// dispara solo al arrancar. Cada bloque es idempotente por su cuenta — si la
/// tienda ya tiene ventas, no vuelve a inventarlas — así que se puede correr
/// de nuevo para completar lo que falte sin duplicar lo que ya está.
///
/// Lo que NO siembra, a propósito: Mercado Libre y Redes sociales. Las dos
/// dependen de una cuenta externa conectada por OAuth; datos falsos ahí
/// mostrarían publicaciones que no existen en ninguna red real.
/// </summary>
public sealed class DemoDataSeeder(
    CatalogDbContext catalog,
    OrdersDbContext orders,
    CustomersDbContext customers,
    DiscountsDbContext discounts,
    AnalyticsDbContext analytics,
    CheckoutDbContext checkout,
    PurchasingDbContext purchasing,
    SupportDbContext support,
    NotificationsDbContext notifications,
    ContentDbContext content,
    CustomerDirectory directory,
    ILogger<DemoDataSeeder> logger)
{
    /// <summary>Semilla fija: la demo sale igual todas las veces.</summary>
    private const int Seed = 20260820;

    /// <summary>Marca de agua de las visitas sembradas: hace el bloque repetible.</summary>
    private const string DemoVisitorPrefix = "demo-";

    private const int SalesDays = 90;
    private const int VisitDays = 30;

    private readonly Random _rng = new(Seed);

    private static readonly (string Name, string Email)[] Buyers =
    {
        ("Lucía Fernández", "lucia.fernandez@example.com"),
        ("Martín Gómez", "martin.gomez@example.com"),
        ("Sofía Ramírez", "sofia.ramirez@example.com"),
        ("Diego Sosa", "diego.sosa@example.com"),
        ("Valentina Ruiz", "valentina.ruiz@example.com"),
        ("Joaquín Medina", "joaquin.medina@example.com"),
        ("Camila Ortiz", "camila.ortiz@example.com"),
        ("Nicolás Herrera", "nicolas.herrera@example.com"),
        ("Julieta Castro", "julieta.castro@example.com"),
        ("Tomás Aguirre", "tomas.aguirre@example.com"),
        ("Agustina Vega", "agustina.vega@example.com"),
        ("Federico Molina", "federico.molina@example.com"),
        ("Micaela Rojas", "micaela.rojas@example.com"),
        ("Santiago Peralta", "santiago.peralta@example.com"),
        ("Florencia Cabrera", "florencia.cabrera@example.com"),
        ("Emiliano Ledesma", "emiliano.ledesma@example.com"),
    };

    private static readonly string[] Cities =
    {
        "Av. Corrientes 1234, CABA", "San Martín 450, Rosario", "Belgrano 890, Córdoba",
        "Mitre 275, La Plata", "Rivadavia 1500, Mar del Plata", "Sarmiento 620, Mendoza",
    };

    /// <summary>
    /// Cuántos compradores forman el núcleo de clientes que vuelve. El resto de
    /// las ventas van a gente nueva: si todas las compras cayeran en la misma
    /// docena de personas, "clientes nuevos por mes" daría cero desde el
    /// segundo mes y la pantalla de clientes no mostraría crecimiento.
    /// </summary>
    private const int ReturningBuyers = 24;

    /// <summary>De dónde llega la gente. El peso importa: el reparto se ve en los gráficos.</summary>
    private static readonly string?[] Sources =
    {
        null, null, null, "instagram", "instagram", "google", "google", "facebook", "email", "whatsapp",
    };

    /// <summary>Resumen de lo sembrado, para devolverlo por la API.</summary>
    public sealed record Report(Dictionary<string, int> Created, List<string> Skipped);

    /// <summary>
    /// Borra lo que sembró este seeder para poder volver a empezar: ventas,
    /// carritos, cupones, compras, consultas, campañas, páginas, las fichas de
    /// los clientes de ejemplo y las visitas marcadas como demo.
    ///
    /// NO toca el catálogo: los productos, las fotos y el stock son datos de
    /// verdad de la tienda. Los costos cargados tampoco se borran — son una
    /// mejora del catálogo, no basura de la demo.
    /// </summary>
    public async Task<int> ResetAsync(TenantId tenantId, CancellationToken ct = default)
    {
        var id = tenantId.Value;
        var demoEmails = Buyers.Select(b => b.Email[..b.Email.IndexOf('@', StringComparison.Ordinal)]).ToList();

        var removed = 0;
        removed += await support.Messages.Where(m => m.TenantId == id).ExecuteDeleteAsync(ct);
        removed += await support.Conversations.Where(c => c.TenantId == id).ExecuteDeleteAsync(ct);
        removed += await notifications.CampaignRecipients.Where(r => r.TenantId == id).ExecuteDeleteAsync(ct);
        removed += await notifications.EmailCampaigns.Where(c => c.TenantId == id).ExecuteDeleteAsync(ct);
        removed += await customers.ContactMessages.Where(m => m.TenantId == id).ExecuteDeleteAsync(ct);
        removed += await purchasing.PurchaseOrders.Where(p => p.TenantId == id).ExecuteDeleteAsync(ct);
        removed += await discounts.Coupons.Where(c => c.TenantId == id).ExecuteDeleteAsync(ct);
        removed += await content.Pages.Where(p => p.TenantId == id).ExecuteDeleteAsync(ct);
        removed += await checkout.Sessions.Where(s => s.TenantId == tenantId).ExecuteDeleteAsync(ct);
        removed += await orders.Orders.Where(o => o.TenantId == tenantId).ExecuteDeleteAsync(ct);
        removed += await analytics.PageViews
            .Where(v => v.TenantId == id && v.VisitorId.StartsWith(DemoVisitorPrefix)).ExecuteDeleteAsync(ct);

        // Solo las fichas de los compradores inventados: los clientes reales y
        // los de prueba del login no son de este seeder.
        removed += await customers.Customers
            .Where(c => c.TenantId == id && c.Email != null
                && demoEmails.Any(prefix => c.Email!.StartsWith(prefix)))
            .ExecuteDeleteAsync(ct);

        logger.LogWarning("Demo borrada en {TenantId}: {Rows} filas.", id, removed);
        return removed;
    }

    public async Task<Report> SeedAsync(TenantId tenantId, CancellationToken ct = default)
    {
        var created = new Dictionary<string, int>();
        var skipped = new List<string>();

        async Task Block(string name, Func<Task<int>> run)
        {
            var n = await run();
            if (n > 0) created[name] = n;
            else skipped.Add(name);
        }

        // El orden importa: los costos alimentan la rentabilidad de las ventas,
        // y los cupones tienen que existir antes de que una venta los use.
        await Block("costos", () => SeedCostsAsync(tenantId, ct));
        await Block("cupones", () => SeedCouponsAsync(tenantId, ct));
        await Block("ventas", () => SeedOrdersAsync(tenantId, ct));
        await Block("carritos abandonados", () => SeedAbandonedCartsAsync(tenantId, ct));
        await Block("visitas", () => SeedVisitsAsync(tenantId, ct));
        await Block("compras", () => SeedPurchasesAsync(tenantId, ct));
        await Block("mensajes de contacto", () => SeedContactMessagesAsync(tenantId, ct));
        await Block("chat posventa", () => SeedSupportAsync(tenantId, ct));
        await Block("campañas de email", () => SeedCampaignsAsync(tenantId, ct));
        await Block("páginas de contenido", () => SeedPagesAsync(tenantId, ct));

        logger.LogInformation("Demo sembrada en {TenantId}: {Created}", tenantId.Value,
            string.Join(", ", created.Select(kv => $"{kv.Key}={kv.Value}")));

        return new Report(created, skipped);
    }

    // ------------------------------------------------------------- Catálogo

    /// <summary>
    /// Costo por variante donde falte: entre el 45 % y el 65 % del precio, que
    /// es el rango en el que se mueve una importadora. Sin esto, Rentabilidad y
    /// Costos quedan vacías aunque haya miles de productos cargados.
    /// </summary>
    private async Task<int> SeedCostsAsync(TenantId tenantId, CancellationToken ct)
    {
        var products = await catalog.Products
            .Where(p => p.TenantId == tenantId)
            .ToListAsync(ct);

        var touched = 0;
        foreach (var product in products)
        {
            foreach (var variant in product.Variants.Where(v => v.Cost is null && v.Price.AmountInMinorUnits > 0))
            {
                var ratio = 0.45 + (_rng.NextDouble() * 0.20);
                var cost = (long)Math.Round(variant.Price.AmountInMinorUnits * ratio / 100) * 100;
                if (cost <= 0) continue;
                product.SetVariantCost(variant.Id, new Money(cost, variant.Price.Currency));
                touched++;
            }
        }

        if (touched > 0) await catalog.SaveChangesAsync(ct);
        return touched;
    }

    // -------------------------------------------------------------- Cupones

    private async Task<int> SeedCouponsAsync(TenantId tenantId, CancellationToken ct)
    {
        if (await discounts.Coupons.AnyAsync(c => c.TenantId == tenantId.Value, ct)) return 0;

        var now = DateTime.UtcNow;
        var specs = new (string Code, CouponType Type, long Value, long Min, DateTime? Ends, int? MaxUses, bool Active)[]
        {
            ("BIENVENIDO10", CouponType.Percentage, 10, 0, null, null, true),
            ("ENVIOGRATIS", CouponType.FreeShipping, 0, 5_000_00, now.AddDays(45), null, true),
            ("VERANO25", CouponType.Percentage, 25, 20_000_00, now.AddDays(20), 200, true),
            ("PRIMERACOMPRA", CouponType.FixedAmount, 8_000_00, 30_000_00, now.AddDays(60), 100, true),
            ("BLACKFRIDAY", CouponType.Percentage, 30, 0, now.AddDays(-15), 500, false),
        };

        var added = 0;
        foreach (var (code, type, value, min, ends, maxUses, active) in specs)
        {
            var result = Coupon.Create(tenantId.Value, code, type, value, min, null, ends, maxUses, active);
            if (result.IsFailure) continue;
            discounts.Coupons.Add(result.Value);
            added++;
        }

        await discounts.SaveChangesAsync(ct);
        return added;
    }

    // --------------------------------------------------------------- Ventas

    /// <summary>
    /// ~130 ventas repartidas en 90 días, con más volumen en las semanas
    /// recientes y picos de fin de semana. Los estados y las fuentes salen
    /// mezclados a propósito: es lo que hace que los gráficos y los filtros
    /// del panel muestren algo distinto de una sola barra.
    /// </summary>
    private async Task<int> SeedOrdersAsync(TenantId tenantId, CancellationToken ct)
    {
        if (await orders.Orders.AnyAsync(o => o.TenantId == tenantId, ct)) return 0;

        var sellable = await SellableVariantsAsync(tenantId, ct);
        if (sellable.Count == 0) return 0;

        var codes = await discounts.Coupons
            .Where(c => c.TenantId == tenantId.Value && c.Active)
            .Select(c => c.Code).ToListAsync(ct);

        var now = DateTime.UtcNow;
        var made = new List<Order>();

        for (var day = SalesDays; day >= 0; day--)
        {
            var date = now.AddDays(-day);
            // Más ventas cuanto más cerca de hoy, y más los fines de semana:
            // una serie plana no se distingue de un dato de relleno.
            var baseline = 1 + ((SalesDays - day) / 30);
            var weekend = date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday ? 1 : 0;
            var count = Math.Max(0, _rng.Next(0, baseline + 2) + weekend);

            for (var i = 0; i < count; i++)
            {
                var order = BuildOrder(tenantId, sellable, codes, date);
                if (order is not null) made.Add(order);
            }
        }

        orders.Orders.AddRange(made);
        await orders.SaveChangesAsync(ct);

        // La agenda de clientes se arma desde las ventas, igual que en producción.
        foreach (var order in made.Where(o => o.Status is OrderStatus.Paid or OrderStatus.Fulfilled))
            await directory.UpsertFromOrderAsync(order, ct);

        await BackdateCustomersAsync(tenantId, ct);
        await RegisterCouponUsesAsync(tenantId, ct);
        return made.Count;
    }

    private Order? BuildOrder(
        TenantId tenantId, IReadOnlyList<SellableVariant> sellable, List<string> codes, DateTime placedAt)
    {
        var (name, email) = PickBuyer();
        var lineCount = _rng.Next(1, 4);
        var lines = new List<(Guid, string, string, string, Money, int, Guid?, Money?)>();

        for (var i = 0; i < lineCount; i++)
        {
            var v = sellable[_rng.Next(sellable.Count)];
            if (lines.Any(l => l.Item1 == v.VariantId)) continue;
            lines.Add((v.VariantId, v.ProductName, v.VariantDescription, v.Sku, v.Price, _rng.Next(1, 4), null, v.Cost));
        }
        if (lines.Count == 0) return null;

        var subtotal = lines.Sum(l => l.Item5.AmountInMinorUnits * l.Item6);

        // Un quinto de las ventas usa cupón: suficiente para que el reporte de
        // cupones tenga qué mostrar, sin que parezca que se regala todo.
        string? coupon = null;
        Money? discount = null;
        if (codes.Count > 0 && _rng.Next(5) == 0)
        {
            coupon = codes[_rng.Next(codes.Count)];
            discount = new Money((long)Math.Round(subtotal * 0.10 / 100) * 100, Money.DefaultCurrency);
        }

        var created = Order.Create(
            tenantId, Guid.NewGuid(), email, Money.DefaultCurrency, lines, discount, coupon);
        if (created.IsFailure) return null;
        var order = created.Value;

        order.SetUtmSource(Sources[_rng.Next(Sources.Length)]);
        order.SetShippingAndBuyer(
            new Money(_rng.Next(0, 4) == 0 ? 0 : 4_500_00, Money.DefaultCurrency),
            _rng.Next(3) == 0 ? "Retiro en sucursal" : "Correo Argentino - Clásico",
            Cities[_rng.Next(Cities.Length)],
            name, $"11{_rng.Next(30_000_000, 69_999_999)}", null, null);

        ApplyLifecycle(order, placedAt);
        Backdate(orders, order, placedAt);
        return order;
    }

    /// <summary>
    /// Seis de cada diez compras son de un cliente que ya compró; el resto, de
    /// alguien nuevo. Sale de la misma lista de nombres con un número atrás:
    /// alcanza para que la agenda de clientes y la recurrencia se vean, sin
    /// inventar mil nombres distintos.
    /// </summary>
    private (string Name, string Email) PickBuyer()
    {
        var index = _rng.Next(100) < 60 ? _rng.Next(ReturningBuyers) : _rng.Next(ReturningBuyers, 260);
        var (name, email) = Buyers[index % Buyers.Length];
        var round = index / Buyers.Length;
        if (round == 0) return (name, email);

        var at = email.IndexOf('@', StringComparison.Ordinal);
        return ($"{name} ({round + 1})", $"{email[..at]}{round + 1}{email[at..]}");
    }

    /// <summary>
    /// Estados con la proporción de una tienda que funciona: la mayoría cobra y
    /// despacha, y queda una minoría de pendientes, caídas y devoluciones.
    /// </summary>
    private void ApplyLifecycle(Order order, DateTime placedAt)
    {
        var roll = _rng.Next(100);
        var age = (DateTime.UtcNow - placedAt).TotalDays;

        if (roll < 8)
        {
            // Las más viejas ya no pueden seguir "esperando el pago".
            if (age > 3) order.MarkCancelled();
            return;
        }
        if (roll < 12) { order.MarkFailed($"demo-{Guid.NewGuid():N}"[..16]); return; }

        order.MarkPaid($"demo-{_rng.Next(100_000_000, 999_999_999)}");
        Touch(order, nameof(Order.PaidAtUtc), placedAt.AddMinutes(_rng.Next(2, 90)));

        // Comisión de la pasarela: sin esto la rentabilidad exagera la ganancia.
        order.RecordMpFee(new Money((long)Math.Round(order.Total.AmountInMinorUnits * 0.0629 / 100) * 100, order.Currency));

        if (roll < 20) return; // pagada, todavía sin despachar

        if (roll >= 96)
        {
            order.ApplyRefund(order.Total);
            return;
        }

        order.MarkFulfilled($"CA{_rng.Next(100_000_000, 999_999_999)}AR");
        Touch(order, nameof(Order.FulfilledAtUtc), placedAt.AddDays(_rng.Next(1, 4)));
    }

    /// <summary>
    /// Pone el contador de usos de cada cupón a tono con las ventas que lo
    /// usaron. El reporte de cupones cuenta desde las ventas, pero el listado
    /// muestra este contador: sin esto, un cupón usado veinte veces figura
    /// como "0 usos" y el límite de usos parece no funcionar.
    /// </summary>
    private async Task RegisterCouponUsesAsync(TenantId tenantId, CancellationToken ct)
    {
        var uses = await orders.Orders
            .Where(o => o.TenantId == tenantId && o.CouponCode != null
                && OrderStatuses.Earning.Contains(o.Status))
            .GroupBy(o => o.CouponCode!)
            .Select(g => new { Code = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        if (uses.Count == 0) return;

        var coupons = await discounts.Coupons
            .Where(c => c.TenantId == tenantId.Value)
            .ToListAsync(ct);

        foreach (var coupon in coupons)
        {
            var count = uses.FirstOrDefault(u => u.Code == coupon.Code)?.Count ?? 0;
            for (var i = 0; i < count; i++) coupon.RegisterUse();
        }

        await discounts.SaveChangesAsync(ct);
    }

    // --------------------------------------------------- Carritos abandonados

    private async Task<int> SeedAbandonedCartsAsync(TenantId tenantId, CancellationToken ct)
    {
        if (await checkout.Sessions.AnyAsync(s => s.TenantId == tenantId, ct)) return 0;

        var sellable = await SellableVariantsAsync(tenantId, ct);
        if (sellable.Count == 0) return 0;

        var now = DateTime.UtcNow;
        var added = 0;

        for (var i = 0; i < 22; i++)
        {
            var lines = new List<(Guid, string, string, string, Money, int)>();
            for (var l = 0; l < _rng.Next(1, 4); l++)
            {
                var v = sellable[_rng.Next(sellable.Count)];
                if (lines.Any(x => x.Item1 == v.VariantId)) continue;
                lines.Add((v.VariantId, v.ProductName, v.VariantDescription, v.Sku, v.Price, _rng.Next(1, 3)));
            }
            if (lines.Count == 0) continue;

            var created = CheckoutSession.Create(tenantId, lines);
            if (created.IsFailure) continue;
            var session = created.Value;

            // Dos de cada tres dejaron el email: son los recuperables, y es la
            // diferencia que la pantalla muestra entre "valor" y "recuperable".
            if (_rng.Next(3) > 0)
            {
                var (name, email) = PickBuyer();
                Touch(session, nameof(CheckoutSession.Email), email);
                Touch(session, nameof(CheckoutSession.BuyerName), name);
            }

            var when = now.AddDays(-_rng.Next(0, 25)).AddHours(-_rng.Next(0, 23));
            Backdate(checkout, session, when);
            Touch(session, nameof(CheckoutSession.ExpiresAtUtc), when.AddMinutes(30));

            checkout.Sessions.Add(session);
            added++;
        }

        await checkout.SaveChangesAsync(ct);
        return added;
    }

    // -------------------------------------------------------------- Visitas

    /// <summary>
    /// Tráfico de 30 días con visitantes que vuelven, fuentes mezcladas y un
    /// pico en las últimas horas para que "Tiempo real" tenga pulso.
    /// </summary>
    private async Task<int> SeedVisitsAsync(TenantId tenantId, CancellationToken ct)
    {
        // El corte va por el prefijo del visitante, no por "¿hay visitas?": una
        // tienda con tráfico real igual necesita el volumen de la demo, y así
        // correr el seeder dos veces no duplica nada.
        if (await analytics.PageViews.AnyAsync(
                p => p.TenantId == tenantId.Value && p.VisitorId.StartsWith(DemoVisitorPrefix), ct))
            return 0;

        var paths = new[] { "/", "/productos", "/productos", "/carrito", "/checkout", "/contacto" };
        var now = DateTime.UtcNow;
        var views = new List<PageView>();

        for (var day = VisitDays; day >= 0; day--)
        {
            var date = now.AddDays(-day);
            var weekend = date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
            var visitors = _rng.Next(25, 60) + (weekend ? 20 : 0) + ((VisitDays - day) / 3);

            for (var v = 0; v < visitors; v++)
            {
                // Un visitante recurrente por cada diez: sin repetición, "únicos"
                // y "visitas" darían siempre lo mismo y la métrica no diría nada.
                var visitorId = _rng.Next(10) == 0
                    ? DemoVisitorPrefix + $"vuelve-{_rng.Next(1, 40)}"
                    : (DemoVisitorPrefix + Guid.NewGuid().ToString("N"))[..24];
                var sessionId = $"s-{Guid.NewGuid():N}"[..24];
                var source = Sources[_rng.Next(Sources.Length)];

                foreach (var path in paths.Take(_rng.Next(1, paths.Length + 1)))
                {
                    var view = PageView.Create(tenantId.Value, path, null, visitorId, sessionId, source);
                    Touch(view, nameof(PageView.OccurredAtUtc),
                        date.Date.AddHours(_rng.Next(8, 24)).AddMinutes(_rng.Next(0, 60)));
                    views.Add(view);
                }
            }
        }

        // Pulso de la última hora, que es lo único que mira Tiempo real.
        for (var i = 0; i < 40; i++)
        {
            var view = PageView.Create(
                tenantId.Value, paths[_rng.Next(paths.Length)], null,
                (DemoVisitorPrefix + Guid.NewGuid().ToString("N"))[..24], $"s-{Guid.NewGuid():N}"[..24],
                Sources[_rng.Next(Sources.Length)]);
            Touch(view, nameof(PageView.OccurredAtUtc), now.AddMinutes(-_rng.Next(0, 58)));
            views.Add(view);
        }

        analytics.PageViews.AddRange(views);
        await analytics.SaveChangesAsync(ct);
        return views.Count;
    }

    // -------------------------------------------------------------- Compras

    private async Task<int> SeedPurchasesAsync(TenantId tenantId, CancellationToken ct)
    {
        if (await purchasing.PurchaseOrders.AnyAsync(p => p.TenantId == tenantId.Value, ct)) return 0;

        var sellable = await SellableVariantsAsync(tenantId, ct);
        if (sellable.Count == 0) return 0;

        var specs = new (string Supplier, string Reference, PurchaseOrderStatus Status, int DaysAgo)[]
        {
            ("Shenzhen Trading Co.", "PO-2026-014", PurchaseOrderStatus.Draft, 3),
            ("Guangzhou Electronics", "PO-2026-013", PurchaseOrderStatus.Confirmed, 12),
            ("Ningbo Home Ltd.", "PO-2026-012", PurchaseOrderStatus.InTransit, 34),
            ("Shenzhen Trading Co.", "PO-2026-011", PurchaseOrderStatus.InCustoms, 52),
            ("Yiwu Market Group", "PO-2026-010", PurchaseOrderStatus.Received, 78),
        };

        var added = 0;
        foreach (var (supplier, reference, status, daysAgo) in specs)
        {
            var created = PurchaseOrder.Create(tenantId.Value, supplier);
            if (created.IsFailure) continue;
            var po = created.Value;

            po.UpdateDraft(supplier, reference, "Orden de ejemplo para la demo.", "USD", 1_320m, _rng.Next(30, 75));

            var lines = new List<(Guid, string, string, string, int, decimal)>();
            for (var i = 0; i < _rng.Next(3, 7); i++)
            {
                var v = sellable[_rng.Next(sellable.Count)];
                if (lines.Any(l => l.Item1 == v.VariantId)) continue;
                // Costo FOB en dólares, partiendo del costo local a un TC de ejemplo.
                var fob = Math.Round((v.Cost?.AmountInMinorUnits ?? 500_00) / 100m / 1_320m * 0.8m, 2);
                lines.Add((v.VariantId, v.ProductName, v.VariantDescription, v.Sku, _rng.Next(20, 200), Math.Max(0.5m, fob)));
            }
            if (lines.Count == 0) continue;

            po.SetItems(lines);
            po.SetExpenses(new List<(string, decimal, bool)>
            {
                ("Flete internacional", _rng.Next(600, 1800), false),
                ("Despachante y aduana", _rng.Next(150_000, 400_000), true),
            });

            // El ciclo se recorre de verdad (Draft → … → Received) en vez de
            // escribir el estado final a mano: así las fechas del ciclo quedan.
            foreach (var step in new[]
                     {
                         PurchaseOrderStatus.Confirmed, PurchaseOrderStatus.InProduction,
                         PurchaseOrderStatus.InTransit, PurchaseOrderStatus.InCustoms,
                     })
            {
                if (step > status || status == PurchaseOrderStatus.Draft) break;
                if (step == PurchaseOrderStatus.InProduction && status != PurchaseOrderStatus.Received) continue;
                po.AdvanceTo(step);
                if (po.Status == status) break;
            }

            if (status == PurchaseOrderStatus.Received)
            {
                po.Receive(po.Items.ToDictionary(i => i.VariantId, i => i.Quantity), 1_345m);
                po.SetSupplierInvoice("30-71234567-9", "A", $"0001-{_rng.Next(10_000, 99_999)}",
                    DateTime.UtcNow.AddDays(-daysAgo + 5), 4_200_000m, 882_000m);
            }

            Backdate(purchasing, po, DateTime.UtcNow.AddDays(-daysAgo));
            purchasing.PurchaseOrders.Add(po);
            added++;
        }

        await purchasing.SaveChangesAsync(ct);
        return added;
    }

    // ------------------------------------------------- Mensajes de contacto

    private async Task<int> SeedContactMessagesAsync(TenantId tenantId, CancellationToken ct)
    {
        if (await customers.ContactMessages.AnyAsync(m => m.TenantId == tenantId.Value, ct)) return 0;

        var bodies = new[]
        {
            "Hola, quería saber si hacen envíos a Neuquén y cuánto demora.",
            "¿Tienen stock del modelo negro? En la web me figura agotado.",
            "Compré ayer y necesito cambiar la dirección de entrega, ¿es posible?",
            "¿Emiten factura A? Necesito el comprobante para la empresa.",
            "Buenas, consulta por compra mayorista: ¿manejan lista para revendedores?",
            "Recibí el pedido y quiero devolverlo, no era lo que esperaba.",
        };

        var added = 0;
        for (var i = 0; i < bodies.Length; i++)
        {
            var (name, email) = Buyers[i % Buyers.Length];
            var repentance = i == bodies.Length - 1;
            var message = ContactMessage.Create(
                tenantId.Value, name, email, bodies[i],
                repentance ? ContactMessage.KindRepentance : ContactMessage.KindContact,
                repentance ? $"ARR-{_rng.Next(1000, 9999)}" : null,
                repentance ? $"#{_rng.Next(1000, 9999)}" : null);

            if (i >= 3) message.MarkRead();
            Backdate(customers, message, DateTime.UtcNow.AddDays(-i * 2).AddHours(-_rng.Next(0, 20)));
            customers.ContactMessages.Add(message);
            added++;
        }

        await customers.SaveChangesAsync(ct);
        return added;
    }

    // --------------------------------------------------------- Chat posventa

    private async Task<int> SeedSupportAsync(TenantId tenantId, CancellationToken ct)
    {
        if (await support.Conversations.AnyAsync(c => c.TenantId == tenantId.Value, ct)) return 0;

        var recent = await orders.Orders
            .Where(o => o.TenantId == tenantId && o.Status == OrderStatus.Fulfilled)
            .OrderByDescending(o => o.CreatedAtUtc)
            .Take(5)
            .ToListAsync(ct);
        if (recent.Count == 0) return 0;

        var scripts = new (string Customer, string? Staff)[]
        {
            ("Hola, ¿me pueden pasar el código de seguimiento?", "¡Hola! Sí, ya salió: te lo dejo en el detalle del pedido."),
            ("El paquete figura entregado pero no lo recibí.", "Lo reclamamos al correo y te avisamos hoy mismo."),
            ("¿Puedo cambiar el color por el azul?", null),
            ("Llegó todo perfecto, gracias!", "¡Gracias a vos! Cualquier cosa escribinos."),
            ("Necesito la factura del pedido.", null),
        };

        var added = 0;
        for (var i = 0; i < recent.Count && i < scripts.Length; i++)
        {
            var order = recent[i];
            var (fromCustomer, fromStaff) = scripts[i];

            var customerId = await customers.Customers
                .Where(c => c.TenantId == tenantId.Value && c.Email == order.BuyerEmail)
                .Select(c => c.Id).FirstOrDefaultAsync(ct);

            var conversation = Conversation.Open(tenantId.Value, order.Id, customerId, order.BuyerEmail);
            var opened = DateTime.UtcNow.AddDays(-i).AddHours(-_rng.Next(1, 20));

            conversation.RegisterMessage(fromStaff: false);
            var first = SupportMessage.Create(conversation.Id, tenantId.Value, false, order.BuyerEmail, fromCustomer);
            Backdate(support, first, opened);
            support.Messages.Add(first);

            if (fromStaff is not null)
            {
                conversation.RegisterMessage(fromStaff: true);
                conversation.MarkReadByStaff();
                var reply = SupportMessage.Create(conversation.Id, tenantId.Value, true, "Atención al cliente", fromStaff);
                Backdate(support, reply, opened.AddMinutes(_rng.Next(10, 180)));
                support.Messages.Add(reply);
                if (i == 3) conversation.Close();
            }

            Touch(conversation, nameof(Conversation.LastMessageAtUtc), opened.AddMinutes(30));
            Backdate(support, conversation, opened);
            support.Conversations.Add(conversation);
            added++;
        }

        await support.SaveChangesAsync(ct);
        return added;
    }

    // --------------------------------------------------------- Email marketing

    private async Task<int> SeedCampaignsAsync(TenantId tenantId, CancellationToken ct)
    {
        if (await notifications.EmailCampaigns.AnyAsync(c => c.TenantId == tenantId.Value, ct)) return 0;

        var audience = await customers.Customers
            .Where(c => c.TenantId == tenantId.Value && c.Email != null)
            .Select(c => c.Email!)
            .Take(200)
            .ToListAsync(ct);

        var specs = new (string Subject, string Body, string Audience, string? Coupon, string State, int DaysAgo)[]
        {
            ("Llegó la nueva temporada 🌞", "<p>Novedades recién desembarcadas, con envío gratis desde $50.000.</p>", "customers", "ENVIOGRATIS", "sent", 21),
            ("25 % OFF por 48 horas", "<p>Solo hasta el domingo, con el código VERANO25.</p>", "buyers", "VERANO25", "sent", 7),
            ("Volvé a tu carrito", "<p>Dejaste cosas sin comprar. Te las guardamos.</p>", "buyers", null, "scheduled", 0),
            ("Newsletter de agosto", "<p>Lo más vendido del mes y lo que se viene.</p>", "customers", null, "draft", 0),
        };

        var added = 0;
        foreach (var (subject, body, aud, coupon, state, daysAgo) in specs)
        {
            var campaign = EmailCampaign.Create(tenantId.Value, subject, body, aud, null, coupon);
            var createdAt = DateTime.UtcNow.AddDays(-Math.Max(daysAgo, 1) - 2);

            if (state == "scheduled")
            {
                campaign.Schedule(DateTime.UtcNow.AddDays(2));
            }
            else if (state == "sent")
            {
                var recipients = audience.Take(Math.Max(1, audience.Count)).ToList();
                campaign.StartSending(recipients.Count);

                // Entregas y aperturas con números creíbles: casi todo entra y
                // lo abre alrededor de un tercio, que es lo normal en retail.
                var failed = (int)Math.Round(recipients.Count * 0.03);
                campaign.RecordProgress(recipients.Count - failed, failed);
                campaign.MarkSent();
                Touch(campaign, nameof(EmailCampaign.SentAtUtc), DateTime.UtcNow.AddDays(-daysAgo));

                foreach (var email in recipients)
                {
                    var recipient = CampaignRecipient.Create(tenantId.Value, campaign.Id, email);
                    if (_rng.Next(100) < 97)
                    {
                        recipient.MarkSent();
                        if (_rng.Next(100) < 34) recipient.MarkOpened();
                        if (_rng.Next(100) < 9) recipient.MarkClicked();
                    }
                    else
                    {
                        recipient.MarkFailed();
                    }
                    notifications.CampaignRecipients.Add(recipient);
                }
            }

            Backdate(notifications, campaign, createdAt);
            notifications.EmailCampaigns.Add(campaign);
            added++;
        }

        await notifications.SaveChangesAsync(ct);
        return added;
    }

    // --------------------------------------------------- Páginas de contenido

    private async Task<int> SeedPagesAsync(TenantId tenantId, CancellationToken ct)
    {
        if (await content.Pages.AnyAsync(p => p.TenantId == tenantId.Value, ct)) return 0;

        var specs = new (string Title, string Body, bool Published)[]
        {
            ("Quiénes somos", "<p>Importamos y distribuimos desde 2015, con depósito propio y stock real.</p>", true),
            ("Preguntas frecuentes", "<p><strong>¿Cuánto demora el envío?</strong> Entre 3 y 7 días hábiles a todo el país.</p>", true),
            ("Cómo comprar", "<p>Elegí tus productos, pagá con tarjeta o transferencia y seguí el envío desde tu cuenta.</p>", true),
            ("Términos y condiciones", "<p>Condiciones de compra, cambios y devoluciones.</p>", true),
        };

        var added = 0;
        foreach (var (title, body, published) in specs)
        {
            var created = Page.Create(tenantId.Value, title, Page.Slugify(title), body, published);
            if (created.IsFailure) continue;
            content.Pages.Add(created.Value);
            added++;
        }

        await content.SaveChangesAsync(ct);
        return added;
    }

    // -------------------------------------------------------------- Helpers

    private sealed record SellableVariant(
        Guid VariantId, string ProductName, string VariantDescription, string Sku, Money Price, Money? Cost);

    /// <summary>
    /// Variantes publicadas con precio, con tope: para una demo alcanza con
    /// unos cientos de productos distintos, y traer un catálogo de miles a
    /// memoria para sortear al azar no agrega nada.
    /// </summary>
    private async Task<IReadOnlyList<SellableVariant>> SellableVariantsAsync(TenantId tenantId, CancellationToken ct)
    {
        var products = await catalog.Products.AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.Status == ProductStatus.Active)
            .OrderBy(p => p.CreatedAtUtc)
            .Take(300)
            .ToListAsync(ct);

        return products
            .SelectMany(p => p.Variants.Select(v => new SellableVariant(
                v.Id, p.Name,
                v.OptionValues.Count > 0 ? string.Join(" / ", v.OptionValues) : "Única",
                v.Sku, v.Price, v.Cost)))
            .Where(v => v.Price.AmountInMinorUnits > 0)
            .ToList();
    }

    /// <summary>
    /// Las fichas de cliente nacen con la fecha de hoy porque se crean recién
    /// ahora; se las lleva a la fecha de su primera compra para que "clientes
    /// nuevos por mes" no muestre todo apilado en el día de la demo.
    /// </summary>
    private async Task BackdateCustomersAsync(TenantId tenantId, CancellationToken ct)
    {
        var firstPurchase = await orders.Orders
            .Where(o => o.TenantId == tenantId && o.PaidAtUtc != null)
            .GroupBy(o => o.BuyerEmail)
            .Select(g => new { Email = g.Key, First = g.Min(o => o.PaidAtUtc)!.Value })
            .ToListAsync(ct);
        if (firstPurchase.Count == 0) return;

        var byEmail = firstPurchase.ToDictionary(x => x.Email, x => x.First);
        var fichas = await customers.Customers
            .Where(c => c.TenantId == tenantId.Value && c.Email != null)
            .ToListAsync(ct);

        foreach (var ficha in fichas)
        {
            if (ficha.Email is { } email && byEmail.TryGetValue(email, out var when))
                Backdate(customers, ficha, when);
        }

        await customers.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Corre <c>CreatedAtUtc</c> hacia atrás. El dominio siempre estampa el
    /// alta con la hora real —correcto en producción, inútil para una demo que
    /// necesita historia—, así que la fecha se ajusta por el change tracker en
    /// vez de abrirle un setter público al mundo.
    /// </summary>
    private static void Backdate<T>(DbContext db, T entity, DateTime whenUtc) where T : class =>
        db.Entry(entity).Property("CreatedAtUtc").CurrentValue = whenUtc;

    /// <summary>Igual que <see cref="Backdate"/>, para cualquier otra propiedad de solo lectura.</summary>
    private void Touch<T>(T entity, string property, object? value) where T : class
    {
        var db = entity switch
        {
            Order => (DbContext)orders,
            CheckoutSession => checkout,
            PageView => analytics,
            Conversation => support,
            EmailCampaign => notifications,
            _ => throw new ArgumentOutOfRangeException(nameof(entity), entity, "Entidad sin DbContext asociado."),
        };
        db.Entry(entity).Property(property).CurrentValue = value;
    }
}
