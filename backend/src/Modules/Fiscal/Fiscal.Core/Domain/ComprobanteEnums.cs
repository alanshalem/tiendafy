namespace Fiscal.Core.Domain;

/// <summary>Tipo de comprobante WSFEv1 (los códigos son los que espera ARCA).</summary>
public enum CbteTipo
{
    FacturaA = 1,
    FacturaB = 6,
    FacturaC = 11,
    NotaCreditoA = 3,
    NotaCreditoB = 8,
    NotaCreditoC = 13,
    NotaDebitoA = 2,
    NotaDebitoB = 7,
    NotaDebitoC = 12,
}

/// <summary>Tipo de documento del receptor (WSFEv1).</summary>
public enum DocTipo
{
    Cuit = 80,
    Dni = 96,
    ConsumidorFinal = 99, // DocNro debe ir en 0
}

/// <summary>Alícuota de IVA (Id de WSFEv1). Id=3 (0%) es para A/B, nunca para C (H15).</summary>
public enum IvaId
{
    Iva0 = 3,
    Iva10_5 = 4,
    Iva21 = 5,
    Iva27 = 6,
}

/// <summary>Concepto del comprobante (WSFEv1).</summary>
public enum Concepto
{
    Productos = 1,
    Servicios = 2,
    ProductosYServicios = 3,
}

/// <summary>Condición del receptor frente al IVA (obligatorio desde 01/06/2026 — H6).</summary>
public enum CondicionIvaReceptor
{
    ResponsableInscripto = 1,
    Exento = 4,
    ConsumidorFinal = 5,
    Monotributo = 6,
}
