---
name: mercadopago-bricks
description: Payment Brick y Status Screen Brick de Mercado Pago con @mercadopago/sdk-react en la tienda (Next). Usala al tocar CheckoutClient.tsx o cuando el Brick no aparece, queda cargando o falla con FIELDS_SETUP_FAILED.
---

# Mercado Pago: Bricks en la tienda

Tiendafy usa el **Payment Brick** de `@mercadopago/sdk-react` en
`storefront/src/components/store/CheckoutClient.tsx` cuando la tienda está en
modo `API`. La `public_key` es la de la tienda conectada
(`GET /api/v1/payments/mercadopago/public-config`), nunca una de la
plataforma.

## Payment Brick

```tsx
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';

initMercadoPago(publicKey, { locale: 'es-AR' });   // una vez, en el cliente

<Payment
  initialization={{ amount: total, payer: { email } }}
  customization={{ paymentMethods: { creditCard: 'all', debitCard: 'all' } }}
  onSubmit={async ({ formData }) => {
    // formData: token, payment_method_id, issuer_id, installments, payer.identification…
    const res = await postPayment('/pay-onsite', formData);
    if (!res.ok) throw new Error('pago rechazado');   // rechazar la promesa
  }}
  onError={(err) => { /* FIELDS_SETUP_FAILED, etc. */ }}
  onReady={() => setBrickReady(true)}
/>
```

## Reglas duras

- **`onSubmit` devuelve una promesa** que se resuelve o rechaza cuando termina
  el POST al backend. Si no devuelve nada, el Brick queda "procesando".
- `amount` es informativo para el Brick: el backend cobra el total que calcula
  él (`mercadopago-checkout-api`).
- Solo en el cliente (`'use client'`): el SDK toca `window`. Un `initMercadoPago`
  por página; si cambia la `public_key` (otra tienda), recargar.
- Desmontar al salir (el componente de React lo hace al desmontarse; con el
  SDK JS puro, `brick.unmount()`). Montarlo dos veces duplica los iframes.
- Los ad-blockers que bloquean `sdk.mercadopago.com` o
  `secure-fields.mercadopago.com` hacen fallar la inicialización
  (`FIELDS_SETUP_FAILED` o el Brick no aparece): mostrar un aviso, no un error
  genérico.
- Débito no ofrece cuotas: es lo esperado.
- Medios que no son tarjeta (`ticket`, `mercadoPago`) necesitan que el backend
  sepa cobrarlos; hoy Tiendafy cobra tarjeta. Para "dinero en cuenta" el Brick
  necesita además un `preferenceId` (Checkout Pro).
- La CSP de la tienda tiene que permitir los dominios del SDK (scripts, frames
  y conexiones a `*.mercadopago.com` y `*.mercadolibre.com`).

## Status Screen Brick

Muestra el resultado de un pago y resuelve el challenge 3DS:

```tsx
import { StatusScreen } from '@mercadopago/sdk-react';
<StatusScreen initialization={{ paymentId }} />   // id de PAGO, no de orden
```

Si algún día se activa 3DS (`three_d_secure_mode`), es la forma más simple de
mostrar el challenge cuando el pago vuelve `pending_challenge`.

## Problemas típicos

| Síntoma | Causa | Solución |
|---|---|---|
| El Brick no aparece | Modo `API` sin `public_key` (conexión vieja) | Reconectar la cuenta |
| `FIELDS_SETUP_FAILED` | Ad-blocker o CSP | Aviso al comprador; revisar CSP |
| Queda "procesando" para siempre | `onSubmit` no devuelve la promesa | `async` y `throw` en el error |
| Dos formularios | Montado dos veces (Strict Mode, re-render con otra key) | Un solo montaje estable |
| Status Screen "no encontrado" | Se pasó otro id | `paymentId` de Mercado Pago |

Docs: <https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/landing>
