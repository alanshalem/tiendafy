using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Ai.Infrastructure;

public sealed class AiDbContext : DbContext
{
    // Filtro multi-tenant global, cerrado por defecto: sin tienda en el scope,
    // las entidades con TenantId no devuelven filas. Lo que recorre varias
    // tiendas (workers, endpoints de plataforma, backfills) lo pide explícito
    // con IgnoreQueryFilters() y su propio filtro, o fija la tienda en el scope
    // (TenantContextHolder). La tienda se lee en cada consulta, no al construir.
    private readonly ITenantContext? _tenant;
    private bool FilterByTenant => _tenant?.HasTenant == true;
    private Guid TenantGuid => FilterByTenant ? _tenant!.TenantId.Value : default;

    public AiDbContext(DbContextOptions<AiDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _tenant = tenant;
    }

    public DbSet<AiProviderCredential> Credentials => Set<AiProviderCredential>();
    public DbSet<AiTaskAssignment> Assignments => Set<AiTaskAssignment>();
    public DbSet<AiSettings> Settings => Set<AiSettings>();
    public DbSet<AiUsage> Usage => Set<AiUsage>();
    public DbSet<AiCatalogJob> CatalogJobs => Set<AiCatalogJob>();
    public DbSet<AiCatalogJobItem> CatalogJobItems => Set<AiCatalogJobItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var c = modelBuilder.Entity<AiProviderCredential>();
        c.ToTable("ai_provider_credentials");
        c.HasKey(x => x.Id);
        c.Property(x => x.Id).ValueGeneratedNever();
        c.HasQueryFilter(x => FilterByTenant && x.TenantId == TenantGuid);
        c.Property(x => x.Provider).HasConversion<string>().HasMaxLength(20);
        c.Property(x => x.KeyEncrypted).IsRequired();
        c.Property(x => x.Last4).HasMaxLength(8).IsRequired();
        c.HasIndex(x => new { x.TenantId, x.Provider }).IsUnique();

        var a = modelBuilder.Entity<AiTaskAssignment>();
        a.ToTable("ai_task_assignments");
        a.HasKey(x => new { x.TenantId, x.Task });
        a.HasQueryFilter(x => FilterByTenant && x.TenantId == TenantGuid);
        a.Property(x => x.Task).HasConversion<string>().HasMaxLength(30);
        a.Property(x => x.PrimaryModel).HasMaxLength(100).IsRequired();
        a.Property(x => x.FallbackModel).HasMaxLength(100);

        var s = modelBuilder.Entity<AiSettings>();
        s.ToTable("ai_settings");
        s.HasKey(x => x.TenantId);
        s.Property(x => x.TenantId).ValueGeneratedNever();
        s.HasQueryFilter(x => FilterByTenant && x.TenantId == TenantGuid);

        var u = modelBuilder.Entity<AiUsage>();
        u.ToTable("ai_usage");
        u.HasKey(x => x.Id);
        u.Property(x => x.Id).ValueGeneratedNever();
        u.HasQueryFilter(x => FilterByTenant && x.TenantId == TenantGuid);
        u.Property(x => x.Task).HasConversion<string>().HasMaxLength(30);
        u.Property(x => x.Provider).HasConversion<string>().HasMaxLength(20);
        u.Property(x => x.Outcome).HasConversion<string>().HasMaxLength(20);
        u.Property(x => x.Model).HasMaxLength(100).IsRequired();
        // El consumo del mes de una tienda.
        u.HasIndex(x => new { x.TenantId, x.CreatedAtUtc });

        var j = modelBuilder.Entity<AiCatalogJob>();
        j.ToTable("ai_catalog_jobs");
        j.HasKey(x => x.Id);
        j.Property(x => x.Id).ValueGeneratedNever();
        j.HasQueryFilter(x => FilterByTenant && x.TenantId == TenantGuid);
        j.Property(x => x.Status).HasConversion<string>().HasMaxLength(30);
        j.HasIndex(x => new { x.TenantId, x.Status });

        var i = modelBuilder.Entity<AiCatalogJobItem>();
        i.ToTable("ai_catalog_job_items");
        i.HasKey(x => x.Id);
        i.Property(x => x.Id).ValueGeneratedNever();
        i.HasQueryFilter(x => FilterByTenant && x.TenantId == TenantGuid);
        i.Property(x => x.Status).HasConversion<string>().HasMaxLength(30);
        i.Property(x => x.ProposalJson).HasColumnType("jsonb");
        i.Property(x => x.JudgeNotes).HasMaxLength(2000);
        i.HasIndex(x => new { x.JobId, x.Status });
        // El worker de fichas reclama ítems pendientes por estado.
        i.HasIndex(x => new { x.Status, x.ClaimedAtUtc });
    }
}
