# Tiendafy vs La Pyme — qué nos falta

Análisis del 11/09/2026 contra [lapyme.com.ar](https://www.lapyme.com.ar/) (home,
funcionalidades, ventas, POS, facturación, inventario, compras, tesorería,
cuentas corrientes, contabilidad, multimoneda, reportes, precios e integraciones).

**Método**: lo de La Pyme sale de su sitio — es material comercial, no producto
verificado. Lo de Tiendafy está verificado contra el código y el esquema de la
base, y cada afirmación dice dónde se comprobó. Si algo dice "no existe", es que
no hay tabla ni endpoint, no que no lo vi.

---

## Lo primero: no son el mismo producto

La Pyme es un **ERP horizontal** que no vende: se cuelga del canal del comercio
(Tiendanube, Shopify, WooCommerce, Mercado Libre) y administra la trastienda.

Tiendafy es una **plataforma de e-commerce multi-tienda** que sí vende: storefront
propio, editor de diseño, marketing, canales.

Se superponen en cuatro áreas —ventas, facturación ARCA, stock y compras— y ahí
La Pyme es más profundo. Fuera de esas cuatro, cada uno tiene lo que el otro no.

Sus planes, para dimensionar a qué le ponen precio: Starter $119.900/mes (3
usuarios, 1 depósito, 500 ventas), Pro $279.900 (8 usuarios, 3 depósitos, 2.500
ventas), Max $599.900 (15 usuarios, 5 depósitos, 5.000 ventas). El multidepósito
recién aparece en Pro; la contabilidad completa está en todos.

> **Estado: septiembre de 2026.** Cinco de las brechas de este informe ya se
> construyeron —tesorería, cuentas corrientes, ficha de proveedor, listas de
> precios, presupuestos y OCR de facturas de compra—. La tabla de abajo quedó
> como estaba al escribirlo, con una columna nueva que dice qué pasó con cada
> una: sirve de registro de por qué se decidió lo que se decidió.

---

## Resumen de brechas

| Área | La Pyme | Tiendafy (al escribirlo) | Comprobado en | Estado hoy |
|---|---|---|---|---|
| Tesorería (cajas, bancos, cheques, conciliación) | sí | **no existe** | Sin tablas; los "cheque" del código son `chequear` | ✅ hecho (sin cheques ni conciliación) |
| Cuentas corrientes de clientes y proveedores | sí | **no existe** | `customers` no tiene saldo ni movimientos | ✅ hecho |
| Contabilidad (plan de cuentas, asientos, balance) | sí | **no existe** | Sin tablas contables | ⛔ descartado |
| POS con turnos y arqueo de caja | sí | **parcial** | Hay venta manual; no hay caja, turno ni arqueo | ➖ hay caja; faltan turno y arqueo |
| Lector de barras en la venta / ticket térmico | sí | **no** | El escáner existente es de depósito | ➖ pendiente |
| Multi-depósito y transferencias | sí (Pro+) | **no** | `stock_items.location` son estantes (`B1`, `C4`) | ⛔ solo si hay más de un depósito físico |
| Listas de precios por cliente/canal/moneda | sí | **no** | Hay repreciación y costos, no listas | ✅ hecho (por cliente; el storefront sigue con el precio del producto) |
| Multimoneda | completa | **solo compras** | `PurchaseOrder` con `Currency` + `ExchangeRate` | ➖ cajas y listas aceptan USD; falta tipo de cambio |
| Presupuestos y remitos | sí | **no** | Sin rastro en código | ✅ presupuestos; el remito queda pendiente |
| Ficha de proveedor con historial y saldo | sí | **no** | El proveedor es texto libre en la OC | ✅ hecho |
| OCR de facturas de compra | sí | **no** | — | ✅ hecho (propone, no guarda) |
| Importar comprobantes desde ARCA | sí | **no** | — | ➖ espera el certificado de ARCA activo |
| Carga masiva de compras por Excel | sí | **no** | Sí existe import/export de productos | ➖ pendiente |
| Factura E (exportación) y FCE MiPyME | sí | **no** | Emite A, B, C y NC/ND A/B/C | ⛔ CKING importa, no exporta |
| Campos personalizados | sí | **no** | — | ➖ la ficha técnica cubre el catálogo |
| Auditoría de cambios | sí | **no** | — | ➖ pendiente |
| Dashboard personalizable / creador de reportes | sí | **no** | Reportes fijos | ➖ pendiente |
| API pública + SDK + conector MCP | sí | **no** | Sin API keys de terceros | ⛔ descartado |
| Canales Tiendanube / Shopify / WooCommerce | sí | **no** | Mercado Libre sí, completo | ⛔ descartado |
| Órdenes de compra con recepción parcial | sí | **sí** | `purchase_order_items.received_quantity` | — |
| Landed cost e importación | no lo menciona | **sí** | `PurchaseOrder.LandedUnitCostArsMinor` | — |
| Libro IVA ventas y compras | sí | **sí** | `FiscalEndpoints` + `PurchasingEndpoints` | — |
| Roles y permisos | sí | **sí** | RBAC con matriz por rol | — |

---

## Detalle de lo que falta

### Tesorería

Hay cobros (Mercado Pago, Payway, reembolsos) pero **no hay dónde queda la
plata**. La Pyme tiene cajas y bancos multimoneda con saldo real, movimientos,
transferencias entre cuentas, cheques propios y de terceros con su ciclo
(cartera → depositado → endosado → cobrado), liquidaciones de cupones de tarjeta
y conciliación bancaria.

### Cuentas corrientes

`customers` guarda `name, email, phone, address, notes` — nada de saldo. La Pyme
lleva cuenta corriente de clientes y de proveedores con débitos, créditos, cobros
parciales, señas y resúmenes de cuenta por email.

Para una importadora con venta mayorista, es la brecha más cara de la lista.

### Contabilidad

Plan de cuentas, asientos automáticos desde cada venta y compra, libro diario y
mayor, balance, estado de resultados, centros de costo y ajuste por inflación.

Tiendafy entrega **libro de IVA de ventas y de compras**, que es lo que el
estudio contable pide mes a mes, pero no contabilidad.

### Punto de venta

Existe la venta manual (`orders-manual.tsx`, `ManualOrderService`). Falta lo que
la convierte en mostrador: turnos de caja con apertura y cierre, arqueo,
múltiples cajas por sucursal, lector de barras **en la venta**, ticket térmico y
pagos mixtos en una misma operación.

### Multi-depósito

`stock_items` tiene columna `location`, pero los valores son posiciones de
estante (`B1`, `C4`, `E4`) y hay una sola fila de stock por variante. La Pyme
maneja depósitos y sucursales con stock por ubicación y transferencias con
recepción parcial y control de diferencias.

### Listas de precios

La Pyme tiene listas por cliente, canal o moneda, y listas calculadas sobre otras
listas. Tiendafy tiene repreciación masiva y gestión de costos, que no es lo
mismo: no hay forma de que convivan un precio mayorista y uno minorista.

### Multimoneda

El módulo de compras ya trabaja en USD con tipo de cambio y landed cost — está
bien resuelto para importar. Falta el resto del circuito: listas de precios en
dólares, tesorería en dos monedas y reportes con posición por moneda.

### Compras

La orden de compra de Tiendafy es **más específica que la de ellos** para un
importador: estados borrador → confirmada → en producción → en tránsito → en
aduana → recibida, recepción parcial real, landed cost y comprobante del
proveedor para el libro de IVA.

Lo que falta: OCR de la factura del proveedor (subir el PDF y que la AI proponga
líneas, impuestos y totales), importación de comprobantes desde ARCA, carga
masiva por Excel, y **ficha de proveedor** — hoy es un texto libre por orden, sin
tabla, sin historial y sin saldo.

### Facturación

Emite A, B, C y notas de crédito y débito A/B/C. No emite **Factura E
(exportación)** ni **Factura de Crédito Electrónica MiPyME**. Bloqueante solo si
se exporta o se le factura a grandes empresas.

---

## Lo que Tiendafy tiene y La Pyme no

La comparación en un solo sentido engaña. Del otro lado:

- **Tienda online propia**: storefront, editor de diseño con vista previa en
  vivo, temas, dominios propios de cada comercio, SEO, páginas de contenido.
  La Pyme no vende: se integra con la tienda de otro.
- **Multi-tienda de verdad**: una plataforma, varias tiendas, aislamiento por
  tenant con tests que lo verifican.
- **Envíos argentinos integrados**: Correo Argentino, Zipnova y Andreani, con
  cotización en el checkout y etiquetas. Ellos dicen "picking y envíos" sin
  nombrar un solo carrier.
- **Email marketing** con segmentación por comportamiento y atribución por cupón.
- **Redes sociales**, **WhatsApp automático**, **chat posventa**, **carritos
  abandonados**, **favoritos con avisos de precio**.
- **Rentabilidad real** cruzada con Meta Ads.

---

## Qué conviene construir, y en qué orden

Pensado para CKING —importadora con tiendas propias—, no para una pyme genérica.

1. **Cuentas corrientes de clientes**, después proveedores. La brecha que más
   duele si hay venta mayorista, y la más barata de las grandes: una tabla de
   movimientos y un saldo sobre lo que ya existe.
2. **Ficha de proveedor.** Hoy el proveedor es un string en cada orden. Sin eso
   no hay historial, ni saldo, ni comparar precios entre compras.
3. **Listas de precios.** Mayorista contra minorista contra canal. Típico del
   importador y hoy no hay forma de representarlo.
4. **Tesorería mínima**: cajas y bancos con movimientos, y que cobros y pagos
   impacten ahí. Sin cheques ni conciliación en la primera vuelta.
5. **Multi-depósito** — solo si hoy hay más de un lugar físico. Si el stock vive
   en un solo depósito, es complejidad sin beneficio.
6. **OCR de facturas de compra.** Ya hay clave de IA en el sistema: de las que
   mejor relación esfuerzo/ahorro tienen para quien importa.
7. **Factura E y FCE MiPyME** — solo si se exporta o se le vende a grandes.

### Lo que se construyó, y cómo quedó

**1, 2 y 4 — cuentas corrientes, ficha de proveedor y tesorería.** Módulo
`Finance` nuevo. El saldo no se guarda: se calcula sumando movimientos, porque
un saldo guardado y una lista de movimientos siempre terminan discrepando. El
signo se lee siempre desde nuestro lado (saldo = Σ Debe − Σ Haber), así una sola
fórmula sirve para clientes y proveedores. La factura de una orden de compra y
la venta manual en cuenta corriente escriben ahí solas. Sin cheques ni
conciliación bancaria, como decía el punto 4.

**3 — listas de precios.** La lista guarda una REGLA (un porcentaje sobre el
precio del producto o sobre otra lista), no una copia de precios: con precios
copiados, subir el catálogo 20% deja la mayorista en los números del mes pasado.
Se asigna al cliente y la venta manual la usa sola. El storefront sigue
mostrando el precio del producto: las listas son para la venta asistida, que es
donde se sabe quién está comprando.

**6 — OCR de facturas de compra.** Con la clave de IA que ya estaba. Propone y
no guarda: de esos números salen el libro de IVA y la deuda con el proveedor. Lo
que no se lee con seguridad vuelve en null y nunca como un valor aproximado.

**Extra — presupuestos.** No estaba en esta lista pero cierra el circuito de las
tres anteriores: se cotiza al precio de la lista del cliente y, si acepta, la
venta sale sola a su cuenta corriente. Congela los precios del día que se cotizó
y por eso un presupuesto vencido no se acepta sin extender la validez a mano.

Quedaron afuera el remito, el ticket térmico, el turno y arqueo de caja, la carga
masiva de compras por Excel y la auditoría de cambios.

### Lo que no conviene construir

- **Contabilidad completa.** Plan de cuentas, asientos, balance y ajuste por
  inflación son meses para replicar lo que hace el estudio contable, y el libro
  de IVA de ventas y compras ya cubre lo que piden mes a mes.
- **API pública con SDK y conector MCP.** Tiene sentido para un SaaS con clientes
  externos que quieren extenderlo. Acá la plataforma y el comercio son la misma
  empresa: el mismo esfuerzo rinde más puesto en la operación.
- **Tiendanube, Shopify y WooCommerce.** Son competidores del storefront propio,
  no funcionalidad faltante. Solo importarían si Tiendafy se vendiera a pymes que
  ya tienen su tienda en otro lado.
