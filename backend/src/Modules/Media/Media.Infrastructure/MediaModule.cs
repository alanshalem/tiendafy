using Amazon.S3;
using Amazon.S3.Util;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Media.Infrastructure;

public static class MediaModule
{
    public static IServiceCollection AddMediaModule(this IServiceCollection services, IConfiguration configuration)
    {
        var options = new MediaOptions
        {
            Endpoint = configuration["Media:Endpoint"] ?? "http://localhost:9000",
            PublicBaseUrl = configuration["Media:PublicBaseUrl"] ?? "http://localhost:9000",
            AccessKey = configuration["Media:AccessKey"] ?? "minioadmin",
            SecretKey = configuration["Media:SecretKey"] ?? "minioadmin",
        };

        services.AddSingleton(options);
        services.AddSingleton<IAmazonS3>(_ => new AmazonS3Client(
            options.AccessKey,
            options.SecretKey,
            new AmazonS3Config
            {
                ServiceURL = options.Endpoint,
                ForcePathStyle = true, // MinIO no usa virtual-hosted buckets
            }));
        services.AddSingleton<IMediaStorage, S3MediaStorage>();

        return services;
    }

    /// <summary>Crea los buckets si no existen (dev/arranque): media con lectura
    /// pública; privado (adjuntos de chat) sin policy — solo URLs firmadas.</summary>
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
