________________




title: "Arranque — Fase 0/1/2 previa al entregable" status: draft last_reviewed: 2026-07-27 sources:


* https://www.afip.gob.ar/ws/
* https://www.afip.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf
* https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf depends_on: []


________________


Arranque — qué encontré antes de escribir una sola línea del entregable
Este documento es el checkpoint que pediste: inventario, hallazgos, decisiones propuestas y ambigüedades de negocio. No es el entregable. El entregable se escribe recién cuando confirmes.


________________


0. Dos avisos de honestidad antes de empezar
0.1 Los ZIP de cadenas de certificación no llegaron
El mensaje menciona los adjuntos Cadena_de_certificacion_homo_2022_2034.zip y Cadena_de_certificacion_prod_2024_2035.zip, pero al workspace sólo llegó el texto del prompt. No es bloqueante: tu propio análisis (subjects, issuers, vigencias, fingerprint SHA-256 del intermedio productivo, y las dos trampas DER/CR) es suficiente para escribir anexos/certificados/ y el apartado de troubleshooting citándote a vos como fuente.


Lo que no voy a poder hacer sin los archivos es reproducir los openssl x509 reales para verificar fingerprints. Van a quedar marcados como [VERIFICAR — dato provisto por el equipo, no recomputado]. Si querés cerrarlos, resubí los ZIP y los recalculo.


Las URLs de descarga sí quedaron verificadas:


Archivo
	URL
	Cadena producción 2024-2035
	https://www.afip.gob.ar/ws/documentacion/certificados/Cadena_de_certificacion_prod_2024_2035.zip
	Cadena homologación 2022-2034
	https://www.afip.gob.ar/ws/documentacion/certificados/Cadena_de_certificacion_homo_2022_2034.zip
	0.2 Límite real de la herramienta de fetch
Los PDF se leyeron a través de un conversor a texto, no descargándolos a disco. Consecuencias concretas, sin maquillaje:


* Sirve para secciones narrativas, definiciones de campo, validaciones y endpoints: la extracción es fiel y verificable con relecturas cruzadas.
* Falla en tablas largas del final del PDF (páginas ~150-195). En una prueba, al pedirle la tabla de tipos de comprobante el extractor inventó filas (34 = Factura A Electrónica, 88, 990/993/994/995). Se descartaron todas. Ninguna fila alucinada quedó en el material.
* afip.gob.ar además aplicó rate-limit (ROBOTS_DISALLOWED) tras ~6 descargas seguidas, y cuatro páginas .asp (arquitectura-general, certificados, programadores/certificados-digitales, autoridades-certificantes) quedaron inaccesibles por robots.txt.


Implicancia de diseño, no sólo de documentación: las tablas paramétricas no se transcriben a mano, se leen del propio WS. El manual lo recomienda explícitamente. El entregable va a incluir las tablas que sí pude confirmar por doble fuente, y para el resto va a especificar el job de sincronización FEParamGet* → PostgreSQL como la fuente de verdad. Eso convierte un límite de investigación en la decisión de arquitectura correcta de todos modos.


________________


1. Fase 0 — Inventario de URLs
Inventario completo (75 URLs, con estado y relevancia) en anexos/fuentes-consultadas.md del entregable. Acá va el extracto de alta relevancia.
1.1 Portal y documentación
URL
	Qué contiene
	Relev.
	Estado
	https://www.afip.gob.ar/ws/
	Índice del portal de programadores
	Alta
	Verificada
	https://www.afip.gob.ar/ws/documentacion/wsaa.asp
	Única página que publica endpoints reales
	Alta
	Verificada
	https://www.afip.gob.ar/ws/documentacion/catalogo.asp
	Catálogo de WSN
	Alta
	Verificada
	https://www.afip.gob.ar/ws/documentacion/cronograma-TLS.asp
	Estado TLS por host (sin fechas)
	Alta
	Verificada
	https://www.afip.gob.ar/ws/documentacion/homologacion-externa.asp
	Índice de manuales vigentes
	Alta
	Verificada
	https://www.afip.gob.ar/ws/programadores/entornos-disponibles.asp
	No publica un solo hostname
	Baja
	Verificada
	https://www.afip.gob.ar/ws/documentacion/servicios-migrados.asp
	Servicios migrados de plataforma
	Media
	Verificada
	https://www.afip.gob.ar/ws/documentacion/arquitectura-general.asp
	TA 12 h, CMS, X.509
	Alta
	Bloqueada por robots
	https://www.afip.gob.ar/ws/documentacion/autoridades-certificantes.asp
	Cadena de CAs
	Alta
	Bloqueada por robots
	1.2 Manuales (fuente de verdad)
URL
	Documento
	Versión hallada
	Relev.
	.../fe/ayuda/documentos/wsfev1-RG-4291.pdf
	WSFEv1 — manual del desarrollador
	v4.3 · 01/06/2026
	Alta
	.../ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf
	Mismo manual, copia del árbol /ws/
	v4.2 · 01/02/2026
	Alta
	.../ws/WSAA/WSAAmanualDev.pdf
	WSAA — manual del desarrollador
	—
	Alta
	.../ws/WSAA/Especificacion_Tecnica_WSAA_1.2.2.pdf
	Contrato TRA/CMS + catálogo de errores
	1.2.2
	Alta
	.../ws/WSAA/WSAA.ObtenerCertificado.pdf
	Obtención de certificado
	—
	Alta
	.../ws/WSASS/WSASS_como_adherirse.pdf
	Adhesión a WSASS (homologación)
	—
	Alta
	.../ws/WSASS/WSASS_manual.pdf
	Manual de usuario WSASS
	—
	Alta
	.../ws/WSAA/wsaa_asociar_certificado_a_wsn_produccion.pdf
	Asociación de certificado en producción
	—
	Alta
	.../fe/documentos/AccionesarealizarparaconsumirunWebservicedeFacturaElectr.pdf
	Los 7 pasos oficiales
	—
	Alta
	.../ws/documentacion/manuales/Web-Service-MTXCA-v25.pdf
	wsmtxca
	0.25.6
	Media
	.../ws/documentacion/manuales/WSFEX-Manualparaeldesarrollador_V3.1.1_ARCA.pdf
	wsfexv1 (exportación)
	3.1.1
	Media
	.../ws/WSCDCV1/WSCDC-manual-desarrollador-v4.pdf
	Constatación de comprobantes
	v4
	Media
	.../ws/WSCI/manual_ws_sr_ws_constancia_inscripcion.pdf
	Constancia de inscripción
	v4.1
	Media
	.../ws/WSAA/ejemplos/dev-wsaa-cliente-dotnet-cs.zip
	Cliente WSAA oficial en C#
	—
	Alta
	

Discrepancia de versión que hay que zanjar: tu prompt dice V. 4.5; el PDF del árbol /ws/ dice 4.2 (01-02-2026) y el PDF de /fe/ayuda/ dice 4.3 (01-06-2026). La cadena "4.5" no aparece en ninguno de los dos. Voy a tomar /fe/ayuda/documentos/wsfev1-RG-4291.pdf v4.3 como canónico (es el más nuevo) y a dejar la discrepancia asentada en el doc. Si tenés un v4.5 en la mano, pasámelo y lo uso.
1.3 Endpoints verificados
Servicio
	Entorno
	Endpoint
	WSAA
	Homologación
	https://wsaahomo.afip.gov.ar/ws/services/LoginCms
	WSAA
	Producción
	https://wsaa.afip.gov.ar/ws/services/LoginCms
	WSFEv1
	Homologación
	https://wswhomo.afip.gov.ar/wsfev1/service.asmx
	WSFEv1
	Producción
	https://servicios1.afip.gov.ar/wsfev1/service.asmx
	

Confirmado en el manual (p. 20) y empíricamente. service para el TRA: wsfe. Namespace: http://ar.gov.afip.dif.FEV1/.


________________


2. Hallazgos que cambian el diseño
Estos son los que importan. Cada uno viene con la consecuencia de arquitectura, no sólo el dato.
H1 — Los endpoints son .gov.ar y el certificado TLS no cubre .gob.ar
servicios1.afip.gob.ar devuelve CERTIFICATE_VERIFY_FAILED: Hostname mismatch. Pero la paridad no es uniforme: wsaahomo responde en ambos dominios. Nunca derivar un host sustituyendo el dominio. Cada endpoint va explícito en configuración, por entorno.
H2 — El host productivo de facturación negocia con parámetros DH débiles
https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL devolvió [SSL: DH_KEY_TOO_SMALL] desde este entorno. Homologación (wswhomo) no tiene el problema.


Esto es exactamente el escenario "anda en homologación, revienta en producción", y en .NET sobre Linux aparece como AuthenticationException en el handshake, con un mensaje que no dice nada útil. Mitigación a documentar: forzar suites ECDHE en SocketsHttpHandler (SslClientAuthenticationOptions.CipherSuitesPolicy, que en Linux mapea a OpenSSL) y/o ajustar el SECLEVEL de OpenSSL en la imagen Docker. Y probar el handshake productivo el día 1, no el día del go-live.


[VERIFICAR] — observado desde este contenedor. Puede haber intermediado un proxy. Hay que reproducirlo desde la infra real antes de tomarlo como verdad. El diagnóstico exacto (openssl s_client -connect servicios1.afip.gov.ar:443) va al doc de troubleshooting.
H3 — El cronograma TLS no publica fechas ni cipher suites
Sólo listas de "migrado / pendiente". Y servicios1, serviciosjava y wsw — los tres hosts productivos de FE — figuran como PENDIENTES de migrar a TLS 1.2, mientras sus pares de homologación ya están migrados. No se puede planificar contra esa fuente: hace falta un check de handshake activo como métrica de observabilidad, no una fecha en un calendario.
H4 — El caché del TA no es una optimización: es un requisito de disponibilidad
Confirmado en fuente oficial, con texto literal:


coe.alreadyAuthenticated — "El CEE ha solicitado un ticket de acceso para el cual ya dispone de TA validos. No deberá solicitar nuevos TA mientras disponga de TA validos para ese WSN correspondiente." Fuente: Especificación Técnica WSAA v1.2.2


Y el lapso preventivo, literal y en mayúsculas en el original:


"ACTUALMENTE ESE LAPSO PREVENTIVO ES DE 10 MINUTOS EN EL WSAA DE TESTING Y 2 MINUTOS EN EL WSAA DE PRODUCCION." Fuente: Manual del Desarrollador WSAA §10.6, p. 28


Consecuencia dura: si perdés el TA cacheado, ARCA no te da otro hasta que el anterior venza. Vigencia del TA: 12 horas. Es decir, perder el caché = quedarte sin facturar hasta 12 horas. Por lo tanto el TA no puede vivir sólo en Redis. Va persistido en PostgreSQL (cifrado) y Redis se usa únicamente como caché caliente y como lock distribuido. Esto invierte la intuición habitual y es el punto donde más se equivocan las integraciones.
H5 — La tolerancia de reloj es ±24 h, no ±5 minutos
No existe la tolerancia chica que suele asumirse. Los errores reales son:


Código
	Mensaje literal
	xml.generationTime.invalid
	"El tiempo de generación es posterior a la hora actual o posee más de 24 horas de antigüedad"
	xml.expirationTime.expired
	"El tiempo de expiración es inferior a la hora actual"
	xml.expirationTime.invalid
	"El tiempo de expiración del documento es superior a 24 horas"
	

Recomendación oficial: NTP contra time.afip.gov.ar. uniqueId es xsd:unsignedInt (0..4294967295) — ojo con usar epoch en segundos, que desborda; el patrón habitual es epoch truncado, y hay que documentar la estrategia de rollover.
H6 — CondicionIVAReceptorId ya es obligatorio (desde el 01/06/2026)
Texto literal de la fila 4.3 del historial de revisiones del manual:


"Será obligatorio el campo Condición Frente al IVA del receptor, atento a la entrada en vigencia reglamentada por la Resolución General N°5616. Por tal motivo los códigos de error 10245 para CAE y 825 para CAEA quedaran en desuso." Fuente: Manual WSFEv1 v4.3, historial de revisiones — https://www.afip.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf


Esto cierra una ambigüedad que había quedado abierta en la investigación de normativa (una fuente secundaria hablaba de una prórroga al 31/08/2026). La fuente oficial manda: rige desde el 01/06/2026, o sea que hoy ya está vigente. El módulo nace con el campo obligatorio, sin feature flag de transición.


Tabla de valores confirmada, 11 filas con su cmp_clase: clases A/M → 1, 6, 13, 16; clase B → 4, 5, 7, 8, 9, 10, 15; clase C → todas.
H7 — La clase M dejó de existir
RG 5.764/2025: los códigos 51/52/53 quedan fuera de uso desde el 01/12/2025, y el manual v4.1 documenta el reemplazo. No modelar clase M como caso vivo; va al doc de fuera-de-alcance con la cita.
H8 — CAEA cambia de naturaleza el 01/08/2026 (dentro de 5 días)
RG 5.782 + RG 5.785 lo convierten en régimen de contingencia excepcional; desde el 01/06/2026 ya no se tramitan adhesiones como modalidad principal. Recomendación: CAE online como camino único, CAEA documentado pero fuera del alcance del MVP. Esto simplifica muchísimo el dominio.


[VERIFICAR] — fecha y números de RG provienen de fuentes oficiales secundarias (Boletín Oficial / argentina.gob.ar), no del manual. Vale la pena reconfirmarlo antes de descartar CAEA definitivamente, porque si un tenant ya está adherido, hereda obligaciones de rendición.
H9 — El límite de comprobantes por request no es 250: es dinámico
Texto literal de la validación 10003:


"La cantidad de registros en detalle debe ser menor igual al valor permitido. Consulte método FECompTotXRequest para obtener cantidad máxima de registros por cada requerimiento. Para comprobantes del tipo MiPyMEs (FCE), la cantidad habilitada es 1 comprobante por request"


El manual no fija un número general. El "250" que circula en blogs y librerías no está escrito. Diseño: leer FECompTotXRequest → RegXReq al arranque y cachearlo. Y el lote es homogéneo: un solo PtoVta y un solo CbteTipo por request.
H10 — La tolerancia de redondeo escala con la cantidad de ítems
"Error relativo porcentual <= 0.01% o el error absoluto <= 0.01 × cantidad de alícuotas de IVA ingresadas" — validaciones 10023 (IVA) y 10029 (Tributos)


Un validador propio con epsilon fijo de 0.01 es más estricto que ARCA y va a rechazar comprobantes que ARCA aceptaría. Hay que implementar la regla tal cual, con los dos términos y el OR.


Y la ecuación general, en el orden literal del manual:


"Debe ser igual a Importe neto no gravado + Importe exento + Importe neto gravado + todos los campos de IVA al XX% + Importe de tributos."


ImpTotal = ImpTotConc + ImpOpEx + ImpNeto + ImpIVA + ImpTrib


[VERIFICAR] — el código de error de la ecuación general de ImpTotal no se pudo determinar: cinco lecturas dieron cinco respuestas distintas. Sí quedó confirmado que 10043=ImpTotConc, 10044=ImpNeto, 10045=ImpOpEx, y que 10046/10047 no existen. Se resuelve en la primera prueba contra homologación mandando un total deliberadamente mal.
H11 — Plazos de emisión, tabla real
Caso
	Rango de CbteFch (N = fecha de envío)
	Concepto 1 — Productos
	N-5 … N+5, "no podrá exceder el mes de presentación"
	Concepto 2 y 3 — Servicios
	N-10 … N+10
	MiPyMEs (FCE) Factura
	N-5 … N+1
	Notas de débito/crédito
	hasta N-5, y ≥ fecha del comprobante asociado
	Sin informar
	"se asignará la fecha de proceso"
	

Además CbteFch debe ser ≥ a la del último comprobante emitido para ese tipo y punto de venta. Esto último es una restricción de orden temporal que interactúa con la numeración correlativa y hay que respetarla en la cola de emisión: si el outbox reordena, se rompe.
H12 — El umbral de consumidor final se compara contra el promedio unitario
"Para comprobantes tipo B en pedidos múltiples (CbteDesde distinto a CbteHasta) y el resultado de la operación ImpTotal / (CbteHasta – CbteDesde + 1) < monto en pesos resultante según RG4444, el campo DocTipo deberá ser igual a 99, el campo DocNro deberá ser cero (0)."


Un lote de 100 facturas de $5.000 se evalúa a $5.000, no a $500.000. Y el manual no contiene ningún monto: remite a la RG. Valor vigente hallado: $10.000.000 (RG 5.700/2025, ratificado por RG 5.866/2026), con la distinción por medio de pago eliminada. Va como configuración editable, jamás como constante de código.


[VERIFICAR] — el umbral realmente cableado en el WS. Se prueba contra homologación.
H13 — Obs no es error
Resultado = 'A' con observaciones es un CAE válido. Modelarlos como canales separados (Errors vs Observaciones). Tratar una Obs como error y reintentar es el bug clásico que duplica comprobantes.
H14 — La regla de oro de los reintentos
Ante timeout o 5xx, nunca reenviar directo. Primero FECompUltimoAutorizado. Si el envío se autorizó y no viste la respuesta: reenviar con el mismo número da error, y reenviar con el siguiente duplica el comprobante. Este es el punto más peligroso de toda la integración y tiene doc propio (11-numeracion-y-concurrencia.md + adr/0004).
H15 — Otros que corrigen supuestos habituales
* CanMisMonExt = "S" exime de informar MonCotiz (validación 10038, novedad v4.0). Cambia el modelo de datos de moneda extranjera.
* Las tres fechas de servicio son un grupo atómico (10031+10033+10035): las tres o ninguna.
* Clase C (monotributo): ImpTotal = ImpNeto + ImpTrib, donde ImpNeto es subtotal, no neto gravado; ImpIVA/ImpTotConc/ImpOpEx en 0 y el array Iva no se envía (error 10071). El Id=3 (0%) es para A/B gravadas al 0%, no para C.
* ws_sr_padron_a5 está deprecado, reemplazado por ws_sr_constancia_inscripcion (v4.1). Diseñar contra el nuevo.
* El WS no valida que una NC no supere la factura asociada en comprobantes comunes (sí en FCE, error 10184). Esa regla la implementa el módulo.
* QR: moneda usa el código ARCA "PES", no "ARS", y fecha va en YYYY-MM-DD (distinto del AAAAMMDD de WSFEv1). Es un pisón de cabeza clásico.
* RG 5.614/2024 (Transparencia Fiscal): el WS no recibe ni valida nada de esto — es puramente render del PDF ("IVA Contenido", "Otros Impuestos Nacionales Indirectos"). Obligatorio desde 01/04/2025.
* Desde el 01/07/2026 la fecha del comprobante se dispara con la entrega o puesta a disposición del bien, lo que ocurra antes — no con el pago. Impacta directo el trigger de emisión en el checkout.


________________


3. La pregunta sobre e-commerce propio: respondida
No. ARCA no publica documentación, guías ni requisitos específicos para plataformas de e-commerce de desarrollo propio, ni diferenciados por plataforma. Su documentación para integradores es agnóstica del canal de venta y del software.


Evidencia:


1. No existe "software habilitado". El documento oficial que enumera los pasos para consumir un WS de factura electrónica lista 7 pasos y ninguno es registro, certificación ni auditoría. Alcanza con certificado + servicio delegado. (.../fe/documentos/AccionesarealizarparaconsumirunWebservicedeFacturaElectr.pdf)
2. La única homologación real de ARCA es la de controladores fiscales — equipamiento, con Registro de Empresas Proveedoras. Régimen distinto; no aplica a integración por WS. Es la confusión más frecuente.
3. "Homologación" en el portal /ws/ designa el ambiente de testing, no un acto de certificación (WSASS = "Autoservicio de Acceso a APIs de Homologación").
4. El eje regulatorio de ARCA no es "vender por internet" sino "intermediar operaciones de terceros". Todo el micrositio de Economía Digital regula plataformas, agregadores y billeteras — no al comerciante final. Una tienda propia es, para ARCA, un vendedor común.
5. Toda la guía "cómo facturo mis ventas de Tiendanube/Shopify/WooCommerce" es de terceros, sin equivalente en afip.gob.ar.


Qué sí cambia según el canal y el perfil (esto va desarrollado con tabla en 01-panorama-normativo.md): controlador fiscal vs. WS (la RG 3.561 está anclada a un "local de ventas" físico, art. 7); régimen del emisor (RI→A/B, Monotributo→C, exportación→E); clase de comprobante habilitada; obligación de identificar al receptor por umbral; FCE MiPyME en B2B; y regímenes de información que aplican a intermediarios, no a quien vende por cuenta propia.


Correcciones a creencias muy extendidas, con norma:


* No existe regla que obligue a identificar al comprador por operación no presencial, envío a domicilio o pago electrónico. Rige umbral único, neutro respecto del canal. La RG 4.444/2019 sí distinguía por medio de pago, pero en sentido inverso, y fue eliminada.
* Las retenciones nacionales de IVA/Ganancias sobre cobros electrónicos están derogadas (RG 5.554/2024, desde 01/09/2024). Subsisten regímenes provinciales tipo SIRTAC, ajenos a ARCA.


[VERIFICAR] — dos conclusiones son derivadas, no literales: (a) la no aplicación de la RG 5.319 a tienda propia surge de la definición de sujeto obligado, no de un carve-out expreso; (b) la exención de controlador fiscal para ventas online surge de las definiciones de local físico + art. 7, no de una norma que diga "ventas no presenciales". Ambas quedan marcadas como tales en el entregable. Además, homologacion-externa.asp no se pudo recuperar textualmente tras ~28 intentos; la conclusión es sólida por convergencia pero falta la cita literal.


________________


4. Decisiones de diseño propuestas
Formato: opción A / opción B / recomendación y por qué. Cada una se convierte en un ADR.
D1 — Síncrono en el checkout vs. outbox asíncrono → outbox (adr/0004)


	A: síncrono en el checkout
	B: outbox + worker
	Latencia percibida
	Checkout atado a ARCA (segundos, a veces decenas)
	Checkout responde ya
	Ventanas de mantenimiento de ARCA
	Rompe la venta
	Absorbe
	Complejidad
	Baja
	Media (worker, estados, UI de pendiente)
	Riesgo de duplicado
	Alto en timeout
	Controlado con idempotencia + reconciliación
	

Recomiendo B. ARCA se cae, tiene ventanas y latencias de varios segundos. No se puede colgar el checkout de eso, y el comprobante no es condición de la venta. El costo real es de UX: hay que mostrar honestamente "CAE pendiente" sin mentir, y tener un SLA interno de emisión. Cambiaría a A sólo si aparece un requisito legal o comercial de entregar el comprobante en el mismo response —no lo veo.
D2 — Estrategia de numeración → secuencia local con lock + reconciliación (adr/0003)


	A: FECompUltimoAutorizado + 1 en cada emisión
	B: reservar número antes de llamar
	C: secuencia local persistida con lock
	Carreras
	Alta (dos workers leen lo mismo)
	—
	Resuelta por lock
	Huecos
	No genera
	Genera si falla
	Genera si falla, pero se detecta
	Llamadas a ARCA
	+1 por emisión
	0
	0
	Recuperación
	Auto
	Manual
	Job de reconciliación
	

Recomiendo C, con SELECT ... FOR UPDATE sobre la fila de serie (o advisory lock de PostgreSQL por (tenant, ptoVta, cbteTipo)), unique constraint en la base, y job periódico de reconciliación contra FECompUltimoAutorizado. A parece más simple pero mete una llamada de red en el camino crítico y no resuelve la carrera — dos réplicas obtienen el mismo número. El doc 11-numeracion-y-concurrencia.md va a incluir qué hacer con un hueco ya producido (no se "rellena": se documenta y se justifica ante fiscalización).
D3 — Dónde vive el TA cacheado → PostgreSQL como store durable + Redis como caché/lock (adr/0002)
Derivado de H4. Si el TA vive sólo en Redis y Redis se reinicia, quedás sin poder facturar hasta 12 horas (ARCA no emite otro TA mientras el anterior siga vigente). Entonces:


* Store durable: tabla fiscal_access_tokens en PostgreSQL, campo sign/token cifrados, clave (tenant_id, cuit, service, environment).
* Caché caliente: Redis, TTL = expirationTime − margen (propongo margen de 10 min).
* Lock distribuido: Redis (SET NX PX) para evitar thundering herd en arranque en frío con N réplicas. Si Redis está caído, se degrada a lock pesimista en PostgreSQL — no a "cada réplica pide su TA", que es justamente lo que dispara coe.alreadyAuthenticated.


Alternativa A (sólo Redis con persistencia AOF): más simple, pero apuesta la disponibilidad de facturación a la durabilidad de Redis. No vale la pena el ahorro.
D4 — Tablas paramétricas → sincronizadas desde FEParamGet*, no hardcodeadas
Recomiendo tabla en PostgreSQL + job de refresh (diario) + caché en memoria. Seed inicial con las tablas que sí pude confirmar por doble fuente, marcado como seed y no como verdad. Esto neutraliza de un saque la mayoría de los [VERIFICAR] de tablas, y es lo que el propio manual recomienda. Hardcodear enums en C# para las pocas tablas que son realmente estables (TiposConcepto = 3 filas, Resultado = A/R/P) y lookup table para el resto.
D5 — Custodia del certificado por tenant → envelope encryption con KMS (adr/0005)


	A: .p12 cifrado en la DB (envelope encryption + KMS)
	B: HashiCorp Vault
	C: archivo en volumen
	Operación
	Baja
	Alta (infra nueva)
	Baja
	Rotación de clave
	Sí
	Sí
	No
	Auditoría de acceso
	Media
	Alta
	Nula
	Encaja con el stack actual
	Sí
	Requiere decisión de infra
	—
	

Recomiendo A para el MVP: DEK por tenant, cifrada con una KEK en KMS/SOPS, blob del .p12 en PostgreSQL (no en S3 — no querés un certificado con URL firmada dando vueltas). Migración a Vault si aparece un requisito de compliance que lo pida. C queda descartada, punto.
D6 — Cliente SOAP en .NET → cliente generado, envuelto en adapter


	A: dotnet-svcutil sobre el WSDL
	B: HttpClient + XML a mano
	Fidelidad al contrato
	Alta
	Depende de vos
	Control del wire
	Bajo
	Total
	Mantenimiento ante cambio de WSDL
	Regenerar
	Manual
	

Recomiendo A para WSFEv1 y B para WSAA. WSFEv1 es un .asmx con WSDL sano: generar el cliente y envolverlo tras IFiscalAuthorityGateway. WSAA, en cambio, es una sola operación (loginCms, parámetro in0, SOAPAction urn:LoginCms) donde lo difícil no es el SOAP sino el CMS — un HttpClient + un XML armado a mano es más legible y más testeable que un proxy generado. Y en ambos casos: SocketsHttpHandler configurado explícitamente (H2/H3), con X509Certificate2 del tenant y timeouts por operación.
D7 — WSFEv1 vs wsmtxca → WSFEv1 (adr/0001)
wsmtxca exige detalle de ítems en el comprobante. Para e-commerce genérico eso significa mapear el catálogo entero a unidades de medida de ARCA y cargar con esa validación en cada venta, a cambio de un beneficio que hoy no necesitás. WSFEv1, y IFiscalAuthorityGateway deja la puerta abierta a un ArcaWsmtxcaGateway si mañana un tenant lo pide.
D8 — Alcance de CAEA → fuera del MVP, documentado
Derivado de H8. Va a 18-roadmap-y-fuera-de-alcance.md con la cita normativa y el diseño esbozado, para que agregarlo después no sea refactor.
D9 — Abstracción de autoridad fiscal
Los puertos que propusiste están bien y los adopto tal cual (IFiscalAuthorityGateway, IFiscalAuthorityAuthenticator, IFiscalParameterCatalog, IFiscalCertificateStore, IInvoiceNumberAllocator, IFiscalDocumentRenderer). Una sola observación de diseño que quiero dejar asentada en adr/0006: IFiscalAuthorityGateway no debe exponer tipos de ARCA. Si el puerto devuelve un CAE con CAEFchVto, ya filtró ARCA al dominio. El puerto devuelve un FiscalAuthorizationResult con AuthorizationCode + ExpiresOn + Observations, y el mapeo a CAE vive en el adapter. Es la diferencia entre una abstracción real y un interface decorativo.


________________


5. Ambigüedades de negocio que necesito que resuelvas
Las cuatro más bloqueantes van en las preguntas del chat. Estas son las demás, respondelas en texto libre si querés que las cierre:


1. Puntos de venta: ¿un PdV por tienda, o varios por tienda (por ejemplo uno por canal: web, MercadoLibre, mostrador)? Impacta el modelo de datos y la UI de configuración.
2. Facturación de envíos: ¿el costo de envío se factura como ítem gravado al 21%, o hay tenants con tratamiento distinto? El WSFEv1 no lleva ítems, pero sí lleva la composición de alícuotas, y el PDF sí lleva el detalle.
3. Ventas en cuotas / financiación: ¿el interés se factura en el mismo comprobante (otra alícuota), en uno separado, o no se factura porque lo cobra la pasarela? Toca el punto de contacto con Mercado Pago / Payway / Mobbex.
4. Retenciones y percepciones provinciales (IIBB, SIRTAC): ¿el módulo las tiene que reflejar en Tributos, o eso queda fuera del alcance fiscal nacional?
5. Retención de auditoría: ¿cuántos años guardamos request/response crudos? Propongo 10 años (prescripción ampliada) con archivado a almacenamiento frío después de 2. Confirmame.
6. Anulación vs. nota de crédito: cuando una orden se cancela antes de despacharse, ¿se emite NC igual o se evita emitir la factura? Depende de D-trigger (pregunta 3 del chat).


________________


6. Qué queda flojo, dicho ahora y no al final
Ítem
	Estado
	Cómo se cierra
	Tabla TiposCbte completa con FchDesde/FchHasta
	39 filas sin fechas; ~10 Id faltantes
	Llamada a FEParamGetTiposCbte en homologación
	TiposPaises
	6 de ~197
	FEParamGetTiposPaises
	Errores 10152–10249
	No obtenidos (7 intentos, rate-limit)
	Reintentar el PDF, o capturar en homologación
	Código de error de la ecuación ImpTotal
	Contradictorio
	Prueba deliberada contra homologación
	Fingerprints de las cadenas de certificación
	Provistos por vos, no recomputados
	Resubir los ZIP
	homologacion-externa.asp (texto literal)
	Inaccesible
	Abrir a mano en navegador
	autoridades-certificantes.asp (nombres de CAs)
	Bloqueada por robots
	Ídem
	Vigencia en años del certificado emitido
	No está escrita en ningún documento oficial
	Observación empírica al emitir el primero
	Umbral real cableado en el WS para DocTipo=99
	Norma dice $10.000.000; manual viejo decía $1.000
	Prueba contra homologación
	DH_KEY_TOO_SMALL en servicios1
	Observado desde este entorno
	Reproducir desde infra propia
	

Ninguno de estos bloquea escribir el entregable. Todos se cierran con una tarde contra homologación, y por eso 15-testing-strategy.md va a arrancar con un script de descubrimiento: un test de integración que llama a todos los FEParamGet* y persiste las respuestas como fixtures. Ese script es, de hecho, el primer entregable de código que le voy a pedir a Claude Code.


________________


7. Qué pasa cuando confirmes
Escribo los 35 archivos de la estructura pedida. Estimación honesta: es mucho volumen, así que lo voy a entregar por tandas y te voy mandando los archivos a medida que salen, empezando por README.md + 00–06 (la parte de referencia, que es la que más depende de la investigación ya hecha), después 07–13 (diseño), después 14–18 + ADRs, y al final los prompts y anexos.