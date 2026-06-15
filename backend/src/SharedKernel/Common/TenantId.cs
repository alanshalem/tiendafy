namespace SharedKernel.Common;

/// <summary>
/// ID de tenant fuertemente tipado. Evita pasar un Guid de producto donde
/// va un tenant (el compilador lo rechaza).
/// </summary>
public readonly record struct TenantId(Guid Value)
{
    public static TenantId New() => new(Guid.NewGuid());

    public static TenantId From(Guid value) =>
        value == Guid.Empty
            ? throw new ArgumentException("TenantId cannot be empty.", nameof(value))
            : new TenantId(value);

    public static TenantId Parse(string value) => From(Guid.Parse(value));

    public override string ToString() => Value.ToString();
}
