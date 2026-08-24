using Amazon.S3;
using Amazon.S3.Util;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Media.Infrastructure;

public static class MediaModule
{
    public static IServiceCollection AddMediaModule(
        this IServiceCollection services, IConfiguration configuration, bool isProduction = false)
    {
        var options = new MediaOptions
        {
            Endpoint = configuration["Media:Endpoint"] ?? "http://localhost:9000",
            PublicBaseUrl = configuration["Media:PublicBaseUrl"] ?? "http://localhost:9000",
            AccessKey = configuration["Media:AccessKey"] ?? "minioadmin",
            SecretKey = configuration["Media:SecretKey"] ?? "minioadmin",
            Bucket = configuration["Media:Bucket"] ?? "tiendafy-media",
            PrivateBucket = configuration["Media:PrivateBucket"] ?? "tiendafy-private",
            Region = configuration["Media:Region"],
            // Por defecto, la forma de MinIO (dev y S3 path-style).
            BucketInPublicUrl = !bool.TryParse(configuration["Media:BucketInPublicUrl"], out var inUrl) || inUrl,
        };

        // Sin esto, una API de producción mal configurada arranca contra el MinIO
        // de desarrollo: las subidas "funcionan" (200) y las imágenes apuntan a
        // localhost. Se descubre cuando un cliente ve la tienda rota, no antes.
        if (isProduction)
        {
            var problems = new List<string>();
            if (options.Endpoint.Contains("localhost", StringComparison.OrdinalIgnoreCase)
                || options.Endpoint.Contains("127.0.0.1", StringComparison.Ordinal))
                problems.Add("Media:Endpoint apunta a localhost");
            if (options.PublicBaseUrl.Contains("localhost", StringComparison.OrdinalIgnoreCase)
                || options.PublicBaseUrl.Contains("127.0.0.1", StringComparison.Ordinal))
                problems.Add("Media:PublicBaseUrl apunta a localhost");
            if (options.AccessKey is "minioadmin" || options.SecretKey is "minioadmin")
                problems.Add("Media:AccessKey/SecretKey son las de desarrollo");
            if (problems.Count > 0)
                throw new InvalidOperationException(
                    "Configuración de media inválida en Producción: " + string.Join("; ", problems) +
                    ". Completá Media__Endpoint, Media__PublicBaseUrl, Media__AccessKey y Media__SecretKey " +
                    "(R2, S3 o el MinIO propio). Sin esto, las imágenes que suban los comercios se pierden.");
        }

        services.AddSingleton(options);
        services.AddSingleton<IAmazonS3>(_ =>
        {
            var config = new AmazonS3Config
            {
                ServiceURL = options.Endpoint,
                ForcePathStyle = true, // MinIO y R2 no usan virtual-hosted buckets
            };
            // R2 exige firmar con región "auto"; MinIO ignora la región.
            if (!string.IsNullOrWhiteSpace(options.Region))
                config.AuthenticationRegion = options.Region;
            return new AmazonS3Client(options.AccessKey, options.SecretKey, config);
        });
        services.AddSingleton<IMediaStorage, S3MediaStorage>();

        return services;
    }

    /// <summary>
    /// Crea los buckets si no existen (dev/arranque): media con lectura pública;
    /// privado (adjuntos de chat) sin policy — solo URLs firmadas.
    ///
    /// En R2 esto va APAGADO (Media:EnsureBucketOnStartup=false): no soporta
    /// PutBucketPolicy y el acceso público se habilita atando un dominio propio
    /// al bucket desde el panel. Los dos buckets se crean una vez a mano.
    /// </summary>
    public static async Task EnsureMediaBucketAsync(this IServiceProvider services)
    {
        var s3 = services.GetRequiredService<IAmazonS3>();
        var options = services.GetRequiredService<MediaOptions>();

        if (!await AmazonS3Util.DoesS3BucketExistV2Async(s3, options.Bucket))
        {
            await s3.PutBucketAsync(options.Bucket);
            await s3.PutBucketPolicyAsync(options.Bucket, $$"""
            {
              "Version": "2012-10-17",
              "Statement": [{
                "Effect": "Allow",
                "Principal": { "AWS": ["*"] },
                "Action": ["s3:GetObject"],
                "Resource": ["arn:aws:s3:::{{options.Bucket}}/*"]
              }]
            }
            """);
        }

        if (!await AmazonS3Util.DoesS3BucketExistV2Async(s3, options.PrivateBucket))
            await s3.PutBucketAsync(options.PrivateBucket);
    }
}
