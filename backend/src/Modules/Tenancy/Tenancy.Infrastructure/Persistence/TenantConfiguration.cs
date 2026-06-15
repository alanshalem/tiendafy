using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SharedKernel.Common;
using Tenancy.Core.Domain;

namespace Tenancy.Infrastructure.Persistence;

public sealed class TenantConfiguration : IEntityTypeConfiguration<Tenant>
{
    public void Configure(EntityTypeBuilder<Tenant> builder)
    {
        // Tabla global de plataforma: catálogo de tenants. Sin RLS —
        // RLS aplica a tablas tenant-scoped; ésta ES el directorio de tenants.
        builder.ToTable("tenants");

        builder.HasKey(t => t.Id);
        builder.Property(t => t.Id).ValueGeneratedNever();

        builder.Property(t => t.TenantId)
            .HasConversion(id => id.Value, value => TenantId.From(value));

        builder.Property(t => t.Name)
            .HasMaxLength(100)
            .IsRequired();

        builder.Property(t => t.Subdomain)
            .HasConversion(s => s.Value, value => Subdomain.Create(value).Value)
            .HasMaxLength(63)
            .IsRequired();

        // Único entre tiendas vivas: las canceladas (eliminadas) liberan el
        // subdominio para que el nombre se pueda reclamar al re-crear la tienda.
        builder.HasIndex(t => t.Subdomain)
            .IsUnique()
            .HasFilter("status <> 'Canceled'");

        builder.Property(t => t.CustomDomain).HasMaxLength(253);
        builder.HasIndex(t => t.CustomDomain)
            .IsUnique()
            .HasFilter("custom_domain IS NOT NULL");

        builder.Property(t => t.Status).HasConversion<string>().HasMaxLength(20);
        builder.Property(t => t.Plan).HasConversion<string>().HasMaxLength(20);

        builder.Property(t => t.CreatedAtUtc);

        builder.Ignore(t => t.DomainEvents);
    }
}
