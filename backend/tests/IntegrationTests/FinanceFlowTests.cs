using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// El circuito completo de la plata, contra la API real y Postgres: caja →
/// transferencia → deuda del cliente → cobro imputado → anulación.
///
/// Es el test que importa de Finance. Cada paso toca dos cosas a la vez (el
/// saldo de una caja y el de una cuenta corriente) y lo único que prueba que
/// no se desincronizaron es recorrerlo entero.
/// </summary>
[Collection("api")]
public sealed class FinanceFlowTests
{
    private readonly ApiFactory _factory;

    public FinanceFlowTests(ApiFactory factory) => _factory = factory;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task El_circuito_de_cobranza_deja_la_caja_y_el_saldo_del_cliente_coherentes()
    {
        var client = _factory.CreateDefaultClient(new CookieContainerHandler());
        var tenantId = await RegisterWithStoreAsync(client, $"fin{Guid.NewGuid():N}"[..12]);
        var customerId = Guid.NewGuid();

        // 1. Dos cuentas: la caja del local y el banco.
        var caja = await PostAsync(client, tenantId, "/api/v1/finance/accounts",
            new { name = "Caja local", kind = "cash", currency = "ARS", openingBalanceMinor = 100_000L });
        var banco = await PostAsync(client, tenantId, "/api/v1/finance/accounts",
            new { name = "Banco Galicia", kind = "bank", currency = "ARS", openingBalanceMinor = 0L });

        var cajaId = caja.GetProperty("id").GetGuid();
        var bancoId = banco.GetProperty("id").GetGuid();

        // 2. Un gasto sale de la caja.
        await PostAsync(client, tenantId, "/api/v1/finance/movements",
            new { accountId = cajaId, kind = "out", amountMinor = 30_000L, concept = "Flete" });

        // 3. Una transferencia no cambia el total, sólo dónde está la plata.
        await PostAsync(client, tenantId, "/api/v1/finance/transfers",
            new { fromAccountId = cajaId, toAccountId = bancoId, amountMinor = 50_000L });

        var accounts = await GetAsync(client, tenantId, "/api/v1/finance/accounts");
        Assert.Equal(20_000, BalanceOf(accounts, cajaId));
        Assert.Equal(50_000, BalanceOf(accounts, bancoId));
        Assert.Equal(70_000, accounts.GetProperty("totals").EnumerateArray()
            .Single(t => t.GetProperty("currency").GetString() == "ARS").GetProperty("balanceMinor").GetInt64());

        // Transferir a la misma cuenta no es una transferencia.
        var misma = await RawPostAsync(client, tenantId, "/api/v1/finance/transfers",
            new { fromAccountId = cajaId, toAccountId = cajaId, amountMinor = 1_000L });
        Assert.Equal(HttpStatusCode.BadRequest, misma.StatusCode);

        // 4. Le vendimos 200.000 en cuenta corriente: nos debe.
        await PostAsync(client, tenantId, "/api/v1/finance/ledger/adjustments",
            new
            {
                partyKind = "customer",
                partyId = customerId,
                kind = "debit",
                amountMinor = 200_000L,
                currency = "ARS",
                label = "Factura A 0001-00000001",
            });

        var pending = await GetAsync(client, tenantId,
            $"/api/v1/finance/ledger/pending?partyKind=customer&partyId={customerId}");
        var factura = pending.GetProperty("items").EnumerateArray().Single();
        Assert.Equal(200_000, factura.GetProperty("pendingMinor").GetInt64());

        // 5. Nos paga 120.000: 80.000 en efectivo y 40.000 por banco, todo
        //    imputado a esa factura.
        var recibo = await PostAsync(client, tenantId, "/api/v1/finance/receipts",
            new
            {
                kind = "collection",
                partyKind = "customer",
                partyId = customerId,
                partyName = "Cliente de prueba",
                payments = new[]
                {
                    new { accountId = cajaId, amountMinor = 80_000L },
                    new { accountId = bancoId, amountMinor = 40_000L },
                },
                allocations = new[]
                {
                    new { ledgerEntryId = factura.GetProperty("id").GetGuid(), amountMinor = 120_000L },
                },
            });
        var reciboId = recibo.GetProperty("id").GetGuid();
        Assert.Equal("REC-0001", recibo.GetProperty("number").GetString());

        // La plata entró a las dos cuentas y el cliente pasó a deber 80.000.
        accounts = await GetAsync(client, tenantId, "/api/v1/finance/accounts");
        Assert.Equal(100_000, BalanceOf(accounts, cajaId));
        Assert.Equal(90_000, BalanceOf(accounts, bancoId));

        var ledger = await GetAsync(client, tenantId,
            $"/api/v1/finance/ledger?partyKind=customer&partyId={customerId}");
        Assert.Equal(80_000, ledger.GetProperty("balanceMinor").GetInt64());

        // El saldo acumulado del estado de cuenta tiene que cerrar con el total.
        var ultimo = ledger.GetProperty("items").EnumerateArray().Last();
        Assert.Equal(80_000, ultimo.GetProperty("balanceMinor").GetInt64());

        // Y la factura quedó con 80.000 pendientes, no con 200.000.
        pending = await GetAsync(client, tenantId,
            $"/api/v1/finance/ledger/pending?partyKind=customer&partyId={customerId}");
        Assert.Equal(80_000, pending.GetProperty("items").EnumerateArray().Single().GetProperty("pendingMinor").GetInt64());

        // 6. Anular el recibo devuelve las tres cosas: plata, saldo e imputación.
        var anulado = await RawPostAsync(client, tenantId, $"/api/v1/finance/receipts/{reciboId}/void",
            new { reason = "Cheque rechazado" });
        Assert.Equal(HttpStatusCode.NoContent, anulado.StatusCode);

        accounts = await GetAsync(client, tenantId, "/api/v1/finance/accounts");
        Assert.Equal(20_000, BalanceOf(accounts, cajaId));
        Assert.Equal(50_000, BalanceOf(accounts, bancoId));

        ledger = await GetAsync(client, tenantId, $"/api/v1/finance/ledger?partyKind=customer&partyId={customerId}");
        Assert.Equal(200_000, ledger.GetProperty("balanceMinor").GetInt64());

        pending = await GetAsync(client, tenantId,
            $"/api/v1/finance/ledger/pending?partyKind=customer&partyId={customerId}");
        Assert.Equal(200_000, pending.GetProperty("items").EnumerateArray()
            .Single(i => i.GetProperty("id").GetGuid() == factura.GetProperty("id").GetGuid())
            .GetProperty("pendingMinor").GetInt64());

        // Anular dos veces no vuelve a mover nada.
        var otraVez = await RawPostAsync(client, tenantId, $"/api/v1/finance/receipts/{reciboId}/void", new { reason = "x" });
        Assert.Equal(HttpStatusCode.BadRequest, otraVez.StatusCode);
    }

    [Fact]
    public async Task La_ficha_del_proveedor_trae_su_saldo_de_otro_modulo()
    {
        var client = _factory.CreateDefaultClient(new CookieContainerHandler());
        var tenantId = await RegisterWithStoreAsync(client, $"sup{Guid.NewGuid():N}"[..12]);

        var supplier = await PostAsync(client, tenantId, "/api/v1/suppliers",
            new { name = "Importadora del Sur", taxId = "30712345678", email = "ventas@sur.test" });
        var supplierId = supplier.GetProperty("id").GetGuid();

        // Su factura: le debemos. En un proveedor eso es un Haber.
        await PostAsync(client, tenantId, "/api/v1/finance/ledger/adjustments",
            new
            {
                partyKind = "supplier",
                partyId = supplierId,
                kind = "credit",
                amountMinor = 500_000L,
                currency = "ARS",
                label = "Factura A 0002-00000045",
            });

        // Le pagamos la mitad, desde una caja.
        var caja = await PostAsync(client, tenantId, "/api/v1/finance/accounts",
            new { name = "Caja", kind = "cash", currency = "ARS", openingBalanceMinor = 1_000_000L });
        var cajaId = caja.GetProperty("id").GetGuid();

        var pending = await GetAsync(client, tenantId,
            $"/api/v1/finance/ledger/pending?partyKind=supplier&partyId={supplierId}");
        var facturaId = pending.GetProperty("items").EnumerateArray().Single().GetProperty("id").GetGuid();

        var orden = await PostAsync(client, tenantId, "/api/v1/finance/receipts",
            new
            {
                kind = "payment",
                partyKind = "supplier",
                partyId = supplierId,
                partyName = "Importadora del Sur",
                payments = new[] { new { accountId = cajaId, amountMinor = 250_000L } },
                allocations = new[] { new { ledgerEntryId = facturaId, amountMinor = 250_000L } },
            });
        Assert.Equal("OP-0001", orden.GetProperty("number").GetString());

        // La plata salió de la caja.
        var accounts = await GetAsync(client, tenantId, "/api/v1/finance/accounts");
        Assert.Equal(750_000, BalanceOf(accounts, cajaId));

        // Y la ficha del proveedor muestra lo que le queda debiéndose: negativo,
        // porque el signo se lee siempre desde nuestro lado.
        var ficha = await GetAsync(client, tenantId, $"/api/v1/suppliers/{supplierId}");
        Assert.Equal(-250_000, ficha.GetProperty("balanceMinor").GetInt64());
        Assert.Equal("Importadora del Sur", ficha.GetProperty("name").GetString());

        var listado = await GetAsync(client, tenantId, "/api/v1/suppliers");
        var fila = listado.GetProperty("items").EnumerateArray().Single(i => i.GetProperty("id").GetGuid() == supplierId);
        Assert.Equal(-250_000, fila.GetProperty("balanceMinor").GetInt64());
    }

    [Fact]
    public async Task Un_recibo_no_puede_imputar_mas_de_lo_que_el_comprobante_debe()
    {
        var client = _factory.CreateDefaultClient(new CookieContainerHandler());
        var tenantId = await RegisterWithStoreAsync(client, $"ovr{Guid.NewGuid():N}"[..12]);
        var customerId = Guid.NewGuid();

        var caja = await PostAsync(client, tenantId, "/api/v1/finance/accounts",
            new { name = "Caja", kind = "cash", currency = "ARS", openingBalanceMinor = 0L });
        var cajaId = caja.GetProperty("id").GetGuid();

        await PostAsync(client, tenantId, "/api/v1/finance/ledger/adjustments",
            new { partyKind = "customer", partyId = customerId, kind = "debit", amountMinor = 10_000L, currency = "ARS", label = "Venta" });

        var pending = await GetAsync(client, tenantId,
            $"/api/v1/finance/ledger/pending?partyKind=customer&partyId={customerId}");
        var facturaId = pending.GetProperty("items").EnumerateArray().Single().GetProperty("id").GetGuid();

        // Cobrar 25.000 e imputarlos todos a una factura de 10.000 dejaría el
        // comprobante sobrepagado y el excedente invisible.
        var res = await RawPostAsync(client, tenantId, "/api/v1/finance/receipts",
            new
            {
                kind = "collection",
                partyKind = "customer",
                partyId = customerId,
                partyName = "Cliente",
                payments = new[] { new { accountId = cajaId, amountMinor = 25_000L } },
                allocations = new[] { new { ledgerEntryId = facturaId, amountMinor = 25_000L } },
            });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);

        // Y el rechazo no dejó plata a medio entrar en la caja.
        var accounts = await GetAsync(client, tenantId, "/api/v1/finance/accounts");
        Assert.Equal(0, BalanceOf(accounts, cajaId));
    }

    // ---- helpers -------------------------------------------------------------

    private static long BalanceOf(JsonElement accounts, Guid accountId) =>
        accounts.GetProperty("items").EnumerateArray()
            .Single(a => a.GetProperty("id").GetGuid() == accountId)
            .GetProperty("balanceMinor").GetInt64();

    private static async Task<HttpResponseMessage> RawPostAsync(HttpClient client, Guid tenantId, string path, object body)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        req.Headers.Add("X-Tenant-Id", tenantId.ToString());
        return await client.SendAsync(req);
    }

    private static async Task<JsonElement> PostAsync(HttpClient client, Guid tenantId, string path, object body)
    {
        var res = await RawPostAsync(client, tenantId, path, body);
        Assert.True(res.IsSuccessStatusCode, $"POST {path} → {res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return await res.Content.ReadFromJsonAsync<JsonElement>(Json);
    }

    private static async Task<JsonElement> GetAsync(HttpClient client, Guid tenantId, string path)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, path);
        req.Headers.Add("X-Tenant-Id", tenantId.ToString());
        var res = await client.SendAsync(req);
        Assert.True(res.IsSuccessStatusCode, $"GET {path} → {res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return await res.Content.ReadFromJsonAsync<JsonElement>(Json);
    }

    /// <summary>
    /// Mismo camino que TenantIsolationTests: el usuario se crea por dentro
    /// (el panel no tiene registro público) y después entra por la API.
    /// </summary>
    private async Task<Guid> RegisterWithStoreAsync(HttpClient client, string tag)
    {
        var email = $"it-{tag}@test.local";
        const string password = "password-larga-123";

        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            if (await users.FindByEmailAsync(email) is null)
            {
                var user = new AppUser
                {
                    UserName = email,
                    Email = email,
                    DisplayName = $"Test {tag}",
                    EmailConfirmed = true,
                };
                var created = await users.CreateAsync(user, password);
                Assert.True(created.Succeeded, string.Join(", ", created.Errors.Select(e => e.Description)));
            }
        }

        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        var create = await client.PostAsJsonAsync("/api/v1/tenants", new { name = $"Tienda {tag}", subdomain = tag });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var tenant = await create.Content.ReadFromJsonAsync<JsonElement>(Json);
        return tenant.GetProperty("id").GetGuid();
    }
}
