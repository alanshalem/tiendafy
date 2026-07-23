using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using SharedKernel.Abstractions;

namespace Customers.Infrastructure;

public sealed class CustomersDbContext : DbContext
{
    // Filtro multi-tenant global (defensa en profundidad). Bypass sin tenant en
    // scope (design-time). Todas las entidades acá usan Guid TenantId.
    private readonly bool _filterByTenant;
    private readonly Guid _tenantGuid;

    public CustomersDbContext(DbContextOptions<CustomersDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _tenantGuid = _filterByTenant ? tenant!.TenantId.Value : default;
    }

    // Cifrado de PII en reposo. Lo setea el host (Program) antes de migrar/servir.
    // Null (ej. design-time de migraciones) → columnas en claro, sin romper el schema.
    private static IDataProtector? _piiProtector;
    public static void UsePii(IDataProtectionProvider provider) =>
        _piiProtector = provider.CreateProtector("Customers.PII.v1");

    private static string? Encrypt(string? v) =>
        v is null || _piiProtector is null ? v : _piiProtector.Protect(v);

    private static string? Decrypt(string? v)
    {
        if (v is null || _piiProtector is null) return v;
        try { return _piiProtector.Unprotect(v); }
        catch { return v; } // fila vieja en claro (pre-cifrado): la devolvemos tal cual
    }

    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerSession> CustomerSessions => Set<CustomerSession>();
    public DbSet<CustomerFavorite> CustomerFavorites => Set<CustomerFavorite>();
    public DbSet<ContactMessage> ContactMessages => Set<ContactMessage>();
    public DbSet<CustomerToken> CustomerTokens => Set<CustomerToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var c = modelBuilder.Entity<Customer>();
        c.ToTable("customers");
        c.HasKey(x => x.Id);
        c.Property(x => x.Id).ValueGeneratedNever();
        c.HasIndex(x => new { x.TenantId, x.CreatedAtUtc });
        // Email único por tienda entre cuentas de comprador (login).
        c.HasIndex(x => new { x.TenantId, x.Email });
        c.Property(x => x.Name).HasMaxLength(120).IsRequired();
        c.Property(x => x.Email).HasMaxLength(200);
        // PII cifrada en reposo: el ciphertext es más largo y opaco → columnas `text`,
        // sin índice (no se consultan). Email queda en claro porque es clave de login.
        var pii = new ValueConverter<string?, string?>(v => Encrypt(v), v => Decrypt(v));
        c.Property(x => x.Phone).HasConversion(pii);
        c.Property(x => x.Address).HasConversion(pii);
        c.Property(x => x.Notes).HasMaxLength(2000);
        c.Property(x => x.PasswordHash).HasMaxLength(400);
        c.Property(x => x.GoogleSubject).HasMaxLength(100);

        var s = modelBuilder.Entity<CustomerSession>();
        s.ToTable("customer_sessions");
        s.HasKey(x => x.Id);
        s.Property(x => x.Id).ValueGeneratedNever();
        s.HasIndex(x => x.Token).IsUnique();
        s.Property(x => x.Token).HasMaxLength(120).IsRequired();

        var f = modelBuilder.Entity<CustomerFavorite>();
        f.ToTable("customer_favorites");
        f.HasKey(x => x.Id);
        f.Property(x => x.Id).ValueGeneratedNever();
        f.HasIndex(x => new { x.CustomerId, x.ProductId }).IsUnique();

        var t = modelBuilder.Entity<CustomerToken>();
        t.ToTable("customer_tokens");
        t.HasKey(x => x.Id);
        t.Property(x => x.Id).ValueGeneratedNever();
        t.HasIndex(x => x.Token).IsUnique();
        t.Property(x => x.Token).HasMaxLength(120).IsRequired();
        t.Property(x => x.Purpose).HasMaxLength(20).IsRequired();

        var cm = modelBuilder.Entity<ContactMessage>();
        cm.ToTable("contact_messages");
        cm.HasKey(x => x.Id);
        cm.Property(x => x.Id).ValueGeneratedNever();
        cm.HasIndex(x => new { x.TenantId, x.CreatedAtUtc });
        cm.Property(x => x.Name).HasMaxLength(120).IsRequired();
        cm.Property(x => x.Email).HasMaxLength(200).IsRequired();
        cm.Property(x => x.Body).HasMaxLength(4000).IsRequired();

        // Filtro multi-tenant global en todas las entidades tenant-scoped.
        c.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
        s.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
        f.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
        t.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
        cm.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
    }
}
