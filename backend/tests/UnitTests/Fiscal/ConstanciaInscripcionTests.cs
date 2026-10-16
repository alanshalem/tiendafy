using System.Xml.Linq;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Padron;

namespace UnitTests.Fiscal;

/// <summary>
/// La lectura de la constancia de inscripción (ws_sr_constancia_inscripcion,
/// ex padrón A5, getPersona_v2).
///
/// No hay certificado de ARCA en el entorno de desarrollo, así que lo que se
/// prueba sin red es lo que más se puede romper: de qué datos sale la
/// condición frente al IVA. Las respuestas siguen la estructura del servicio
/// (personaReturn → datosGenerales / datosRegimenGeneral / datosMonotributo /
/// errorConstancia), con los prefijos que usa ARCA.
/// </summary>
public sealed class ConstanciaInscripcionTests
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
        var r = ConstanciaInscripcionResponse.Parse(Respuesta($"""
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
        var r = ConstanciaInscripcionResponse.Parse(Respuesta("""
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
        var r = ConstanciaInscripcionResponse.Parse(Respuesta("""
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
        var r = ConstanciaInscripcionResponse.Parse(Respuesta("""
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
        var r = ConstanciaInscripcionResponse.Parse(Respuesta("""
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
        var r = ConstanciaInscripcionResponse.Parse(Respuesta("""
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
        var r = ConstanciaInscripcionResponse.Parse(Respuesta("""
            <datosGenerales>
              <apellido>DIAZ</apellido>
              <nombre>LUIS</nombre>
              <tipoPersona>FISICA</tipoPersona>
              <domicilioFiscal><direccion>CALLE 1</direccion><nombre>NO ES EL NOMBRE</nombre></domicilioFiscal>
            </datosGenerales>
            """), 20123456786);

        Assert.Equal("DIAZ, LUIS", r.Value.Name);
    }

    // ----------------------------------------------------------------------
    // Respuestas de ejemplo del manual oficial de ARCA ("Consulta a Padrón
    // Constancia de Inscripción", ws_sr_constancia_inscripcion, v4.1,
    // marzo 2026), copiadas tal cual salvo los cortes de línea del PDF.
    // ----------------------------------------------------------------------

    [Fact]
    public void Ejemplo_del_manual_getPersona_v2_persona_fisica_con_IVA()
    {
        // §3.2.3: persona física con caracterizaciones (incluida la 639,
        // Ganancias simplificada, con fechaSolicitud), actividad, categoría de
        // autónomos e impuestos con estadoImpuesto y motivo.
        var r = ConstanciaInscripcionResponse.Parse(XDocument.Parse("""
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
              <soap:Body>
                <ns2:getPersona_v2Response xmlns:ns2="http://a5.soap.ws.server.puc.sr/">
                  <personaReturn>
                    <datosGenerales>
                      <apellido>SKIOGEK OGIUPE</apellido>
                      <caracterizacion>
                        <descripcionCaracterizacion>IVA ANUAL AGROPECUARIO</descripcionCaracterizacion>
                        <fechaSolicitud>20030316</fechaSolicitud>
                        <idCaracterizacion>17</idCaracterizacion>
                        <periodo>19010101</periodo>
                      </caracterizacion>
                      <caracterizacion>
                        <descripcionCaracterizacion>CUENTA CORRIENTE</descripcionCaracterizacion>
                        <fechaSolicitud>20070901</fechaSolicitud>
                        <idCaracterizacion>82</idCaracterizacion>
                        <periodo>20070901</periodo>
                      </caracterizacion>
                      <caracterizacion>
                        <descripcionCaracterizacion>CATEGORÍA A: MUY BAJO RIESGO</descripcionCaracterizacion>
                        <fechaSolicitud>20161025</fechaSolicitud>
                        <idCaracterizacion>354</idCaracterizacion>
                        <periodo>20161025</periodo>
                      </caracterizacion>
                      <caracterizacion>
                        <descripcionCaracterizacion>GANANCIAS SIMPLIFICADA LEY 27.779</descripcionCaracterizacion>
                        <fechaSolicitud>20260220</fechaSolicitud>
                        <idCaracterizacion>639</idCaracterizacion>
                        <periodo>20250101</periodo>
                      </caracterizacion>
                      <domicilioFiscal>
                        <codPostal>7007</codPostal>
                        <datoAdicional>BARRIO ANTONIO CARLOS</datoAdicional>
                        <descripcionProvincia>BUENOS AIRES</descripcionProvincia>
                        <direccion>SAN MANUEL 9</direccion>
                        <idProvincia>1</idProvincia>
                        <localidad>SAN MANUEL</localidad>
                        <tipoDatoAdicional>BARRIO</tipoDatoAdicional>
                        <tipoDomicilio>FISCAL</tipoDomicilio>
                      </domicilioFiscal>
                      <esSucesion>NO</esSucesion>
                      <estadoClave>ACTIVO</estadoClave>
                      <idPersona>20164755100</idPersona>
                      <mesCierre>12</mesCierre>
                      <nombre>OGIEK KPSGR</nombre>
                      <tipoClave>CUIT</tipoClave>
                      <tipoPersona>FISICA</tipoPersona>
                    </datosGenerales>
                    <datosRegimenGeneral>
                      <actividad>
                        <descripcionActividad>CULTIVO DE CEREALES N.C.P., EXCEPTO LOS DE USO FORRAJERO</descripcionActividad>
                        <idActividad>11119</idActividad>
                        <nomenclador>883</nomenclador>
                        <orden>1</orden>
                        <periodo>201311</periodo>
                      </actividad>
                      <categoriaAutonomo>
                        <descripcionCategoria>T3 CAT II INGRESOS DESDE $25.001</descripcionCategoria>
                        <idCategoria>302</idCategoria>
                        <idImpuesto>308</idImpuesto>
                        <periodo>200703</periodo>
                      </categoriaAutonomo>
                      <impuesto>
                        <descripcionImpuesto>GANANCIAS PERSONAS FISICAS</descripcionImpuesto>
                        <estadoImpuesto>AC</estadoImpuesto>
                        <idImpuesto>11</idImpuesto>
                        <motivo>INSCRIPCIÓN TRAMITADA EN AGENCIA</motivo>
                        <periodo>199203</periodo>
                      </impuesto>
                      <impuesto>
                        <descripcionImpuesto>IVA</descripcionImpuesto>
                        <estadoImpuesto>AC</estadoImpuesto>
                        <idImpuesto>30</idImpuesto>
                        <motivo>INSCRIPCIÓN TRAMITADA EN AGENCIA</motivo>
                        <periodo>199911</periodo>
                      </impuesto>
                      <impuesto>
                        <descripcionImpuesto>APORTES SEG.SOCIAL AUTONOMOS</descripcionImpuesto>
                        <estadoImpuesto>AC</estadoImpuesto>
                        <idImpuesto>308</idImpuesto>
                        <motivo>INSCRIPCIÓN NO TRAMITADA EN AGENCIA</motivo>
                        <periodo>200703</periodo>
                      </impuesto>
                    </datosRegimenGeneral>
                    <metadata>
                      <fechaHora>2026-02-26T15:52:37.653-03:00</fechaHora>
                      <servidor>qa-sr-padron-ws.cloudhomo.afip.gob.ar</servidor>
                    </metadata>
                  </personaReturn>
                </ns2:getPersona_v2Response>
              </soap:Body>
            </soap:Envelope>
            """).Root!, 20164755100);

        Assert.True(r.IsSuccess, r.IsFailure ? r.Error.Message : null);
        Assert.Equal("SKIOGEK OGIUPE, OGIEK KPSGR", r.Value.Name);
        Assert.False(r.Value.IsCompany);
        Assert.Equal(CondicionIvaReceptor.ResponsableInscripto, r.Value.Condicion);
        Assert.Equal("SAN MANUEL 9, SAN MANUEL, BUENOS AIRES", r.Value.Address);
    }

    [Fact]
    public void Ejemplo_del_manual_monotributista_que_ademas_es_empleador()
    {
        // §3.3.3, la segunda persona del ejemplo: monotributista que además
        // figura en el régimen general como empleador (impuesto 301). Es
        // monotributista: el régimen general no la hace RI.
        var r = ConstanciaInscripcionResponse.Parse(Respuesta("""
            <datosGenerales>
              <apellido>INTENTAR</apellido>
              <domicilioFiscal>
                <codPostal>5881</codPostal>
                <descripcionProvincia>SAN LUIS</descripcionProvincia>
                <direccion>AV LOS INCAS 4137</direccion>
                <idProvincia>11</idProvincia>
                <localidad>MERLO</localidad>
                <tipoDomicilio>FISCAL</tipoDomicilio>
              </domicilioFiscal>
              <esSucesion>NO</esSucesion>
              <estadoClave>ACTIVO</estadoClave>
              <idPersona>27015942210</idPersona>
              <mesCierre>12</mesCierre>
              <nombre>JAZMIN</nombre>
              <tipoClave>CUIT</tipoClave>
              <tipoPersona>FISICA</tipoPersona>
            </datosGenerales>
            <datosMonotributo>
              <actividadMonotributista>
                <descripcionActividad>PREST. DE SERVICIO O LOCACIÓN</descripcionActividad>
                <idActividad>8</idActividad>
                <nomenclador>1</nomenclador>
                <orden>0</orden>
                <periodo>201803</periodo>
              </actividadMonotributista>
              <categoriaMonotributo>
                <descripcionCategoria>B LOCACIONES DE SERVICIO</descripcionCategoria>
                <idCategoria>36</idCategoria>
                <idImpuesto>20</idImpuesto>
                <periodo>201804</periodo>
              </categoriaMonotributo>
              <impuesto>
                <descripcionImpuesto>MONOTRIBUTO</descripcionImpuesto>
                <estadoImpuesto>AC</estadoImpuesto>
                <idImpuesto>20</idImpuesto>
                <motivo>Recategorización</motivo>
                <periodo>201803</periodo>
              </impuesto>
            </datosMonotributo>
            <datosRegimenGeneral>
              <actividad>
                <descripcionActividad>SERVICIOS DE ALOJAMIENTO EN HOTELES, HOSTERÍAS Y RESIDENCIALES SIMILARES, EXCEPTO POR HORA, QUE NO INCLUYEN SERVICIO DE RESTAURANTE AL PÚBLICO</descripcionActividad>
                <idActividad>551023</idActividad>
                <nomenclador>883</nomenclador>
                <orden>1</orden>
                <periodo>201311</periodo>
              </actividad>
              <impuesto>
                <descripcionImpuesto>EMPLEADOR-APORTES SEG. SOCIAL</descripcionImpuesto>
                <estadoImpuesto>AC</estadoImpuesto>
                <idImpuesto>301</idImpuesto>
                <motivo>Inscripción tramitada en agencia</motivo>
                <periodo>200004</periodo>
              </impuesto>
            </datosRegimenGeneral>
            """), 27015942210);

        Assert.Equal("INTENTAR, JAZMIN", r.Value.Name);
        Assert.Equal(CondicionIvaReceptor.Monotributo, r.Value.Condicion);
        Assert.Equal("AV LOS INCAS 4137, MERLO, SAN LUIS", r.Value.Address);
    }

    [Fact]
    public void Ejemplo_del_manual_CUIT_inexistente_en_errorConstancia()
    {
        // §3.3.3, la tercera persona: un CUIT que no existe vuelve como
        // errorConstancia con su idPersona. (En getPersona_v2 suele venir como
        // SOAP Fault; ese caso lo cubre el cliente.)
        var r = ConstanciaInscripcionResponse.Parse(Respuesta("""
            <errorConstancia>
              <error>No existe persona con ese Id</error>
              <idPersona>12345678901</idPersona>
            </errorConstancia>
            """), 12345678901);

        Assert.Equal("Padron.NotFound", r.Error.Code);
        Assert.Equal("ARCA: No existe persona con ese Id", r.Error.Message);
    }

    [Fact]
    public void Sin_los_datos_del_regimen_general_por_un_error_no_se_adivina_consumidor_final()
    {
        // errorRegimenGeneral: ARCA no manda esa parte de la constancia (el
        // mensaje fijo es el del manual, §4.2). Que no figure el IVA no quiere
        // decir que no lo tenga.
        var r = ConstanciaInscripcionResponse.Parse(Respuesta("""
            <datosGenerales><apellido>RUIZ</apellido><nombre>EVA</nombre><tipoPersona>FISICA</tipoPersona></datosGenerales>
            <errorRegimenGeneral>
              <error>Domicilio Incompleto</error>
              <mensaje>No cumple con las condiciones para enviar datos del regimen general</mensaje>
            </errorRegimenGeneral>
            """), 27123456784);

        Assert.True(r.IsFailure);
        Assert.Equal("Padron.NoCondition", r.Error.Code);
        Assert.Contains("Domicilio Incompleto", r.Error.Message);
        Assert.Contains("Elegila a mano", r.Error.Message);
    }

    [Fact]
    public void Un_error_de_constancia_junto_con_los_datos_no_tapa_la_condicion()
    {
        // errorConstancia junto con los datos (algo observado en la
        // constancia): la condición se lee igual, y el nombre que trae el
        // bloque de error no se confunde con el de la persona.
        var r = ConstanciaInscripcionResponse.Parse(Respuesta("""
            <datosGenerales><apellido>SOSA</apellido><nombre>ARIEL</nombre><tipoPersona>FISICA</tipoPersona></datosGenerales>
            <datosRegimenGeneral>
              <impuesto><descripcionImpuesto>IVA</descripcionImpuesto><estadoImpuesto>AC</estadoImpuesto><idImpuesto>30</idImpuesto></impuesto>
            </datosRegimenGeneral>
            <errorConstancia><apellido>OTRO</apellido><error>No tiene dependencia informada</error><nombre>NOMBRE</nombre></errorConstancia>
            """), 20123456786);

        Assert.Equal("SOSA, ARIEL", r.Value.Name);
        Assert.Equal(CondicionIvaReceptor.ResponsableInscripto, r.Value.Condicion);
    }
}
