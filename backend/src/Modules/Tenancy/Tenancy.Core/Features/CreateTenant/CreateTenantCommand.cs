namespace Tenancy.Core.Features.CreateTenant;

public sealed record CreateTenantCommand(string Name, string Subdomain);
