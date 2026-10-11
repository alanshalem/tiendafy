using System.Xml.Linq;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Padron;

namespace UnitTests.Fiscal;

/// <summary>
/// La lectura de la constancia de inscripción (padrón A5, getPersona_v2).
///
/// No hay certificado de ARCA en el entorno de desarrollo, así que lo que se
/// prueba sin red es lo que más se puede romper: de qué datos sale la
/// condición frente al IVA. Las respuestas siguen la estructura del servicio
/// (personaReturn → datosGenerales / datosRegimenGeneral / datosMonotributo /
/// errorConstancia), con los prefijos que usa ARCA.
/// </summary>
public sealed class PadronA5Tests
{
    private static XElement Respuesta(string persona) => XDocument.Parse($"""
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <ns2:getPersona_v2Response xmlns:ns2="http://a5.soap.ws.server.puc.sr/">
              <personaReturn>{persona}</personaReturn>
            </ns2:getPersona_v2Response>
          </soap:Body>
        </soap:Envelope>
        """).Root!;

    private const string Domicilio = """
        <domicilioFiscal>
          <direccion>AV CORRIENTES 1234</direccion>
          <localidad>CIUDAD AUTONOMA BUENOS AIRES</localidad>
          <descripcionProvincia>CIUDAD AUTONOMA BUENOS AIRES</descripcionProvincia>
        </domicilioFiscal>
        """;

    [Fact]
    public void Una_sociedad_con_IVA_es_Responsable_Inscripto()
    {
        var r = PadronA5Response.Parse(Respuesta($"""
            <datosGenerales>
              <razonSocial>PUENTE ORIENTE SA</razonSocial>
              <tipoPersona>JURIDICA</tipoPersona>
              {Domicilio}
            </datosGenerales>
            <datosRegimenGeneral>
              <impuesto><idImpuesto>10</idImpuesto><descripcionImpuesto>GANANCIAS SOCIEDADES</descripcionImpuesto></impuesto>
              <impuesto><idImpuesto>30</idImpuesto><descripcionImpuesto>IVA</descripcionImpuesto></impuesto>
            </datosRegimenGeneral>
            """), 30712345671);

        Assert.True(r.IsSuccess);
        Assert.Equal("PUENTE ORIENTE SA", r.Value.Name);
        Assert.True(r.Value.IsCompany);
        Assert.Equal(CondicionIvaReceptor.ResponsableInscripto, r.Value.Condicion);
        Assert.Equal("AV CORRIENTES 1234, CIUDAD AUTONOMA BUENOS AIRES, CIUDAD AUTONOMA BUENOS AIRES", r.Value.Address);
    }

    [Fact]
    public void Una_persona_fisica_inscripta_tambien_es_Responsable_Inscripto()
    {
        // El caso que el número solo no resuelve: prefijo 20, y aun así es RI.
        var r = PadronA5Response.Parse(Respuesta("""
            <datosGenerales>
              <apellido>GOMEZ</apellido>
              <nombre>ANA MARIA</nombre>
              <tipoPersona>FISICA</tipoPersona>
            </datosGenerales>
            <datosRegimenGeneral>
              <impuesto><idImpuesto>30</idImpuesto><descripcionImpuesto>IVA</descripcionImpuesto></impuesto>
            </datosRegimenGeneral>
            """), 20123456786);

        Assert.Equal("GOMEZ, ANA MARIA", r.Value.Name);
        Assert.False(r.Value.IsCompany);
        Assert.Equal(CondicionIvaReceptor.ResponsableInscripto, r.Value.Condicion);
    }

    [Fact]
    public void Quien_figura_en_el_regimen_simplificado_es_monotributista()
    {
        var r = PadronA5Response.Parse(Respuesta("""
            <datosGenerales>
              <apellido>PEREZ</apellido><nombre>JUAN</nombre><tipoPersona>FISICA</tipoPersona>
            </datosGenerales>
            <datosMonotributo>
              <impuesto><idImpuesto>20</idImpuesto><descripcionImpuesto>MONOTRIBUTO</descripcionImpuesto></impuesto>
              <categoriaMonotributo><descripcionCategoria>D LOCACIONES DE SERVICIO</descripcionCategoria></categoriaMonotributo>
            </datosMonotributo>
            """), 20123456786);

        Assert.Equal(CondicionIvaReceptor.Monotributo, r.Value.Condicion);
    }

    [Fact]
    public void Con_IVA_exento_es_exento()
    {
        var r = PadronA5Response.Parse(Respuesta("""
            <datosGenerales><razonSocial>FUNDACION X</razonSocial><tipoPersona>JURIDICA</tipoPersona></datosGenerales>
            <datosRegimenGeneral>
              <impuesto><idImpuesto>32</idImpuesto><descripcionImpuesto>IVA EXENTO</descripcionImpuesto></impuesto>
            </datosRegimenGeneral>
            """), 30712345671);

        Assert.Equal(CondicionIvaReceptor.Exento, r.Value.Condicion);
    }

    [Fact]
    public void Sin_IVA_ni_monotributo_es_consumidor_final()
    {
        // Un empleado en relación de dependencia con CUIL, por ejemplo.
        var r = PadronA5Response.Parse(Respuesta("""
            <datosGenerales><apellido>LOPEZ</apellido><nombre>CARLA</nombre><tipoPersona>FISICA</tipoPersona></datosGenerales>
            <datosRegimenGeneral>
              <impuesto><idImpuesto>11</idImpuesto><descripcionImpuesto>GANANCIAS PERSONAS FISICAS</descripcionImpuesto></impuesto>
            </datosRegimenGeneral>
            """), 27123456784);

        Assert.Equal(CondicionIvaReceptor.ConsumidorFinal, r.Value.Condicion);
        Assert.Null(r.Value.Address);
    }

    [Fact]
    public void Sin_constancia_falla_con_el_motivo_de_ARCA()
    {
        var r = PadronA5Response.Parse(Respuesta("""
            <errorConstancia>
              <error>La clave se encuentra inactiva</error>
            </errorConstancia>
            """), 20123456786);

        Assert.True(r.IsFailure);
        Assert.Equal("Padron.NotFound", r.Error.Code);
        Assert.Contains("La clave se encuentra inactiva", r.Error.Message);
    }

    [Fact]
    public void El_nombre_no_se_confunde_con_otros_campos_que_se_llaman_igual()
    {
        // "nombre" también aparece adentro de otras estructuras: se lee el hijo
        // directo de datosGenerales, no el primero que aparezca.
        var r = PadronA5Response.Parse(Respuesta("""
            <datosGenerales>
              <apellido>DIAZ</apellido>
              <nombre>LUIS</nombre>
              <tipoPersona>FISICA</tipoPersona>
              <domicilioFiscal><direccion>CALLE 1</direccion><nombre>NO ES EL NOMBRE</nombre></domicilioFiscal>
            </datosGenerales>
            """), 20123456786);

        Assert.Equal("DIAZ, LUIS", r.Value.Name);
    }
}
