using Inventory.Core.Domain;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Inventory.Infrastructure.Persistence;

public sealed class InventoryDbContext : DbContext
{
    // Filtro multi-tenant global, cerrado por defecto: sin tienda en el scope,
    // las entidades con TenantId no devuelven filas. Lo que recorre varias
    // tiendas (workers, endpoints de plataforma, backfills) lo pide explícito
    // con IgnoreQueryFilters() y su propio filtro, o fija la tienda en el scope
    // (TenantContextHolder). La tienda se lee en cada consulta, no al construir.
    private readonly ITenantContext? _tenant;
    private bool FilterByTenant => _tenant?.HasTenant == true;
    private TenantId CurrentTenant => FilterByTenant ? _tenant!.TenantId : default;

    public InventoryDbContext(DbContextOptions<InventoryDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _tenant = tenant;
    }

    public DbSet<StockItem> StockItems => Set<StockItem>();
    public DbSet<StockMovement> Movements => Set<StockMovement>();
    public DbSet<Reservation> Reservations => Set<Reservation>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var stock = modelBuilder.Entity<StockItem>();
        stock.ToTable("stock_items");
        stock.HasKey(s => s.Id);
        stock.Property(s => s.Id).ValueGeneratedNever();
        stock.Property(s => s.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        stock.HasQueryFilter(s => FilterByTenant && s.TenantId == CurrentTenant);
        stock.HasIndex(s => new { s.TenantId, s.VariantId }).IsUnique();
        stock.Property(s => s.Location).HasMaxLength(60);
        // El motor garantiza lo que el código promete: nunca negativos.
        stock.ToTable(t => t.HasCheckConstraint("ck_stock_non_negative", "available >= 0 AND reserved >= 0"));

        var movement = modelBuilder.Entity<StockMovement>();
        movement.ToTable("stock_movements");
        movement.HasKey(m => m.Id);
        movement.Property(m => m.Id).ValueGeneratedNever();
        movement.Property(m => m.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        movement.Property(m => m.Type).HasConversion<string>().HasMaxLength(20);
        movement.Property(m => m.Reason).HasMaxLength(200);
        movement.HasQueryFilter(m => FilterByTenant && m.TenantId == CurrentTenant);
        movement.HasIndex(m => new { m.TenantId, m.VariantId, m.OccurredAtUtc });

        var reservation = modelBuilder.Entity<Reservation>();
        reservation.ToTable("reservations");
        reservation.HasKey(r => r.Id);
        reservation.Property(r => r.Id).ValueGeneratedNever();
        reservation.Property(r => r.TenantId).HasConversion(id => id.Value, v => TenantId.From(v));
        reservation.Property(r => r.Status).HasConversion<string>().HasMaxLength(20);
        reservation.HasQueryFilter(r => FilterByTenant && r.TenantId == CurrentTenant);
        // El job de expiración escanea por (status, expires_at).
        reservation.HasIndex(r => new { r.Status, r.ExpiresAtUtc });
    }
}
