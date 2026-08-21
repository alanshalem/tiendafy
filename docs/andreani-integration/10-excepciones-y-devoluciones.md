# 10 — Excepciones y logística inversa

Responde las preguntas 24, 25 y 26 del checklist.

> **Resumen brutal:** de las tres preguntas de este bloque, **ninguna tiene endpoint documentado**. Devoluciones, gestión de excepciones y reclamos son, hasta donde muestra la documentación pública, **procesos manuales fuera de la API**. Este documento describe cómo convivir con eso.

## 10.1 Devoluciones y logística inversa

### Estado de la documentación

⛔ **GAP-05 — No hay API de devoluciones.**

Evidencia:
- 🟢 El body de `POST /ordenes-de-envio` tiene `tipoServicio` ("Domicilio / Sucursal") y `pagoDestino` ("Porte = 1, Debido = 2"). **Ningún campo, valor ni objeto para devolución, logística inversa o canje.**
- 🟢 Las 25 secciones de la documentación no incluyen ningún endpoint de retorno.
- 🟢 Andreani **sí ofrece logística inversa como servicio comercial**. No es que no exista el servicio: no está expuesto en la API pública.

### La hipótesis más razonable

🔵 **INFERENCIA, no confirmada:** una devolución se instrumenta como **una orden de envío normal con origen y destino invertidos, bajo un contrato distinto** (un contrato de logística inversa).

Encaja con el modelo general de Andreani, donde el producto está codificado en el contrato y no en un campo del request (ver `03` §3.1). Y encaja con `productoARetirar`, un campo que existe en el body y que solo tiene sentido en un flujo de retiro.

**Hay que confirmarlo.** Si es así, el soporte de devoluciones en Tiendafy es casi gratis: mismo endpoint, mismo DTO, otro contrato y los objetos `origen`/`destino` invertidos.

### Diseño en Tiendafy

Modelar la devolución como un `Shipment` propio, vinculado al original:

```
Shipment (original)
   └── related_shipment_id → Shipment (devolución)
       relationship = 'RETURN'
```

**No** reutilizar el shipment original cambiándole el estado. Son dos envíos, con dos números de seguimiento, dos etiquetas y dos costos. Mezclarlos hace imposible la conciliación.

Estados de la devolución: la misma máquina que un envío normal, con el `origen` siendo el comprador y el `destino` el comercio.

**Etiqueta de retorno:** el comprador necesita imprimirla o recibirla. Como no hay API de devoluciones confirmada, en Fase 1 el flujo del panel admin debe ser: el operador genera el envío de retorno manualmente (creando una orden con origen/destino invertidos) y el sistema le envía la etiqueta al comprador por email.

## 10.2 Gestión de excepciones

### Qué información da la API

La API **informa** las excepciones a través de las trazas, con el par `Estado` + `Motivo`:

```json
{ "Fecha": "2021-03-09T11:59:04",
  "Estado": "Visita", "EstadoId": 11,
  "Motivo": "No se encuentra el titular", "MotivoId": 36,
  "Traduccion": "No se encuentra el titular",
  "Sucursal": "Monserrat", "SucursalId": 12, "Ciclo": "Distribution" }
```

⛔ Pero **no hay ningún endpoint para actuar sobre la excepción**: no hay reprogramación de entrega, no hay corrección de dirección, no hay redirección a sucursal, no hay autorización de una tercera visita.

### Estructura de los motivos

Lo poco que se puede afirmar sobre el campo `Motivo`, verificado en el ejemplo oficial:

- **Es opcional.** Solo aparece en el evento `Visita`; los eventos 1, 5 y 6 no lo traen. El parser debe tolerar su ausencia.
- **Cuando hay `Motivo`, el campo `Traduccion` repite el texto del motivo** en vez de traer la descripción operativa en mayúsculas. `Traduccion` cambia de semántica según haya o no motivo. No usarlo como texto estable.
- Solo se conoce `MotivoId: 36 = "No se encuentra el titular"`. ⛔ El catálogo completo no está publicado (**GAP-02**).

### Taxonomía propuesta

Como el catálogo de motivos no está publicado, el diseño correcto es agrupar por **acción requerida**, no por motivo específico. Cuando llegue el catálogo, cada `MotivoId` se asigna a un grupo.

| Grupo | Motivos típicos | Acción del operador | ¿Se notifica al comprador? |
|---|---|---|---|
| `RETRY_POSSIBLE` | Ausente, no se encuentra el titular, domicilio cerrado | Ninguna. Andreani reintenta | Sí — "no te encontramos, reintentamos mañana" |
| `NEEDS_DATA` | Dirección incorrecta, insuficiente, no existe | **Contactar al comprador y gestionar con Andreani** | Sí — pedir corrección, urgente |
| `CUSTOMER_ACTION` | Rechazado por el destinatario, se negó a recibir | Decidir: devolución o reenvío | No — ya sabe |
| `UNCLAIMED` | Rezago, no retirado del punto en plazo | Gestionar devolución | Sí — antes de que venza el plazo |
| `CARRIER_ISSUE` | Siniestro, extravío, daño | **Abrir reclamo** | Sí, con propuesta de solución |
| `UNKNOWN` | Cualquier `MotivoId` no mapeado | **Revisión manual + alerta** | No |

### Panel de excepciones

Cada excepción sin resolver es plata parada. El panel admin necesita una **bandeja de excepciones** con:

- Envíos en excepción, ordenados por antigüedad del problema.
- Motivo crudo de Andreani + interpretación + acción sugerida.
- Días transcurridos desde el evento.
- Acceso al historial completo de trazas y a los documentos de `multimedia`.
- Registro de la gestión: quién la tomó, qué hizo, cuándo se cerró.

Además, **alerta automática** para: envíos sin movimiento hace más de 7 días, envíos con más de 2 intentos fallidos, y envíos que superaron el plazo esperado de entrega.

**Como no hay API para actuar**, el panel es una herramienta de gestión humana, no de automatización. Su valor está en que ninguna excepción quede sin ver.

## 10.3 Reclamos y siniestros

⛔ **No existe API de reclamos.** No figura en ninguna de las tres superficies de documentación.

### Canales de contacto encontrados

| Canal | Para qué | Fuente |
|---|---|---|
| `infotienda@andreani.com` | Consultas de tiendas | 🟡 [Tiendanube FAQ](https://ayuda.tiendanube.com/es_ES/andreani/preguntas-frecuentes-sobre-andreani) |
| `atenciondigital@andreani.com` | Atención digital | 🟡 idem |
| `apis@andreani.com` | Consultas de API | 🟡 SDK de terceros. **No aparece en ninguna página oficial de Andreani** — confirmar antes de usarlo |
| Ejecutivo comercial | Todo lo demás | 🟢 *"Contact your salesperson"* |

### Seguro y valor declarado

Lo que la API sí expone:

| Campo | Descripción oficial | Uso |
|---|---|---|
| `bultos[].valorDeclaradoSinImpuestos` | "Valor del bulto sin impuestos **para el seguro de distribución**" | **Este es el que determina la cobertura** |
| `bultos[].valorDeclaradoConImpuestos` | "Valor del bulto con impuestos **para gestiones cobranza**" | Cobro en destino, no seguro |
| `tarifaSinIva.seguroDistribucion` / `tarifaConIva.seguroDistribucion` | Costo del seguro en la cotización | Se ve el costo del seguro por separado |

⛔ **No documentado:** tope de cobertura, porcentaje del seguro, qué cubre y qué no, plazos y procedimiento de reclamo, documentación exigida.

**Regla de implementación:** `valorDeclaradoSinImpuestos` debe ser **el valor real de la mercadería sin IVA**, no cero y no el total con impuestos. Declarar de menos abarata el envío y deja al comercio sin cobertura ante un siniestro. Declarar de más encarece cada envío. Es una decisión del comercio, así que exponerla como configuración del tenant (con el valor real como default y una advertencia clara si la baja).

### Flujo de reclamo en Tiendafy

Como no hay API:

1. El estado `LOST_OR_DAMAGED` dispara una alerta en el panel.
2. El sistema arma un **paquete de evidencia**: `numeroDeEnvio`, historial completo de trazas, valor declarado, links de `multimedia`, datos del destinatario y fecha de despacho.
3. El operador lo usa para abrir el reclamo por el canal comercial.
4. Se registra el número de reclamo externo en el shipment para seguimiento manual.

Automatizar el armado de la evidencia es lo que hace la diferencia: la parte lenta de un reclamo es juntar los datos, no enviar el mail.

## 10.4 Resumen de qué se puede y qué no

| Necesidad | ¿API? | Cómo se resuelve |
|---|---|---|
| Detectar una excepción | ✅ Sí | Trazas / webhook |
| Reprogramar una entrega | ❌ No | Manual con Andreani |
| Corregir una dirección | ❌ No | Manual. En el peor caso, envío nuevo |
| Redirigir a sucursal | ❌ No | Manual |
| Cancelar un envío | ❌ No | No despachar (si no salió) o gestión manual |
| Generar una devolución | ⚠️ 🔵 Probablemente sí, con otro contrato | **Confirmar** |
| Abrir un reclamo | ❌ No | Canal comercial, con evidencia armada por el sistema |
| Consultar prueba de entrega | ⚠️ Parcial | `multimedia` devuelve links, no datos |

## 10.5 GAPs de este documento

| ID | GAP | Pregunta a Andreani |
|---|---|---|
| GAP-05 | Sin API de devoluciones | **¿Cómo se genera una devolución? ¿Es una orden con otro contrato y origen/destino invertidos?** ¿`productoARetirar` es la clave? |
| — | Gestión de excepciones | ¿Existe API para reprogramar, corregir dirección o redirigir a sucursal? Si no, ¿cuál es el procedimiento y su SLA? |
| — | Reintentos de entrega | ¿Cuántos intentos hace Andreani antes de rezagar? ¿Cuál es el plazo de guarda en sucursal? |
| — | Reclamos | ¿Hay API o portal de reclamos? ¿Cuál es el canal correcto y el SLA? |
| — | Seguro | ¿Cuál es el tope de cobertura, el porcentaje sobre el valor declarado, y qué exige un siniestro? |
| — | Canal de soporte técnico | ¿`apis@andreani.com` es el canal correcto para consultas de API? |
