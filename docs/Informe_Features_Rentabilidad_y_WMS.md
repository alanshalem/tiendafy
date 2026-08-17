# Informe — Qué features sumarle a Tiendafy: rentabilidad real (Escalafy) y gestión de depósito (WMS)

*Preparado para evaluar la próxima etapa del producto, con foco en el cliente importador/distribuidor. Fuentes al pie.*

> **Estado (2026-08-17): Bloque A implementado en v1** — costo por variante
> (Productos → Costos + columna «Costo» del CSV), snapshot de costo en cada
> venta, comisión real de MP capturada del pago al conciliar, y dashboard
> Estadísticas → Rentabilidad (ganancia, margen, por producto, cobertura).
> Fuera de v1: ROAS con Meta Ads (A6), costo real del carrier, ganancia por
> campaña (A5) y los bloques B/C/D — módulos nuevos, ver guía de módulos.

---

## Resumen ejecutivo

Se investigaron dos familias de software que complementan lo que Tiendafy ya hace:

1. **Escalafy** (analítica de rentabilidad para e-commerce argentino): su propuesta entera es "vender no es ganar" — toma las ventas de Tiendanube/Shopify/ML y les descuenta TODOS los costos reales (producto, envío, comisiones MP, cuotas, IIBB, descuentos, pauta) para mostrar la **ganancia real en tiempo real**, por producto y por campaña.
2. **WMS / inventario con código de barras** (Fishbowl, SkuVault/Linnworks, Zoho Inventory, inFlow, Digit): el estándar de la categoría es **escanear en cada movimiento** — recepción, picking, packing, conteo — para eliminar errores de despacho y tener stock confiable, más órdenes de compra, puntos de reposición, ubicaciones por depósito y kits.

**Conclusión central**: Tiendafy tiene una ventaja estructural sobre ambas categorías — *ya es el sistema donde viven las ventas, los pagos, los envíos, los cupones y el stock*. Escalafy y los WMS existen porque los comercios tienen los datos desparramados en cinco plataformas; acá están todos en la misma base de datos. Agregar estas features cuesta una fracción de lo que le cuesta a un tercero integrarlas, y el resultado es más profundo (nada de estimaciones: números exactos por orden).

Lo recomendado, en orden: **(1) módulo de Rentabilidad real, (2) WMS liviano con escaneo por cámara, (3) compras/importaciones con landed cost — la feature más "de importador" de todas, (4) kits y B2B mayorista.**

---

## Parte 1 — Qué hace Escalafy (y qué significa para Tiendafy)

### 1.1 Sus features, una por una

| Feature de Escalafy | En qué consiste |
| --- | --- |
| **Dashboard de rentabilidad** | Ventas − costos = ganancia real del día, en tiempo real. "Facturación la ves en cualquier lado; ganancia real, solo acá." |
| **Costos reales descontados** | Costo de producto, envío, comisión de Mercado Pago, **costo financiero de las cuotas**, IIBB, comisiones de plataforma, descuentos/cupones, honorarios de agencia. |
| **ROAS real por campaña** | Conecta Meta/Google/TikTok Ads y contrasta el gasto publicitario contra la **ganancia** (no la facturación) atribuida: "Meta te dice ROAS 4x cuando la realidad suele ser 1.8x". Decide qué campaña escalar y cuál apagar. |
| **Análisis de productos** | Qué productos dejan ganancia real (no cuáles venden más), tendencias, oportunidades de cross-selling. |
| **Inventario inteligente** | Stock centralizado multi-canal, cuántas unidades hay, dónde están y **cuánto van a durar** (proyección de quiebre). |
| **Multi-canal** | Unifica Tiendanube, Shopify, Mercado Libre, Mercado Pago y las plataformas de ads en un solo lugar. |
| **Sin carga manual** | Setup en ~15 minutos, todo por integraciones; el pitch anti-Excel: "2–3 horas por día y errores de fórmula". |

### 1.2 La brecha en Tiendafy hoy

Tiendafy muestra **facturación** (estadísticas de ventas, multicanal con ML) pero no **ganancia**: no conoce el costo de los productos, no registra la comisión exacta que cobró MP en cada pago, ni el costo real del envío pagado al correo. La atribución por cupón de las campañas de email ya existe (ventaja), pero mide ingresos, no margen, y no hay conexión con Meta Ads.

### 1.3 Por qué acá sería mejor que Escalafy

- **Datos de primera mano**: cada orden ya tiene el pago de MP asociado (la comisión exacta se puede leer de la API de MP por pago, no estimar), el costo de envío cotizado, el cupón aplicado y el canal (tienda propia o ML). Escalafy tiene que reconstruir esto desde afuera.
- **Sin suscripción de terceros**: Escalafy es un SaaS mensual más; acá es una sección nueva de Estadísticas.
- **Cierra el círculo con las campañas propias**: las campañas de email de Tiendafy ya atribuyen ventas por cupón — falta solo el paso de "ingresos atribuidos" a "ganancia atribuida", y sumar el gasto de Meta Ads por API para el ROAS real.

---

## Parte 2 — Qué ofrecen los WMS de referencia

### 2.1 Los SaaS modernos analizados

| Plataforma | Lo distintivo |
| --- | --- |
| **Fishbowl** | El WMS "PyME" clásico: escaneo de barras en recepción (contra orden de compra), picking, packing y despacho (contra orden de venta) — "cero adivinanza, el stock se actualiza con cada escaneo". Multi-depósito, ubicaciones (bins), números de serie, app móvil iOS/Android (Fishbowl GO). |
| **SkuVault Core (Linnworks)** | Foco en **precisión**: picklists digitales que guían al picker, escaneo que confirma cada ítem al empacar (control de calidad que atrapa el error ANTES de despachar), conteos cíclicos sin frenar la operación, **kits/bundles** con descuento automático de componentes, wave picking multi-orden. |
| **Zoho Inventory** | Generador de códigos de barras integrado (EAN-13, UPC-A, Code 39), tracking por **serie y por lote** (vencimientos, recalls), **puntos de reposición** con generación automática de orden de compra o transferencia al caer bajo mínimo, multi-depósito. |
| **inFlow Inventory** | Diseñador de **etiquetas** drag-and-drop (imprime en DYMO/Zebra), escaneo con USB, celular o su Smart Scanner dedicado, órdenes de compra ilimitadas desde cualquier dispositivo, y **Showroom**: un portal B2B donde el mayorista ve catálogo, stock y precios y hace su pedido solo. |
| **Digit** | Serialización con etiquetas autogeneradas, workflows guiados de shipping/receiving/picking/packing, órdenes de compra con estados de entrega en vivo, BOM y control de calidad en recepción. |

### 2.2 El panorama en Argentina

Los WMS "grandes" que suenan en el mercado local (Mecalux Easy WMS, Alcis, Körber, Check WMS) son soluciones enterprise para operadores logísticos — sobredimensionadas para este caso. En PyMEs locales aparecen Odoo (open source, con comunidad LATAM y localización AR) y opciones regionales como Deposix. **Ninguna se integra con una plataforma propia como Tiendafy sin un proyecto de integración aparte** — otra razón para construir el subconjunto útil adentro.

### 2.3 El común denominador que importa

Todas las plataformas convergen en el mismo núcleo: **(a)** cada SKU tiene código de barras/QR y etiqueta imprimible, **(b)** cada movimiento físico se confirma escaneando (recibir, mover, contar, despachar), **(c)** el picking verificado elimina el error de "mandé el disco de 15 kg en vez del de 25", y **(d)** las compras a proveedor con punto de reposición cierran el ciclo. Todo lo demás (wave picking, 3PL, manufacturing) es cola larga que no aplica.

---

## Parte 3 — Propuesta concreta para Tiendafy (priorizada)

### Bloque A — Rentabilidad real (el "Escalafy adentro") · ~90–120 h

1. **Costo por variante** en el catálogo (costo unitario + moneda), editable también por CSV.
2. **Comisión real de MP por pago**: leerla de la API de MP al conciliar cada pago (el dato exacto existe por transacción) y guardarla en la orden.
3. **Ganancia por orden**: total − costo de productos − comisión MP − costo de envío real − descuento de cupón. Visible en el detalle de la venta.
4. **Dashboard "Rentabilidad"** en Estadísticas: ganancia real del día/semana/mes, margen % por producto (los que venden mucho y dejan poco quedan expuestos), por canal (tienda vs ML — a ML restarle su comisión por venta).
5. **Ganancia por campaña**: la atribución por cupón que ya existe pasa de "ingresos generados" a "ganancia generada".
6. **Integración Meta Ads (insights)**: gasto diario por campaña vía API → **ROAS real** = ganancia atribuida / gasto. Es la feature bandera de Escalafy y acá es un endpoint de lectura.

### Bloque B — WMS liviano con escaneo · ~100–140 h

1. **Código de barras/QR por variante**: generar EAN-13/Code-128 (o usar el del proveedor), **etiquetas PDF imprimibles** en planchas o impresoras de etiquetas (QuestPDF ya está en el stack).
2. **Escaneo con la cámara del celular** en el admin (librería JS de lectura de barcode/QR — sin hardware dedicado): buscar producto al instante, ajustar stock, contar.
3. **Picking verificado**: al preparar una venta, escanear cada ítem; el sistema confirma o alerta si el producto no corresponde — el anti-error de despacho de SkuVault, que es lo que más plata ahorra.
4. **Recepción escaneada** contra orden de compra (ver Bloque C): escanear lo que llega del contenedor y el stock sube solo, con diferencias marcadas.
5. **Ubicaciones (bins)** por centro de distribución (estantería/posición por variante) y **transferencias entre depósitos** con confirmación por escaneo.
6. **Conteo cíclico**: sesiones de conteo por categoría/ubicación con ajuste auditado.

### Bloque C — Compras e importaciones (la feature "de importador") · ~80–110 h

1. **Órdenes de compra a proveedores** (del exterior o locales): ítems, cantidades, costos, moneda.
2. **Estados del ciclo de importación**: borrador → confirmada → en producción → **en tránsito → en aduana** → recibida (parcial/total) — visibilidad que ningún WMS genérico trae con ese vocabulario.
3. **Landed cost**: prorratear al costo unitario los gastos del embarque (flete internacional, seguro, aranceles, despachante, IVA aduana) — el costo REAL de cada unidad importada, que alimenta directo el Bloque A. Es la diferencia entre creer que un disco cuesta USD 4 y saber que puesto en el depósito cuesta USD 6,80.
4. **Punto de reposición con lead time**: "quedan 40 unidades, vendés 2/día y el reabastecimiento tarda 90 días → pedí YA". Para un importador con meses de tránsito, la alerta simple de 'stock bajo' llega tarde; la que considera lead time es la que sirve.

### Bloque D — Completar el círculo mayorista · ~60–90 h

1. **Kits/combos** (BOM liviano): "Kit barra + discos" como producto vendible que descuenta stock de sus componentes (SkuVault-style). El catálogo actual ya tiene kits armados como productos sueltos — hoy el stock del kit y el de los componentes no se hablan.
2. **Lotes**: asociar cada ingreso a su contenedor/OC (trazabilidad de qué embarque vino cada unidad, costos por lote).
3. **Portal B2B "Showroom"** (inFlow-style): catálogo con lista de precios mayorista y stock para que los clientes B2B de la importadora hagan pedidos solos — CKING es distribuidora: hoy Tiendafy solo cubre la venta minorista.

### Qué NO construir (YAGNI)

Wave picking multi-operario, facturación 3PL, manufactura con rutas de producción, RFID, forecasting con ML: son features de operaciones con decenas de empleados de depósito o fábricas. Ninguna mueve la aguja para este caso y todas se pueden agregar después si la operación crece.

---

## Tabla resumen — valor vs. esfuerzo

| # | Feature | Bloque | Valor para el importador | Esfuerzo |
| --- | --- | --- | --- | --- |
| 1 | Costo por variante + ganancia por orden | A | ⭐⭐⭐⭐⭐ base de todo | Bajo |
| 2 | Dashboard de rentabilidad (día/producto/canal) | A | ⭐⭐⭐⭐⭐ | Medio |
| 3 | Landed cost de importaciones | C | ⭐⭐⭐⭐⭐ único en su tipo | Medio |
| 4 | Órdenes de compra con estados de importación | C | ⭐⭐⭐⭐ | Medio |
| 5 | Picking verificado por escaneo | B | ⭐⭐⭐⭐ mata el error de despacho | Medio |
| 6 | Etiquetas + escaneo con cámara (buscar/ajustar/contar) | B | ⭐⭐⭐⭐ | Medio |
| 7 | Punto de reposición con lead time | C | ⭐⭐⭐⭐ | Bajo |
| 8 | ROAS real con Meta Ads | A | ⭐⭐⭐⭐ | Medio |
| 9 | Kits/combos con stock por componentes | D | ⭐⭐⭐ | Medio |
| 10 | Ubicaciones (bins) + transferencias entre depósitos | B | ⭐⭐⭐ | Medio |
| 11 | Conteo cíclico | B | ⭐⭐⭐ | Bajo |
| 12 | Lotes por contenedor | D | ⭐⭐ | Medio |
| 13 | Portal B2B mayorista | D | ⭐⭐⭐ (si el canal B2B pesa) | Alto |

**Camino sugerido**: A1→A4 primero (rentabilidad se siente en la primera semana y no toca la operación física), después C (compras + landed cost, que además mejora la precisión de A), después B (escaneo — requiere cambio de hábitos en el depósito, mejor con el resto andando), y D según demanda.

---

## Fuentes

- Escalafy: [sitio oficial](https://www.escalafy.com/), [app en Tiendanube](https://www.tiendanube.com/tienda-aplicaciones-nube/escalafy), [app en Shopify](https://apps.shopify.com/escalafy), [blog: ROAS real](https://www.escalafy.com/blog/roas-real-ecommerce-meta-ads), [blog: markup vs margen](https://www.escalafy.com/blog/markup-vs-margen-diferencia-ecommerce)
- Fishbowl: [warehouse management](https://www.fishbowlinventory.com/warehouse-management), [barcode scanning](https://www.fishbowlinventory.com/solutions/barcode-scanning-solution)
- SkuVault / Linnworks: [SkuVault Core](https://www.linnworks.com/product-skuvault-core/), [warehouse management](https://www.linnworks.com/features/warehouse-management/)
- Zoho Inventory: [producto](https://www.zoho.com/us/inventory/), [barcode generator](https://www.zoho.com/us/inventory/free-barcode-generator/)
- inFlow Inventory: [barcode software](https://www.inflowinventory.com/features/barcode-software), [Showroom B2B](https://www.inflowinventory.com/features/b2b-portal), [Smart Scanner](https://www.inflowinventory.com/support/cloud/inflow-smart-scanner)
- Digit: [warehouse](https://www.digit-software.com/features/warehouse), [distribución](https://www.digit-software.com/industries/distribution)
- Panorama WMS Argentina: [ComparaSoftware — Top 10 WMS Argentina](https://www.comparasoftware.com.ar/gestion-de-almacenes-wms), [Mecalux](https://www.mecalux.com.ar/software/wms-sistema)
