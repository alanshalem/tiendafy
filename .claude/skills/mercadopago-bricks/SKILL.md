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
  SDK JS puro, `window.paymentBrickController.unmount()`). Montarlo dos veces
  duplica los iframes.
- Los ad-blockers que bloquean `sdk.mercadopago.com` o
  `secure-fields.mercadopago.com` hacen fallar la inicialización
  (`FIELDS_SETUP_FAILED` o el Brick no aparece): mostrar un aviso, no un error
  genérico.
- Débito no ofrece cuotas: es lo esperado.
- Medios que no son tarjeta (`ticket`, `mercadoPago`) necesitan que el backend
  sepa cobrarlos; hoy Tiendafy cobra tarjeta. Para "Cuenta de Mercado Pago"
  (`mercadoPago`) el Brick necesita además un `preferenceId` creado en el
  backend, y ese medio no usa `amount`: el monto sale de la preference.
- La CSP de la tienda (`storefront/src/lib/csp.ts`) tiene que permitir el SDK
  y lo que él carga: `sdk.mercadopago.com` es solo el cargador; cada Brick
  (`payment.js`, `statusScreen.js` y sus partes) es un `<script>` de
  `https://http2.mlstatic.com/frontend-assets/op-cho-bricks/build/<versión>/components/`
  y sus textos se piden con fetch al mismo host (`script-src` y
  `connect-src`). Mercado Pago no publica la lista: sale de leer el SDK
  (v3.19.0, oct-2026). Iframes y API: `*.mercadopago.com`.

## Status Screen Brick

Muestra el resultado de un pago y resuelve el desafío 3DS. Es lo que
recomienda la guía oficial de 3DS con Bricks, y lo que usa Tiendafy desde el
16-oct-2026 en `storefront/src/components/store/CardChallenge.tsx` cuando
`/pay-onsite` devuelve `challenge` (ver `mercadopago-checkout-api`):

```tsx
import { StatusScreen } from '@mercadopago/sdk-react';
<StatusScreen
  initialization={{
    paymentId,                                   // id de PAGO, no de orden
    additionalInfo: { externalResourceURL, creq }, // three_ds_info del pago
  }}
  locale="es-AR"
  onReady={onReady}
  onError={onError}
/>
```

- Arma en NUESTRA página un `<iframe>` y un `<form method="post">` hacia
  `externalResourceURL` (el ACS del banco emisor, distinto por banco) y lo
  envía solo. Por eso la CSP de `/checkout` abre `frame-src` y `form-action`
  a `https:` (solo esa ruta).
- El desafío tiene que empezar dentro de los 30 s de creado el pago: montarlo
  apenas vuelve el cobro.
- `@mercadopago/sdk-react` vuelve a montar el Brick si cambian
  `initialization`, `customization`, `onReady` u `onError`: memorizarlos
  (`useMemo`/`useCallback`). Montarlo de nuevo repostea el `creq`.
- Al terminar, el iframe del banco manda `postMessage({ status: 'COMPLETE' })`
  a la ventana; el Brick consulta el pago y muestra el resultado. Tiendafy
  escucha ese mensaje para ir a su pantalla de resultado (que consulta la
  orden) y además consulta la orden cada 4 s por si el aviso no llega.
- El iframe del desafío trae un ancho mínimo propio (unos 600 px al leer el
  SDK; la doc no lo dice): en celular, envolverlo en un contenedor con scroll
  horizontal.

## Problemas típicos

| Síntoma | Causa | Solución |
|---|---|---|
| El Brick no aparece | Modo `API` sin `public_key` (conexión vieja) | Reconectar la cuenta |
| `FIELDS_SETUP_FAILED` | Ad-blocker o CSP | Aviso al comprador; revisar CSP |
| Queda "procesando" para siempre | `onSubmit` no devuelve la promesa | `async` y `throw` en el error |
| Dos formularios | Montado dos veces (Strict Mode, re-render con otra key) | Un solo montaje estable |
| Status Screen "no encontrado" | Se pasó otro id | `paymentId` de Mercado Pago |
| El Brick no aparece y la consola habla de CSP | Falta `http2.mlstatic.com` en `script-src`/`connect-src` | Ver `csp.ts` |
| El desafío del banco queda en blanco | `frame-src`/`form-action` sin el ACS del banco (página que no es `/checkout`) | Mostrarlo solo en `/checkout` |
| El desafío se rechaza solo | Empezó más de 30 s después de crear el pago | Montar el Status Screen apenas vuelve el cobro |

Para probar: según la guía de cuentas de prueba, "las integraciones con
Checkout Bricks no soportan cuentas de prueba"; ver `mercadopago-testing-sandbox`.

Docs: <https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/landing>,
Payment Brick: <https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/payment-brick/default-rendering>,
3DS con Bricks: <https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/how-tos/integrate-3ds>
