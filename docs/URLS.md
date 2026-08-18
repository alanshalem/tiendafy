# URLs del sistema

Mapa completo de dónde vive cada pieza, en desarrollo y en producción.

## Desarrollo (los puertos "de diseño")

| URL                                    | Qué es                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| http://localhost:3000                  | **Storefront** (Next.js): landing de la plataforma cuando entrás por `localhost`.                              |
| http://`<subdominio>`.localhost:3000 | **Tienda de un merchant** (ej. `volxen.localhost:3000`). `*.localhost` resuelve solo, sin tocar hosts.        |
| http://localhost:3001                  | **Admin** (Vite/React): panel del merchant. Login con los usuarios de `docs/usuarios-de-prueba.md`.             |
| http://localhost:5080                  | **API** (.NET). Todo el backend, admin y storefront le pegan acá.                                                |
| http://localhost:5080/scalar           | **Documentación interactiva de la API** (Scalar UI).                                                             |
| http://localhost:5080/openapi/v1.json  | Spec OpenAPI cruda.                                                                                                     |
| http://localhost:5080/health           | Health check (DB incluida).                                                                                             |
| localhost:5432                         | **Postgres** (docker `tiendafy-postgres`). User/pass/db: `tiendafy`/`tiendafy`/`tiendafy`. Solo loopback. |
| http://localhost:9000                  | **MinIO S3 API** (imágenes de productos y assets).                                                               |
| http://localhost:9001                  | **MinIO Console** (browser de buckets). Login: `minioadmin`/`minioadmin`.                                     |

Rutas importantes dentro del admin (SPA, todas cuelgan de la URL del admin):

| Ruta                                | Qué es                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `/`                               | Dashboard con métricas de la tienda.                                        |
| `/ventas`                         | Pedidos, facturación ARCA y reembolsos (`/ventas/carritos`: abandonados). |
| `/productos`                      | Catálogo (`/categorias`, `/inventario`, `/costos`, `/kits`, `/escaner`, `/exportar-importar`). |
| `/estadisticas`                   | Ventas, productos, visitas, tiempo real, cupones, rentabilidad.              |
| `/canales/tienda-online/disenios` | Editor de tema (preview en vivo de la tienda vía iframe).                   |
| `/marketing`                      | Campañas de email y segmentos;`/descuentos`: cupones.                     |
| `/mercadolibre`                   | Ventas, preguntas, mensajes y publicaciones de ML.                           |
| `/compras`                        | Órdenes de compra, ciclo de importación, landed cost y reposición.           |
| `/configuracion/medios-de-pago`   | Conexión Mercado Pago (acá vuelve el OAuth).                               |
| `/configuracion/mercadolibre`     | Conexión Mercado Libre (acá vuelve el OAuth).                              |
| `/configuracion/medios-de-envio`  | Correo Argentino (MiCorreo) y Zipnova.                                       |
| `/configuracion/facturacion`      | ARCA/AFIP (certificado, punto de venta).                                     |
| `/tenants`                        | Alta y gestión de tiendas (multi-tenant).                                   |
| `/ayuda`                          | Manuales internos por tema (se abre en pestaña nueva).                      |

## ⚠️ Hoy en esta máquina (workaround por conflicto de puertos)

Otro proyecto (`camg-api`, docker ajeno a Tiendafy) ocupa el **3000**. Mientras corra:

| URL                   | Qué es                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| http://localhost:3001 | Storefront (corrido de 3000 → 3001). Por eso "el admin" en 3001 muestra la landing.                   |
| http://localhost:5173 | **Admin** (arrancado con `npx vite --port 5173` porque su puerto 3001 lo tomó el storefront). |

Costo del workaround: los links "ver tienda" del admin y el preview del editor de tema
apuntan a `*.localhost:3000` (donde responde camg-api), así que no funcionan.
Para volver al mapa de diseño: parar camg-api (`docker stop <container>`),
storefront con `npm run dev` (toma 3000) y admin con `npm run dev` (toma 3001).

## Stack local dockerizado (`infra/docker/docker-compose.app.yml`)

Simula prod en local: storefront en `127.0.0.1:3000`, admin en `127.0.0.1:3001`
(nginx interno en 8080), API en `127.0.0.1:5080`.

## Producción (Caddy enruta por host, TLS automático)

`PLATFORM_DOMAIN` se define en `.env.prod`. Ejemplo con `tiendafy.com.ar`:

| URL                                      | Qué es                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| https://tiendafy.com.ar                  | Landing de la plataforma (storefront).                                                                        |
| https://`<subdominio>`.tiendafy.com.ar | Tienda de cada merchant.                                                                                      |
| https://admin.tiendafy.com.ar            | Panel admin.                                                                                                  |
| https://api.tiendafy.com.ar              | API pública (webhooks de MP/ML/Resend pegan acá).                                                           |
| https://`<dominio-propio>`             | Dominio propio de un merchant (ej. cking.com.ar): Caddy emite el certificado on-demand y sirve el storefront. |

## Referencias

- Usuarios y tiendas de prueba: `docs/usuarios-de-prueba.md`
- Cómo levantar todo: `docs/START_HERE.md`
- Variables de entorno: `docs/CONFIGURACION.md`
- Deploy: `docs/DEPLOY.md`
