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
    public DbSet<FiscalDocument> Documents => Set<FiscalDocument>();
    public DbSet<FiscalSequence> Sequences => Set<FiscalSequence>();
    public DbSet<FiscalEmissionJob> EmissionJobs => Set<FiscalEmissionJob>();
    public DbSet<StoreLegalInfo> LegalInfo => Set<StoreLegalInfo>();

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

        var doc = modelBuilder.Entity<FiscalDocument>();
        doc.ToTable("fiscal_documents");
        doc.HasKey(x => x.Id);
        doc.Property(x => x.Id).ValueGeneratedNever();
        doc.Property(x => x.Environment).HasConversion<string>().HasMaxLength(15);
        doc.Property(x => x.CbteTipo).HasConversion<int>();
        doc.Property(x => x.DocTipo).HasConversion<int>();
        doc.Property(x => x.Result).HasConversion<string>().HasMaxLength(15);
        doc.Property(x => x.ImpTotal).HasColumnType("numeric(18,2)");
        doc.Property(x => x.ImpNeto).HasColumnType("numeric(18,2)");
        doc.Property(x => x.ImpIVA).HasColumnType("numeric(18,2)");
        doc.Property(x => x.Cae).HasMaxLength(20);
        doc.Property(x => x.Observations).HasColumnType("text");
        doc.Property(x => x.Errors).HasColumnType("text");
        doc.Property(x => x.RequestPayload).HasColumnType("text");
        doc.Property(x => x.ResponsePayload).HasColumnType("text");
        doc.HasIndex(x => new { x.TenantId, x.OrderId });
        // Único sólo para comprobantes autorizados: un rechazo no consume número,
        // así que puede reintentarse con el mismo (ARCA tampoco lo consumió).
        doc.HasIndex(x => new { x.TenantId, x.Environment, x.PtoVta, x.CbteTipo, x.Number })
            .IsUnique()
            .HasFilter("result = 'Authorized'");
        doc.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);

        var job = modelBuilder.Entity<FiscalEmissionJob>();
        job.ToTable("fiscal_emission_jobs");
        job.HasKey(x => x.Id);
        job.Property(x => x.Id).ValueGeneratedNever();
        job.Property(x => x.Kind).HasConversion<int>();
        job.Property(x => x.Status).HasConversion<string>().HasMaxLength(15);
        job.Property(x => x.BuyerDoc).HasMaxLength(20);
        job.Property(x => x.LastError).HasColumnType("text");
        // Un job por (tenant, orden, tipo): el trigger no duplica facturación.
        job.HasIndex(x => new { x.TenantId, x.OrderId, x.Kind }).IsUnique();
        // El worker barre pendientes listos para reintentar.
        job.HasIndex(x => new { x.Status, x.NextAttemptUtc });
        job.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);

        var seq = modelBuilder.Entity<FiscalSequence>();
        seq.ToTable("fiscal_sequences");
        seq.HasKey(x => x.Id);
        seq.Property(x => x.Id).ValueGeneratedNever();
        seq.Property(x => x.Environment).HasConversion<string>().HasMaxLength(15);
        seq.Property(x => x.CbteTipo).HasConversion<int>();
        seq.HasIndex(x => new { x.TenantId, x.Environment, x.PtoVta, x.CbteTipo }).IsUnique();
        seq.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);

        var legal = modelBuilder.Entity<StoreLegalInfo>();
        legal.ToTable("store_legal_info");
        legal.HasKey(x => x.Id);
        legal.Property(x => x.Id).ValueGeneratedNever();
        legal.HasIndex(x => x.TenantId).IsUnique();
        legal.Property(x => x.LegalName).HasMaxLength(200);
        legal.Property(x => x.Cuit).HasMaxLength(11);
        legal.Property(x => x.Address).HasMaxLength(300);
        legal.Property(x => x.Condition).HasConversion<string>().HasMaxLength(30);
        legal.Property(x => x.VatRatePercent).HasPrecision(5, 2);
        legal.Property(x => x.OtherNationalTaxesPercent).HasPrecision(5, 2);
        legal.Property(x => x.DataFiscalUrl).HasMaxLength(500);
        legal.Property(x => x.DataFiscalImageUrl).HasMaxLength(500);
        legal.Ignore(x => x.TaxDivisor);
        legal.HasQueryFilter(x => !_filterByTenant || x.TenantId == _tenantGuid);
    }
}
