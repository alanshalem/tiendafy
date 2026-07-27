namespace Fiscal.Core.Domain;

/// <summary>Condición del emisor frente al IVA (define la clase de comprobante).</summary>
public enum FiscalCondition
{
    ResponsableInscripto = 0, // emite A (a RI) / B (a CF y otros)
    Monotributo = 1,          // emite C
}

/// <summary>Ambiente de ARCA. Los endpoints van explícitos por ambiente (H1).</summary>
public enum FiscalEnvironment
{
    Homologacion = 0, // testing (wsaahomo / wswhomo)
    Produccion = 1,   // wsaa / servicios1
}

/// <summary>Cuándo se dispara la factura de una venta online (configurable por tienda).</summary>
public enum EmissionTrigger
{
    OnPayment = 0,      // al acreditarse el pago
    OnFulfillment = 1,  // al despachar/entregar (RG 01/07/2026 para bienes)
}

/// <summary>Estado del certificado del tenant.</summary>
public enum CertificateStatus
{
    PendingCsr = 0, // se generó el CSR; falta subir el cert firmado por ARCA
    Active = 1,     // cert válido cargado
    Expired = 2,    // venció
}

/// <summary>Clase del comprobante (armado distinto por clase — H15).</summary>
public enum ComprobanteClase
{
    A = 0,
    B = 1,
    C = 2,
}
