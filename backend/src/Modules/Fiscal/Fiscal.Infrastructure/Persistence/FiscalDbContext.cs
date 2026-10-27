using System.Globalization;
using Fiscal.Core.Domain;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using SharedKernel.Abstractions;
using SharedKernel.Persistence;

namespace Fiscal.Infrastructure.Persistence;

public sealed class FiscalDbContext : DbContext
{
    // Filtro multi-tenant global, cerrado por defecto: sin tienda en el scope,
    // las entidades con TenantId no devuelven filas. Lo que recorre varias
    // tiendas (workers, endpoints de plataforma, backfills) lo pide explícito
    // con IgnoreQueryFilters() y su propio filtro, o fija la tienda en el scope
    // (TenantContextHolder). La tienda se lee en cada consulta, no al construir.
    private readonly ITenantContext? _tenant;
    private bool FilterByTenant => _tenant?.HasTenant == true;
    private Guid TenantGuid => FilterByTenant ? _tenant!.TenantId.Value : default;

    public FiscalDbContext(DbContextOptions<FiscalDbContext> options, ITenantContext? tenant = null) : base(options)
    {
        _tenant = tenant;
    }

    // El documento del comprador cifrado en reposo, como en ventas y checkouts
    // pero con su propio purpose: el número del receptor de cada comprobante,
    // el del job que lo emite y el SOAP crudo (que lo lleva adentro). Lo setea
    // el host (Program) antes de migrar/servir; null (design-time de
    // migraciones) = columnas en claro. Nunca cambiar el purpose: lo cifrado
    // con el viejo deja de leerse.
    private static IDataProtector? _piiProtector;
    public static void UsePii(IDataProtectionProvider provider) =>
        _piiProtector = provider.CreateProtector("Fiscal.PII.v1");

    /// <summary>Las columnas de <see cref="FiscalDocument"/> que van cifradas.</summary>
    public static readonly IReadOnlyList<string> DocumentPiiProperties =
        [nameof(FiscalDocument.DocNro), nameof(FiscalDocument.RequestPayload), nameof(FiscalDocument.ResponsePayload)];

    /// <summary>Las columnas de <see cref="FiscalEmissionJob"/> que van cifradas.</summary>
    public static readonly IReadOnlyList<string> JobPiiProperties = [nameof(FiscalEmissionJob.BuyerDoc)];

    /// <summary>
    /// Cifra los comprobantes y jobs que quedaron con esos datos en claro (los
    /// de antes del cifrado). Idempotente; corre al arrancar la versión nueva,
    /// nunca en el paso de migración ni en un request.
    /// </summary>
    public async Task<int> ProtectLegacyPiiAsync(CancellationToken ct = default)
    {
        if (_piiProtector is null) return 0;
        var documents = await PiiColumns.ProtectLegacyRowsAsync<FiscalDocument>(this, _piiProtector, DocumentPiiProperties, ct: ct);
        var jobs = await PiiColumns.ProtectLegacyRowsAsync<FiscalEmissionJob>(this, _piiProtector, JobPiiProperties, ct: ct);
        return documents + jobs;
    }

    /// <summary>
    /// El número de documento es un <c>long</c> en el dominio (lo que viaja a
    /// ARCA) y texto cifrado en la base. Una fila de antes del cifrado se lee
    /// tal cual (el número en texto).
    /// </summary>
    private static readonly ValueConverter<long, string> DocNroConverter = new(
        v => PiiColumns.Protect(_piiProtector, v.ToString(CultureInfo.InvariantCulture))!,
        v => long.Parse(PiiColumns.Unprotect(_piiProtector, v)!, CultureInfo.InvariantCulture));

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
        cfg.HasQueryFilter(x => FilterByTenant && x.TenantId == TenantGuid);

        var pos = modelBuilder.Entity<FiscalPointOfSale>();
        pos.ToTable("fiscal_points_of_sale");
        pos.HasKey(x => x.Id);
        pos.Property(x => x.Id).ValueGeneratedNever();
        pos.Property(x => x.Label).HasMaxLength(80).IsRequired();
        pos.HasIndex(x => new { x.TenantId, x.Number }).IsUnique();
        pos.HasQueryFilter(x => FilterByTenant && x.TenantId == TenantGuid);

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
        cert.HasQueryFilter(x => FilterByTenant && x.TenantId == TenantGuid);

        var ta = modelBuilder.Entity<FiscalAccessToken>();
        ta.ToTable("fiscal_access_tokens");
        ta.HasKey(x => x.Id);
        ta.Property(x => x.Id).ValueGeneratedNever();
        ta.Property(x => x.Cuit).HasMaxLength(11).IsRequired();
        // "ws_sr_constancia_inscripcion" tiene 28 caracteres: con 20 no entraba.
        ta.Property(x => x.Service).HasMaxLength(64).IsRequired();
        ta.Property(x => x.Environment).HasConversion<string>().HasMaxLength(15);
        ta.Property(x => x.TokenEncrypted).HasColumnType("text").IsRequired();
        ta.Property(x => x.SignEncrypted).HasColumnType("text").IsRequired();
        ta.HasIndex(x => new { x.TenantId, x.Cuit, x.Service, x.Environment }).IsUnique();
        ta.HasQueryFilter(x => FilterByTenant && x.TenantId == TenantGuid);

        var doc = modelBuilder.Entity<FiscalDocument>();
        doc.ToTable("fiscal_documents");
        doc.HasKey(x => x.Id);
        doc.Property(x => x.Id).ValueGeneratedNever();
        doc.Property(x => x.Environment).HasConversion<string>().HasMaxLength(15);
        doc.Property(x => x.CbteTipo).HasConversion<int>();
        doc.Property(x => x.DocTipo).HasConversion<int>();
        // Cifrados (ver UsePii), en `text` y sin índice: nadie busca ni filtra
        // comprobantes por el documento del receptor (el libro IVA y el PDF lo
        // leen ya descifrado, comprobante por comprobante).
        doc.Property(x => x.DocNro).HasConversion(DocNroConverter).HasColumnType("text");
        doc.Property(x => x.Result).HasConversion<string>().HasMaxLength(15);
        doc.Property(x => x.ImpTotal).HasColumnType("numeric(18,2)");
        doc.Property(x => x.ImpNeto).HasColumnType("numeric(18,2)");
        doc.Property(x => x.ImpIVA).HasColumnType("numeric(18,2)");
        doc.Property(x => x.Cae).HasMaxLength(20);
        doc.Property(x => x.Observations).HasColumnType("text");
        doc.Property(x => x.Errors).HasColumnType("text");
        var pii = PiiColumns.Converter(() => _piiProtector);
        doc.Property(x => x.RequestPayload).HasColumnType("text").HasConversion(pii);
        doc.Property(x => x.ResponsePayload).HasColumnType("text").HasConversion(pii);
        doc.Property(x => x.IdempotencyKey).HasMaxLength(100);
        doc.HasIndex(x => new { x.TenantId, x.OrderId });
        // Único sólo para comprobantes autorizados: un rechazo no consume número,
        // así que puede reintentarse con el mismo (ARCA tampoco lo consumió).
        doc.HasIndex(x => new { x.TenantId, x.Environment, x.PtoVta, x.CbteTipo, x.Number })
            .IsUnique()
            .HasFilter("result = 'Authorized'");
        doc.HasQueryFilter(x => FilterByTenant && x.TenantId == TenantGuid);

        var job = modelBuilder.Entity<FiscalEmissionJob>();
        job.ToTable("fiscal_emission_jobs");
        job.HasKey(x => x.Id);
        job.Property(x => x.Id).ValueGeneratedNever();
        job.Property(x => x.Kind).HasConversion<int>();
        job.Property(x => x.Status).HasConversion<string>().HasMaxLength(15);
        // Cifrado (ver UsePii): el ciphertext no entra en los 20 de antes. El
        // número sale del documento de la venta, que el dominio ya acota a 20.
        job.Property(x => x.BuyerDoc).HasColumnType("text").HasConversion(pii);
        job.Property(x => x.LastError).HasColumnType("text");
        job.Property(x => x.IdempotencyKey).HasMaxLength(100).HasDefaultValue(string.Empty);
        job.Property(x => x.Reason).HasMaxLength(300);
        // Un job por (tenant, orden, tipo, clave): el trigger no duplica la
        // factura (clave vacía) y un reembolso o un pedido manual repetido no
        // duplica su nota de crédito.
        job.HasIndex(x => new { x.TenantId, x.OrderId, x.Kind, x.IdempotencyKey }).IsUnique();
        // El worker barre pendientes listos para reintentar.
        job.HasIndex(x => new { x.Status, x.NextAttemptUtc });
        job.HasQueryFilter(x => FilterByTenant && x.TenantId == TenantGuid);

        var seq = modelBuilder.Entity<FiscalSequence>();
        seq.ToTable("fiscal_sequences");
        seq.HasKey(x => x.Id);
        seq.Property(x => x.Id).ValueGeneratedNever();
        seq.Property(x => x.Environment).HasConversion<string>().HasMaxLength(15);
        seq.Property(x => x.CbteTipo).HasConversion<int>();
        seq.HasIndex(x => new { x.TenantId, x.Environment, x.PtoVta, x.CbteTipo }).IsUnique();
        seq.HasQueryFilter(x => FilterByTenant && x.TenantId == TenantGuid);

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
        legal.HasQueryFilter(x => FilterByTenant && x.TenantId == TenantGuid);
    }
}
