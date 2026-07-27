using Fiscal.Core.Domain;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Fiscal.Infrastructure.Persistence;

public sealed class FiscalDbContext : DbContext
{
    // Filtro multi-tenant global (defensa en profundidad). Bypass sin tenant en
    // scope (workers de emisión/reconciliación, migraciones). Todas las entidades
    // usan Guid TenantId.
    private readonly bool _filterByTenant;
    private readonly Guid _tenantGuid;

    public FiscalDbContext(DbContextOptions<FiscalDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _filterByTenant = tenant?.HasTenant == true;
        _tenantGuid = _filterByTenant ? tenant!.TenantId.Value : default;
    }

    public DbSet<FiscalConfig> Configs => Set<FiscalConfig>();
    public DbSet<FiscalPointOfSale> PointsOfSale => Set<FiscalPointOfSale>();
    public DbSet<FiscalCertificate> Certificates => Set<FiscalCertificate>();
    public DbSet<FiscalAccessToken> AccessTokens => Set<FiscalAccessToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var cfg = modelBuilder.Entity<FiscalConfig>();
        cfg.ToTable("fiscal_configs");
        cfg.HasKey(x => x.Id);
        cfg.Property(x => x.Id).ValueGeneratedNever();
        cfg.Property(x => x.Cuit).HasMaxLength(11).IsRequired();
        cfg.Property(x => x.BusinessName).HasMaxLength(200).IsRequired();
        cfg.Property(x => x.Condition).HasConversion<string>().HasMaxLength(30);
        cfg.Property(x => x.Environment).HasConversion<string>().HasMaxLength(15);
        cfg.Property(x => x.Trigger).HasConversion<string>().HasMaxLength(20);
        cfg.HasIndex(x => x.TenantId).IsUnique();
        cfg.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);

        var pos = modelBuilder.Entity<FiscalPointOfSale>();
        pos.ToTable("fiscal_points_of_sale");
        pos.HasKey(x => x.Id);
        pos.Property(x => x.Id).ValueGeneratedNever();
        pos.Property(x => x.Label).HasMaxLength(80).IsRequired();
        pos.HasIndex(x => new { x.TenantId, x.Number }).IsUnique();
        pos.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);

        var cert = modelBuilder.Entity<FiscalCertificate>();
        cert.ToTable("fiscal_certificates");
        cert.HasKey(x => x.Id);
        cert.Property(x => x.Id).ValueGeneratedNever();
        cert.Property(x => x.Environment).HasConversion<string>().HasMaxLength(15);
        cert.Property(x => x.Status).HasConversion<string>().HasMaxLength(15);
        cert.Property(x => x.PrivateKeyEncrypted).HasColumnType("text").IsRequired();
        cert.Property(x => x.CsrPem).HasColumnType("text");
        cert.Property(x => x.CertificatePemEncrypted).HasColumnType("text");
        cert.Property(x => x.SubjectCn).HasMaxLength(200);
        cert.HasIndex(x => new { x.TenantId, x.Environment });
        cert.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);

        var ta = modelBuilder.Entity<FiscalAccessToken>();
        ta.ToTable("fiscal_access_tokens");
        ta.HasKey(x => x.Id);
        ta.Property(x => x.Id).ValueGeneratedNever();
        ta.Property(x => x.Cuit).HasMaxLength(11).IsRequired();
        ta.Property(x => x.Service).HasMaxLength(20).IsRequired();
        ta.Property(x => x.Environment).HasConversion<string>().HasMaxLength(15);
        ta.Property(x => x.TokenEncrypted).HasColumnType("text").IsRequired();
        ta.Property(x => x.SignEncrypted).HasColumnType("text").IsRequired();
        ta.HasIndex(x => new { x.TenantId, x.Cuit, x.Service, x.Environment }).IsUnique();
        ta.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
    }
}
