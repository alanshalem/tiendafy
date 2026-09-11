# URLs del sistema

Mapa completo de dónde vive cada pieza, en desarrollo y en producción.

## Desarrollo (los puertos "de diseño")

| URL                                    | Qué es                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| http://localhost:3000                  | **Storefront** (Next.js): landing de la plataforma cuando entrás por `localhost`.                              |
| http://`<subdominio>`.localhost:3000 | **Tienda de un merchant** (ej. `volxen.localhost:3000`). `*.localhost` resuelve solo, sin tocar hosts.        |
| http://localhost:5173                  | **Admin** (Vite/React): panel del merchant. Puerto fijo (`strictPort` en `vite.config.ts`). Login con los usuarios de `docs/usuarios-de-prueba.md`.             |
| http://localhost:5080                  | **API** (.NET). Todo el backend, admin y storefront le pegan acá.                                                |
| http://localhost:5080/scalar           | **Documentación interactiva de la API** (Scalar UI).                                                             |
| http://localhost:5080/openapi/v1.json  | Spec OpenAPI cruda.                                                                                                     |
| http://localhost:5080/health           | Health check (DB incluida).                                                                                             |
| localhost:5432                         | **Postgres** (docker `tiendafy-postgres`). User/pass/db: `tiendafy`/`tiendafy`/`tiendafy`. Solo loopback. |
| http://localhost:9000                  | **MinIO S3 API** (imágenes de productos y assets).                                                               |
| http://localhost:9001                  | **MinIO Console** (browser de buckets). Login: `minioadmin`/`minioadmin`.                                     |
| http://localhost:8081                  | **pgAdmin**: gestor visual de la base. Sin login y con el servidor ya conectado (ver `infra/docker/pgadmin/`). |

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
| `/redes`                          | Redes sociales: calendario, posts multi-red y cuentas conectadas.            |
| `/compras`                        | Órdenes de compra, ciclo de importación, landed cost y reposición.           |
| `/configuracion/medios-de-pago`   | Conexión Mercado Pago (acá vuelve el OAuth).                               |
| `/configuracion/mercadolibre`     | Conexión Mercado Libre (acá vuelve el OAuth).                              |
| `/configuracion/medios-de-envio`  | Correo Argentino (MiCorreo) y Zipnova.                                       |
| `/configuracion/facturacion`      | ARCA/AFIP (certificado, punto de venta).                                     |
| `/tenants`                        | Alta y gestión de tiendas (multi-tenant).                                   |
| `/ayuda`                          | Manuales internos por tema (se abre en pestaña nueva).                      |

## Convivir con otro proyecto en la misma máquina

El admin está fijo en **5173** (`strictPort` en `vite.config.ts`) justamente para
no pelearse con Next: cuando el 3000 está ocupado, Next escala solo al 3001 y si
el admin viviera ahí los dos servidores se pisarían.

El storefront sí puede chocar: si otra app (acá `camg-api`) ya tiene el **3000**,
levantalo en otro puerto y avisale al admin dónde quedó.

```powershell
.\dev-up.ps1 -StorefrontPort 3001
```

```bash
# admin/.env.local
VITE_STOREFRONT_ORIGIN=http://{sub}.localhost:3001
```

Sin ese `VITE_STOREFRONT_ORIGIN`, el botón "Ver mi tienda" y el preview del editor
de diseño apuntan a `*.localhost:3000` — donde responde la otra app — y parecen
rotos sin serlo.

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
