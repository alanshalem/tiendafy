# 06 — Medios de pago, cuotas y promociones

---

## 1. Hallazgo central: **no hay API de promociones**

Esta es probablemente la conclusión más importante del relevamiento y la que más impacta en el esfuerzo de implementación.

**Evidencia:** los **tres plugins oficiales** de Payway (WooCommerce, PrestaShop, Magento) implementan las promociones y planes de cuotas **en tablas locales del propio comercio**, con una pantalla de administración para cargarlas a mano. Ninguno consulta un endpoint remoto de Payway.

- WooCommerce: `wc_payway_checkout_promotions()` lee de tablas locales — https://raw.githubusercontent.com/payway-ar/plugin-woocommerce/master/wc-gateway-payway/includes/class-payway-core-functions.php
- PrestaShop: matching contra `payway_banks`, `payway_cards`, `payway_promotions`, `payway_installments` — https://raw.githubusercontent.com/payway-ar/plugin-prestashop/master/payway/controllers/front/spromotions.php
- Magento: módulo completo de promociones locales (`RuleRepository`, `BankRepository`, `CreditCardRepository`) — https://github.com/payway-ar/plugin-magento-promotions

Si Payway ofreciera un endpoint de promociones, sus propios plugins lo usarían. **No lo hacen.**

> **GAP-09.** Confirmar con soporte. Pero hay que planificar asumiendo que **Tiendafy debe administrar los planes de cuotas por tenant**.

Consecuencia directa para el backlog: hay un módulo entero de "administración de promociones" que hay que construir, con su CRUD en el panel admin. No es opcional.

---

## 2. Medios de pago (`payment_method_id`)

### 2.1 Tabla de referencia

⚠️ **Fuente de tercero.** Esta tabla aparece **idéntica en tres forks independientes del README oficial del SDK** y coincide con el GitBook oficial histórico de Decidir. Confianza alta, pero **hay que validarla con Payway antes de producción**.

Fuentes:
- https://raw.githubusercontent.com/guiwoda/decidir-sdk-php-v2/master/README.md
- https://raw.githubusercontent.com/fjlenatz/sdk-php-v2/master/README.md
- https://decidir.gitbooks.io/documentacion/content/Anexos/TablasReferencia/MediosDePago.html

| ID | Medio de pago | Tipo |
|---|---|---|
| 1 | VISA | Crédito |
| 6 | AMEX 2 *(solo en la tabla v1)* | Crédito |
| 8 | DINERS | Crédito |
| 15 | MASTERCARD | Crédito |
| 20 | MASTERCARD TEST | Crédito (test) |
| 23 | TARJETA SHOPPING | Crédito |
| 24 | TARJETA NARANJA | Crédito |
| 25 | PAGO FÁCIL | Offline |
| 26 | RAPIPAGO | Offline |
| 27 | CABAL | Crédito |
| 29 | ITALCRED | Crédito |
| 30 | ARGENCARD | Crédito |
| 31 | VISA DÉBITO ¹ | Débito |
| 34 | COOPEPLUS | Crédito |
| 36 | ARCASH | Crédito |
| 37 | NEXO | Crédito |
| 38 | CREDIMAS | Crédito |
| 39 | TARJETA NEVADA | Crédito |
| 41 | PAGOMISCUENTAS | Offline |
| 42 | NATIVA | Crédito |
| 43 | TARJETA MÁS | Crédito |
| 44 | TARJETA CARREFOUR | Crédito |
| 45 | TARJETA PYMENACIÓN | Crédito |
| 46 | PAYSAFECARD | Prepago |
| 47 | MONEDERO ONLINE | Prepago |
| 48 | CAJA DE PAGOS | Offline |
| 50 | BBPS | Offline |
| 51 | COBRO EXPRESS | Offline |
| 52 | QIDA | Crédito |
| 53 | LAPOS WEB TRAVEL | Crédito |
| 54 | GRUPAR | Crédito |
| 55 | PATAGONIA 365 | Crédito |
| 56 | TARJETA CLUB DÍA | Crédito |
| 59 | TARJETA TUYA | Crédito |
| 60 | DISTRIBUTION | — |
| 61 | LA ANÓNIMA | Crédito |
| 62 | CREDIGUÍA | Crédito |
| 63 | CABAL PRISMA | Crédito |
| 64 | TARJETA SOL | Crédito |
| 65 | AMEX MT ² | Crédito |
| 66 | MC DEBIT | Débito |
| 67 | CABAL DÉBITO (Cabal24) | Débito |
| 99 | MAESTRO | Débito |

¹ **Visa Débito no acepta devoluciones parciales en e-commerce.** (README oficial del SDK .NET)
² **Amex requiere `seller_id` dentro de `aggregate_data`** cuando se opera en modo agregador.

### 2.2 ⚠️ Conflicto abierto: plataforma nueva vs. clásica (GAP-12)

ActiveMerchant (el gateway de Shopify, código productivo contra el sandbox real de Decidir) usa **otros ids** para varios medios:

```ruby
payment_method_ids = {
  'visa'             => debit ? 31 : 1,
  'master'           => debit ? 105 : 104,
  'maestro'          => 106,
  'cabal'            => debit ? 108 : 63,
  'american_express' => 65,
  'diners_club'      => 8,
  'naranja'          => 24,
  'patagonia_365'    => 55,
  'tarjeta_sol'      => 64,
  'discover'         => 139
}
```
Fuente: https://github.com/activemerchant/active_merchant/blob/master/lib/active_merchant/billing/gateways/decidir.rb

| Medio | Tabla clásica | ActiveMerchant (plataforma nueva) |
|---|---|---|
| Mastercard crédito | **15** | **104** |
| Mastercard débito | **66** | **105** |
| Maestro | **99** | **106** |
| Cabal débito | **67** | **108** |
| Discover | (no figura) | **139** |

Visa (1/31), Amex (65), Diners (8), Naranja (24), Patagonia 365 (55) y Tarjeta Sol (64) **coinciden** en ambas.

> **Acción requerida antes de codificar:** pedirle a Payway la tabla vigente para nuestro `site_id`. Mientras tanto, **modelar el mapeo marca→`payment_method_id` como configuración por tenant en base de datos, no como constantes en código.** Es la única forma de absorber esta ambigüedad sin un deploy.

### 2.3 Cómo determinar el `payment_method_id` en runtime

No hay endpoint de consulta de BIN (**GAP-10**). Las opciones:

1. **Detección de marca en el frontend por rango de BIN**, con una tabla de rangos propia (Visa `4`, Mastercard `51–55` y `2221–2720`, Amex `34`/`37`, Diners `36`/`38`, Cabal, Naranja, etc.), y de ahí al `payment_method_id` configurado para el tenant.
2. **Selección explícita del comprador** ("elegí tu tarjeta") — más feo pero infalible, y es lo que hacen los plugins oficiales de Payway.

**Recomendación:** híbrido. Detección automática por BIN con posibilidad de corrección manual, y siempre mostrando la marca detectada para que el comprador la valide. Es lo que hace Mercado Pago.

---

## 3. Divisas

| Divisa | Descripción | Código API |
|---|---|---|
| AR$ | Pesos Argentinos | `ARS` |
| U$S | Dólares Americanos | `USD` |

Fuente: README del SDK .NET, "Tablas de Referencia / Divisas Aceptadas".

⚠️ En el **request** va en mayúsculas (`"ARS"`), en la **respuesta** vuelve en minúsculas (`"ars"`). Normalizar antes de comparar.

> El SDK Node aclara que el uso de USD está *"legalmente limitado en Argentina"*. Para Tiendafy: solo ARS en el MVP.

---

## 4. Planes de cuotas: modelo de datos y cálculo

Como no hay API, adoptamos el modelo que usan los plugins oficiales. Es simple y probado.

### 4.1 Estructura de un plan

Fuente: https://raw.githubusercontent.com/payway-ar/plugin-woocommerce/master/wc-gateway-payway/includes/class-payway-core-functions.php

```php
$plans[$promo->bank_id][$promo->card_code][] = [
    'fee_period'  => $plan->fee_period,
    'fee_to_send' => $plan->fee_to_send,
    'coefficient' => $plan->coefficient,
    'tea'         => $plan->tea,
    'cft'         => $plan->cft,
    'rule_id'     => $promo->id,
    'rule_name'   => $promo->rule_name
];
```

| Campo | Tipo | Descripción |
|---|---|---|
| `fee_period` | int | **Cuotas que se le muestran al comprador.** Es el divisor del total |
| `fee_to_send` | int | **Valor que se envía en `installments` a Payway.** Puede diferir de `fee_period` (típico en planes Ahora 12/18, donde el emisor espera un código distinto) |
| `coefficient` | decimal | **Multiplicador del total.** `1.0` = sin interés. `1.18` = 18% de recargo |
| `tea` | decimal | Tasa Efectiva Anual. **Solo informativa** (obligación de exhibición) |
| `cft` | decimal | Costo Financiero Total. **Solo informativa** (obligación de exhibición) |
| `rule_id` | int | Id de la promoción que aplicó |
| `rule_name` | string | Nombre de la promoción |

**La distinción `fee_period` ≠ `fee_to_send` es crítica y fácil de pasar por alto.** Es lo que permite modelar planes donde lo que se muestra ("12 cuotas sin interés") no coincide con el código que espera el adquirente.

### 4.2 Reglas de vigencia

El plugin de WooCommerce filtra promociones así:

```sql
promos.is_active = 1
AND promos.from_date <= NOW()
AND promos.to_date >= NOW()
-- más match contra applicable_days (lista de días de la semana)
```

Campos de una promoción: `id`, `rule_name`, `card_id`, `bank_id`, `from_date`, `to_date`, `priority`, `is_active`, `applicable_days`, `fee_plans` (JSON con el array de planes).

Fuente: https://raw.githubusercontent.com/payway-ar/plugin-woocommerce/master/wc-gateway-payway/includes/class-payway-promotion-factory.php

**Nota sobre `priority`:** cuando varias promociones matchean, gana la de mayor prioridad. Hay que implementar ese desempate.

### 4.3 Fórmula exacta de cálculo del total con interés

Fuente: https://raw.githubusercontent.com/payway-ar/plugin-woocommerce/master/wc-gateway-payway/assets/js/frontend/payment.js

```javascript
var coefficient = parseFloat(plan.coefficient),
    charge = 0,
    feePeriod = plan.fee_period,
    installmentPrice = grandTotal / parseInt(feePeriod),
    total = parseFloat(grandTotal);

if (coefficient > 1) {
    charge = parseFloat(parseFloat((total * coefficient) - total));
    installmentPrice = (total + charge) / parseInt(feePeriod);
}
```

Formalizado:

```
recargo        = coefficient > 1 ? total * coefficient - total : 0
total_final    = total + recargo          // == total * coefficient
valor_cuota    = total_final / fee_period
installments   = fee_to_send              // ← lo que va a Payway
amount         = round(total_final * 100) // ← centavos
```

Texto que muestra el plugin al comprador:
```
"{fee_period} x {valor_cuota} ({total_final})"
```
Ejemplo: `"6 x $2.083,33 ($12.500,00)"`

### 4.4 ⚠️ Trampa grande: quién absorbe el costo financiero

Fuente: https://raw.githubusercontent.com/payway-ar/plugin-woocommerce/master/wc-gateway-payway/includes/processors/class-wc-payway-request-order.php

```php
self::AMOUNT => $order->get_total(),
```

El plugin oficial envía a Payway **el total de la orden tal cual, sin aplicar el coeficiente**. El interés se calcula y se muestra en el frontend, y **debe estar ya incorporado al total del pedido** antes de llegar al processor.

**Lo que esto significa para Tiendafy:**

Hay dos modelos de negocio posibles y son incompatibles entre sí. Hay que elegir explícitamente, por tenant:

| Modelo | Qué hace | `amount` enviado |
|---|---|---|
| **A. El comprador paga el interés** | El coeficiente se suma al total de la orden. El comprador ve "$12.500 en 6 cuotas" cuando el carrito valía $10.000 | `total * coefficient` |
| **B. El comercio absorbe el interés** | El comprador paga el precio de lista en cuotas. El comercio recibe menos en la liquidación | `total` (sin coeficiente) |

**En ambos casos el `amount` enviado a Payway debe ser exactamente lo que se le cobra a la tarjeta del comprador.** El coeficiente no se envía como campo separado; Payway no lo conoce. Nosotros somos los responsables de que el total sea el correcto.

> **Riesgo real:** si se recalcula el total en el frontend y se confía en él, se abre un agujero para manipular el monto. **Recalcular siempre server-side** a partir del `rule_id` + `fee_to_send` que manda el browser, y comparar contra el total del carrito. Si no coinciden, rechazar.

Esta es la razón por la que el `<option>` del plugin de WooCommerce lleva el value `rule_id + '-' + cardId + '-' + fee_to_send`: el backend necesita esos tres datos para recalcular.

---

## 5. Consulta de BIN

**No existe endpoint de consulta de BIN en Payway.** Verificado por ausencia en los 5 SDKs oficiales, los 3 plugins y ActiveMerchant.

Lo más cercano es `GET /api/v2/payment-methods/{currencyId}`, pero un issue oficial reporta que devuelve vacío:

> *"Siempre me devuelve vacío con las keys que nos han enviado"* — https://github.com/payway-ar/sdk-php-ventaonline/issues/33 (sin respuesta de Payway)

### Estrategia para armar la grilla de cuotas sin BIN lookup

```
1. El comprador tipea los primeros 6-8 dígitos
2. Frontend resuelve la MARCA por tabla de rangos de BIN local
   (Visa: 4 | MC: 51-55, 2221-2720 | Amex: 34,37 | Diners: 36,38 | ...)
3. Frontend NO puede resolver el BANCO EMISOR de forma confiable
   → si las promociones son por banco, hay que pedirle al comprador
     que elija su banco de una lista (es lo que hace PrestaShop:
     el param `bank` del controlador AJAX es una selección explícita)
4. Con (marca, banco) se consulta la grilla de planes del tenant
5. Se muestran los planes con fee_period, valor de cuota, total, TEA y CFT
```

**Opción a evaluar en fase 2:** contratar un servicio de BIN lookup de terceros para resolver el emisor automáticamente y mejorar la conversión. Fuera de alcance del MVP.

---

## 6. Exhibición obligatoria de TEA y CFT

En Argentina, cuando hay financiación con interés, la exhibición de **TEA** y **CFT** es obligatoria (normativa BCRA de transparencia). Los campos existen en el modelo de planes precisamente por eso, aunque el plugin no los usa en ningún cálculo — son puramente informativos.

**Requisito de UI para Tiendafy:** en la grilla de cuotas, cada plan con `coefficient > 1` debe mostrar TEA y CFT de forma visible. Cargarlos junto con el plan en el panel admin y marcarlos como obligatorios cuando el coeficiente sea mayor a 1.

---

## 7. Planes de gobierno (Ahora 12 / Ahora 18)

El único rastro en el código es el flag booleano `plan_gobierno` del **checkout hosted**:

```java
private boolean plan_gobierno;
```
Fuente: https://cdn.jsdelivr.net/gh/payway-ar/sdk-java-ventaonline@V2.3.0/src/main/java/com/decidir/sdk/dto/checkout/CheckoutRequest.java

En `POST /payments` (API directa) **no hay un flag equivalente**. Existe un campo `plan_id` (string, opcional) en el DTO base del SDK Java, que es el candidato natural, pero no está documentado.

> **GAP:** cómo se informa un plan Ahora 12/18 en la API directa. La hipótesis de trabajo es que se resuelve con `installments = fee_to_send` (donde `fee_to_send` es el código del plan) y/o `plan_id`. **Confirmar con soporte** — es una pregunta específica en `01-resumen-ejecutivo.md`.

Esto refuerza por qué el modelo `fee_period` ≠ `fee_to_send` importa: es exactamente el mecanismo pensado para estos casos.
