namespace Tenancy.Core.Domain;

public enum TenantStatus
{
    Active = 0,
    Suspended = 1,   // falta de pago, abuso — storefront muestra página de suspensión
    Canceled = 2,    // baja voluntaria — soft state, datos retenidos por política
}

public enum PlanTier
{
    Free = 0,
    Basic = 1,
    Pro = 2,
    Enterprise = 3,
}
