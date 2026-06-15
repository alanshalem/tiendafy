using Catalog.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SharedKernel.Common;

namespace Catalog.Infrastructure.Persistence;

public sealed class CategoryConfiguration : IEntityTypeConfiguration<Category>
{
    public void Configure(EntityTypeBuilder<Category> builder)
    {
        builder.ToTable("categories");
        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).ValueGeneratedNever();

        builder.Property(c => c.TenantId)
            .HasConversion(id => id.Value, value => TenantId.From(value));

        builder.Property(c => c.Name).HasMaxLength(50).IsRequired();

        builder.Property(c => c.Slug)
            .HasConversion(s => s.Value, value => Slug.Create(value).Value)
            .HasMaxLength(120)
            .IsRequired();

        builder.Property(c => c.ParentId);
        builder.Property(c => c.Path).HasMaxLength(400).IsRequired();

        builder.HasIndex(c => new { c.TenantId, c.Path }).IsUnique();

        builder.Ignore(c => c.DomainEvents);
    }
}
