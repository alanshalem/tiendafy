namespace Fiscal.Core.Domain;

/// <summary>
/// Certificado X.509 del tenant para autenticar contra ARCA (WSAA). La clave
/// privada y el certificado se guardan CIFRADOS (DataProtection) — nunca en
/// claro, nunca por API, nunca en disco/S3. Flujo: se genera keypair+CSR
/// (PendingCsr) → el merchant sube el cert firmado por ARCA (Active).
/// </summary>
public sealed class FiscalCertificate
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public FiscalEnvironment Environment { get; private set; }

    /// <summary>Clave privada RSA (PEM PKCS#8) cifrada.</summary>
    public string PrivateKeyEncrypted { get; private set; } = null!;
    /// <summary>CSR generado (PEM) — se le entrega al merchant para subir a ARCA.</summary>
    public string? CsrPem { get; private set; }
    /// <summary>Certificado firmado por ARCA (PEM) cifrado — presente cuando Active.</summary>
    public string? CertificatePemEncrypted { get; private set; }

    public CertificateStatus Status { get; private set; }
    public string? SubjectCn { get; private set; }
    public DateTime? NotBeforeUtc { get; private set; }
    public DateTime? NotAfterUtc { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private FiscalCertificate() { } // EF Core

    /// <summary>Alta con el CSR recién generado (la clave privada ya viene cifrada).</summary>
    public static FiscalCertificate CreatePending(Guid tenantId, FiscalEnvironment environment, string privateKeyEncrypted, string csrPem)
    {
        var now = DateTime.UtcNow;
        return new FiscalCertificate
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Environment = environment,
            PrivateKeyEncrypted = privateKeyEncrypted,
            CsrPem = csrPem,
            Status = CertificateStatus.PendingCsr,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };
    }

    /// <summary>El merchant subió el cert firmado por ARCA: pasa a Active.</summary>
    public void Activate(string certificatePemEncrypted, string subjectCn, DateTime notBefore, DateTime notAfter)
    {
        CertificatePemEncrypted = certificatePemEncrypted;
        SubjectCn = subjectCn;
        NotBeforeUtc = notBefore;
        NotAfterUtc = notAfter;
        Status = notAfter <= DateTime.UtcNow ? CertificateStatus.Expired : CertificateStatus.Active;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public bool IsUsable => Status == CertificateStatus.Active && NotAfterUtc > DateTime.UtcNow;
}

/// <summary>
/// Ticket de Acceso (TA) de WSAA cacheado. Persistido y cifrado porque ARCA no
/// entrega otro mientras el anterior siga vigente (H4): perderlo = no facturar
/// hasta 12h. Clave lógica: (tenant, cuit, service, environment).
/// </summary>
public sealed class FiscalAccessToken
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Cuit { get; private set; } = null!;
    /// <summary>Servicio WSN (ej. "wsfe").</summary>
    public string Service { get; private set; } = null!;
    public FiscalEnvironment Environment { get; private set; }

    public string TokenEncrypted { get; private set; } = null!;
    public string SignEncrypted { get; private set; } = null!;
    public DateTime GenerationTimeUtc { get; private set; }
    public DateTime ExpirationTimeUtc { get; private set; }

    private FiscalAccessToken() { } // EF Core

    public static FiscalAccessToken Create(
        Guid tenantId, string cuit, string service, FiscalEnvironment environment,
        string tokenEncrypted, string signEncrypted, DateTime generationTime, DateTime expirationTime) => new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Cuit = cuit,
            Service = service,
            Environment = environment,
            TokenEncrypted = tokenEncrypted,
            SignEncrypted = signEncrypted,
            GenerationTimeUtc = generationTime,
            ExpirationTimeUtc = expirationTime,
        };

    public void Replace(string tokenEncrypted, string signEncrypted, DateTime generationTime, DateTime expirationTime)
    {
        TokenEncrypted = tokenEncrypted;
        SignEncrypted = signEncrypted;
        GenerationTimeUtc = generationTime;
        ExpirationTimeUtc = expirationTime;
    }

    /// <summary>¿Sigue vigente con margen? (H4: reusar mientras valga).</summary>
    public bool IsValid(DateTime nowUtc, TimeSpan margin) => nowUtc < ExpirationTimeUtc - margin;
}
