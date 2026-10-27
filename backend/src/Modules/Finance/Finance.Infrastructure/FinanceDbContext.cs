using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Finance.Infrastructure;

public sealed class FinanceDbContext : DbContext
{
    // Filtro multi-tenant global, cerrado por defecto: sin tienda en el scope,
    // las entidades con TenantId no devuelven filas. Lo que recorre varias
    // tiendas (workers, endpoints de plataforma, backfills) lo pide explícito
    // con IgnoreQueryFilters() y su propio filtro, o fija la tienda en el scope
    // (TenantContextHolder). La tienda se lee en cada consulta, no al construir.
    private readonly ITenantContext? _tenant;
    private bool FilterByTenant => _tenant?.HasTenant == true;
    private Guid TenantGuid => FilterByTenant ? _tenant!.TenantId.Value : default;

    public FinanceDbContext(DbContextOptions<FinanceDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _tenant = tenant;
    }

    public DbSet<FinancialAccount> Accounts => Set<FinancialAccount>();
    public DbSet<AccountMovement> Movements => Set<AccountMovement>();
    public DbSet<LedgerEntry> LedgerEntries => Set<LedgerEntry>();
    public DbSet<Receipt> Receipts => Set<Receipt>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var account = modelBuilder.Entity<FinancialAccount>();
        account.ToTable("financial_accounts");
        account.HasKey(a => a.Id);
        account.Property(a => a.Id).ValueGeneratedNever();
        account.HasQueryFilter(a => FilterByTenant && a.TenantId == TenantGuid);
        account.Property(a => a.Name).HasMaxLength(80).IsRequired();
        account.Property(a => a.Currency).HasMaxLength(3).IsRequired();
        account.Property(a => a.Detail).HasMaxLength(200);
        account.Property(a => a.Kind).HasConversion<string>().HasMaxLength(10);
        account.HasIndex(a => new { a.TenantId, a.Active });

        var movement = modelBuilder.Entity<AccountMovement>();
        movement.ToTable("account_movements");
        movement.HasKey(m => m.Id);
        movement.Property(m => m.Id).ValueGeneratedNever();
        movement.HasQueryFilter(m => FilterByTenant && m.TenantId == TenantGuid);
        movement.Property(m => m.Concept).HasMaxLength(200).IsRequired();
        movement.Property(m => m.Reference).HasMaxLength(120);
        movement.Property(m => m.Currency).HasMaxLength(3).IsRequired();
        movement.Property(m => m.Kind).HasConversion<string>().HasMaxLength(5);
        movement.Ignore(m => m.SignedAmountMinor);
        // El listado de una cuenta siempre se pide por fecha descendente.
        movement.HasIndex(m => new { m.TenantId, m.AccountId, m.OccurredAtUtc });
        movement.HasIndex(m => new { m.TenantId, m.ReceiptId });

        var ledger = modelBuilder.Entity<LedgerEntry>();
        ledger.ToTable("ledger_entries");
        ledger.HasKey(l => l.Id);
        ledger.Property(l => l.Id).ValueGeneratedNever();
        ledger.HasQueryFilter(l => FilterByTenant && l.TenantId == TenantGuid);
        ledger.Property(l => l.DocLabel).HasMaxLength(120).IsRequired();
        ledger.Property(l => l.Notes).HasMaxLength(500);
        ledger.Property(l => l.Currency).HasMaxLength(3).IsRequired();
        ledger.Property(l => l.Kind).HasConversion<string>().HasMaxLength(6);
        ledger.Property(l => l.PartyKind).HasConversion<string>().HasMaxLength(10);
        ledger.Property(l => l.DocType).HasConversion<string>().HasMaxLength(20);
        ledger.Ignore(l => l.PendingMinor);
        ledger.Ignore(l => l.SignedAmountMinor);
        // La consulta que manda: el estado de cuenta de UN cliente o proveedor.
        ledger.HasIndex(l => new { l.TenantId, l.PartyKind, l.PartyId, l.OccurredAtUtc });
        ledger.HasIndex(l => new { l.TenantId, l.DocType, l.DocId });

        var receipt = modelBuilder.Entity<Receipt>();
        receipt.ToTable("receipts");
        receipt.HasKey(r => r.Id);
        receipt.Property(r => r.Id).ValueGeneratedNever();
        receipt.HasQueryFilter(r => FilterByTenant && r.TenantId == TenantGuid);
        receipt.Property(r => r.Number).HasMaxLength(20).IsRequired();
        receipt.Property(r => r.PartyName).HasMaxLength(160).IsRequired();
        receipt.Property(r => r.Currency).HasMaxLength(3).IsRequired();
        receipt.Property(r => r.Notes).HasMaxLength(500);
        receipt.Property(r => r.VoidReason).HasMaxLength(200);
        receipt.Property(r => r.Kind).HasConversion<string>().HasMaxLength(12);
        receipt.Property(r => r.PartyKind).HasConversion<string>().HasMaxLength(10);
        receipt.Ignore(r => r.UnallocatedMinor);
        // Único por tienda y tipo: es lo que hace que el número sirva de referencia.
        receipt.HasIndex(r => new { r.TenantId, r.Kind, r.Number }).IsUnique();
        receipt.HasIndex(r => new { r.TenantId, r.PartyKind, r.PartyId });

        receipt.OwnsMany(r => r.Payments, p =>
        {
            p.ToTable("receipt_payments");
            p.WithOwner().HasForeignKey("receipt_id");
            p.HasKey(x => x.Id);
            p.Property(x => x.Id).ValueGeneratedNever();
        });

        receipt.OwnsMany(r => r.Allocations, a =>
        {
            a.ToTable("receipt_allocations");
            a.WithOwner().HasForeignKey("receipt_id");
            a.HasKey(x => x.Id);
            a.Property(x => x.Id).ValueGeneratedNever();
            a.HasIndex(x => x.LedgerEntryId);
        });
    }
}
