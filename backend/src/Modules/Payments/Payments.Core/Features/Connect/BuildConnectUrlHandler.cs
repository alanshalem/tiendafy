using Payments.Core.Abstractions;
using SharedKernel.Common;

namespace Payments.Core.Features.Connect;

/// <summary>Arma la URL de autorización OAuth para el botón "Conectá tu cuenta".</summary>
public sealed class BuildConnectUrlHandler(IOAuthStateProtector state, IMercadoPagoOAuthClient client)
{
    public string Handle(TenantId tenantId) =>
        client.BuildAuthorizationUrl(state.Protect(tenantId));
}
