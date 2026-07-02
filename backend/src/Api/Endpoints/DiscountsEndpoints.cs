using Api.Auth;
using Discounts.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static class DiscountsEndpoints
{
    public static RouteGroupBuilder MapDiscountsEndpoints(this RouteGroupBuilder group)
    {
        var coupons = group.MapGroup("/coupons").RequireTenant();

        coupons.MapGet("/", async (ITenantContext tenant, DiscountsDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var tid = tenant.TenantId.Value;
            var items = await db.Coupons.AsNoTracking()
                .Where(c => c.TenantId == tid)
                .OrderByDescending(c => c.CreatedAtUtc)
                .ToListAsync(ct);
            return Results.Ok(new { items = items.Select(ToDto) });
        }).RequireTenantMembership(); // listado de cupones = solo admin (validate es público aparte)

        coupons.MapPost("/", async (CouponRequest req, ITenantContext tenant, DiscountsDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var tid = tenant.TenantId.Value;

            var created = Coupon.Create(tid, req.Code, ParseType(req.Type), req.Value, req.MinPurchase,
                req.StartsAtUtc, req.EndsAtUtc, req.MaxUses, req.Active);
            if (created.IsFailure) return created.Error.ToProblem();

            if (await db.Coupons.AnyAsync(c => c.TenantId == tid && c.Code == created.Value.Code, ct))
                return Error.Conflict("Coupon.Duplicate", $"Ya existe un cupón con el código '{created.Value.Code}'.").ToProblem();

            db.Coupons.Add(created.Value);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/coupons/{created.Value.Id}", ToDto(created.Value));
        });

        coupons.MapPut("/{id:guid}", async (Guid id, CouponRequest req, ITenantContext tenant, DiscountsDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var tid = tenant.TenantId.Value;
            var coupon = await db.Coupons.FirstOrDefaultAsync(c => c.TenantId == tid && c.Id == id, ct);
            if (coupon is null) return Results.NotFound();

            var newCode = (req.Code ?? string.Empty).Trim().ToUpperInvariant();
            if (await db.Coupons.AnyAsync(c => c.TenantId == tid && c.Code == newCode && c.Id != id, ct))
                return Error.Conflict("Coupon.Duplicate", $"Ya existe un cupón con el código '{newCode}'.").ToProblem();

            var result = coupon.Update(req.Code, ParseType(req.Type), req.Value, req.MinPurchase,
                req.StartsAtUtc, req.EndsAtUtc, req.MaxUses, req.Active);
            if (result.IsFailure) return result.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(coupon));
        });

        coupons.MapPost("/{id:guid}/toggle", async (Guid id, ITenantContext tenant, DiscountsDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var tid = tenant.TenantId.Value;
            var coupon = await db.Coupons.FirstOrDefaultAsync(c => c.TenantId == tid && c.Id == id, ct);
            if (coupon is null) return Results.NotFound();

            coupon.SetActive(!coupon.Active);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(coupon));
        });

        coupons.MapDelete("/{id:guid}", async (Guid id, ITenantContext tenant, DiscountsDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var tid = tenant.TenantId.Value;
            var coupon = await db.Coupons.FirstOrDefaultAsync(c => c.TenantId == tid && c.Id == id, ct);
            if (coupon is null) return Results.NotFound();

            db.Coupons.Remove(coupon);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Público (storefront): valida un código contra un subtotal y devuelve el descuento.
        coupons.MapPost("/validate", async (ValidateCouponRequest req, ITenantContext tenant, DiscountsDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            var tid = tenant.TenantId.Value;
            var code = (req.Code ?? string.Empty).Trim().ToUpperInvariant();

            var coupon = await db.Coupons.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tid && c.Code == code, ct);
            if (coupon is null)
                return Results.Ok(new { valid = false, error = "El cupón no existe.", code, type = "", discountAmount = 0L, freeShipping = false });

            var ev = coupon.Evaluate(req.Subtotal, DateTime.UtcNow);
            return Results.Ok(new
            {
                valid = ev.Valid,
                error = ev.Error,
                code = coupon.Code,
                type = coupon.Type.ToString(),
                discountAmount = ev.Discount,
                freeShipping = ev.FreeShipping,
            });
        }).RequireRateLimiting("auth");

        return group;
    }

    private static CouponType ParseType(string? type) => (type ?? string.Empty).Trim().ToLowerInvariant() switch
    {
        "percentage" or "percent" => CouponType.Percentage,
        "freeshipping" or "free_shipping" or "shipping" => CouponType.FreeShipping,
        _ => CouponType.FixedAmount,
    };

    private static object ToDto(Coupon c) => new
    {
        c.Id,
        c.Code,
        type = c.Type.ToString(),
        c.Value,
        c.MinPurchase,
        c.StartsAtUtc,
        c.EndsAtUtc,
        c.MaxUses,
        c.UsedCount,
        c.Active,
        c.CreatedAtUtc,
    };
}

public sealed record CouponRequest(
    string Code, string Type, long Value, long MinPurchase,
    DateTime? StartsAtUtc, DateTime? EndsAtUtc, int? MaxUses, bool Active);

public sealed record ValidateCouponRequest(string Code, long Subtotal);
