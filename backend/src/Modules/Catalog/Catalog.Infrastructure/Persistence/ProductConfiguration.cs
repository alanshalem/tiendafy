using Catalog.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SharedKernel.Common;
using SharedKernel.Persistence;

namespace Catalog.Infrastructure.Persistence;

public sealed class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> builder)
    {
        builder.ToTable("products");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).ValueGeneratedNever();

        builder.Property(p => p.TenantId)
            .HasConversion(id => id.Value, value => TenantId.From(value));

        builder.Property(p => p.Name).HasMaxLength(255).IsRequired();

        builder.Property(p => p.Slug)
            .HasConversion(s => s.Value, value => Slug.Create(value).Value)
            .HasMaxLength(120)
            .IsRequired();

        // Regla de oro multi-tenant: índice compuesto SIEMPRE arranca en tenant_id.
        builder.HasIndex(p => new { p.TenantId, p.Slug }).IsUnique();
        builder.HasIndex(p => new { p.TenantId, p.Status, p.CreatedAtUtc });

        builder.Property(p => p.Description);
        builder.Property(p => p.SeoTitle).HasMaxLength(70);
        builder.Property(p => p.SeoDescription).HasMaxLength(320);
        builder.Property(p => p.Brand).HasMaxLength(100);
        builder.HasIndex(p => new { p.TenantId, p.Brand });
        builder.Property(p => p.Status).HasConversion<string>().HasMaxLength(20);
        builder.Property(p => p.CreatedAtUtc);

        // Categorías como uuid[] de Postgres, vía backing field.
        builder.Property<List<Guid>>("_categoryIds").HasColumnName("category_ids");
        builder.Ignore(p => p.CategoryIds);

        builder.Ignore(p => p.DomainEvents);

        builder.OwnsMany(p => p.Options, options =>
        {
            options.ToTable("product_options");
            options.WithOwner().HasForeignKey("product_id");
            options.HasKey(o => o.Id);
            options.Property(o => o.Id).ValueGeneratedNever();
            options.Property(o => o.Name).HasMaxLength(50).IsRequired();

            // Lista de valores como text[] de Postgres, vía backing field.
            options.Property<List<string>>("_values").HasColumnName("values");
            options.Ignore(o => o.Values);
        });

        // Variants como entidad propia (no owned): ComplexProperty para Money
        // solo está disponible en EntityTypeBuilder, no en owned types.
        builder.HasMany(p => p.Variants)
            .WithOne()
            .HasForeignKey("product_id")
            .OnDelete(DeleteBehavior.Cascade);

        builder.OwnsMany(p => p.Images, images =>
        {
            images.ToTable("product_images");
            images.WithOwner().HasForeignKey("product_id");
            images.HasKey(i => i.Id);
            images.Property(i => i.Id).ValueGeneratedNever();
            images.Property(i => i.Url).HasMaxLength(500).IsRequired();
            images.Property(i => i.AltText).HasMaxLength(200);
        });

        // Colecciones por backing field (las listas son privadas en el dominio).
        builder.Navigation(p => p.Options).UsePropertyAccessMode(PropertyAccessMode.Field);
        builder.Navigation(p => p.Images).UsePropertyAccessMode(PropertyAccessMode.Field);
        builder.Navigation(p => p.Variants)
            .UsePropertyAccessMode(PropertyAccessMode.Field)
            .AutoInclude();
    }
}

public sealed class VariantConfiguration : IEntityTypeConfiguration<Variant>
{
    public void Configure(EntityTypeBuilder<Variant> builder)
    {
        builder.ToTable("product_variants");
        builder.HasKey(v => v.Id);
        builder.Property(v => v.Id).ValueGeneratedNever();
        builder.Property(v => v.Sku).HasMaxLength(64).IsRequired();
        builder.HasIndex(v => v.Sku);

        builder.Property<List<string>>("_optionValues").HasColumnName("option_values");
        builder.Ignore(v => v.OptionValues);

        builder.ComplexProperty(v => v.Price, price =>
        {
            price.Property(m => m.AmountInMinorUnits).HasColumnName("price_amount");
            price.Property(m => m.Currency).HasColumnName("price_currency").HasMaxLength(3);
        });

        // Nullable complex type no soporta member-access anidado en EF 10.
        // Serializado "monto|moneda" en una columna: solo se muestra, nunca
        // se filtra ni se suma por precio tachado.
        builder.Property(v => v.CompareAtPrice)
            .HasConversion(ModuleDb.NullableMoneyConverter)
            .HasColumnName("compare_at")
            .HasMaxLength(24);

        // Costo del merchant (interno, nunca en DTOs públicos). Mismo formato
        // serializado que compare_at: se muestra y se suma en stats, no se filtra.
        builder.Property(v => v.Cost)
            .HasConversion(ModuleDb.NullableMoneyConverter)
            .HasColumnName("cost")
            .HasMaxLength(24);
    }
}
