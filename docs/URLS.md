# URLs y puertos

Dónde vive cada pieza en desarrollo, en el modo todo-en-Docker y en producción.

## Desarrollo (`.\dev-up.ps1`)

| URL                                   | Qué es                                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `http://<subdominio>.localhost:3000`  | Una tienda (Next.js). `*.localhost` resuelve solo, sin tocar el archivo hosts.                                                         |
| http://localhost:3000                 | La tienda de `PRIMARY_STORE_SUBDOMAIN` si está definida en `storefront/.env.local`; si no, "tienda no encontrada".                      |
| http://localhost:5173                 | Panel (Vite). Puerto fijo: `strictPort` en `admin/vite.config.ts`.                                                                     |
| http://localhost:5080                 | API (.NET, perfil `http` de `launchSettings.json`). La usan el panel, la tienda y el e2e.                                               |
| http://localhost:5080/scalar          | Documentación navegable de la API (Scalar). Solo en Development.                                                                       |
| http://localhost:5080/openapi/v1.json | Spec OpenAPI. Solo en Development.                                                                                                     |
| http://localhost:5080/health          | Health check (incluye la base).                                                                                                        |
| http://localhost:5080/version         | Sha del build y entorno.                                                                                                               |
| localhost:5432                        | Postgres 18 (contenedor `tiendafy-postgres`). Usuario, clave y base: `tiendafy`. Solo loopback.                                        |
| http://localhost:9000                 | MinIO, API S3 (imágenes y adjuntos).                                                                                                   |
| http://localhost:9001                 | Consola de MinIO. Login `minioadmin` / `minioadmin`.                                                                                   |
| http://localhost:8081                 | pgAdmin, sin login y con la base ya conectada (`infra/docker/pgadmin/`).                                                               |

Credenciales del panel y de los compradores: [usuarios-de-prueba.md](./usuarios-de-prueba.md).

### Rutas principales del panel

| Ruta                              | Qué es                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/`                               | Inicio de la tienda activa.                                                                               |
| `/ventas`                         | Ventas, facturación y devoluciones (`/ventas/carritos`: abandonados; `/ventas/despacho`: armado y envío). |
| `/productos`                      | Catálogo (`/productos/categorias`, `/inventario`, `/costos`, `/kits`, `/escaner`, `/exportar-importar`, `/listas-de-precios`, `/stock-bajo`). |
| `/presupuestos`                   | Presupuestos.                                                                                             |
| `/clientes`                       | Clientes y su ficha.                                                                                      |
| `/bandeja`                        | Contacto, chat posventa y preguntas y mensajes de Mercado Libre en una sola lista.                        |
| `/estadisticas`                   | Ventas, productos, visitas, tiempo real, cupones y rentabilidad.                                          |
| `/canales/tienda-online/disenios` | Editor de diseño (vista previa de la tienda en un iframe).                                                |
| `/marketing`, `/descuentos`       | Campañas de email y cupones.                                                                              |
| `/mercadolibre`                   | Ventas, preguntas, mensajes y publicaciones de Mercado Libre.                                             |
| `/redes`                          | Redes sociales: calendario, posts y cuentas conectadas.                                                   |
| `/compras`, `/proveedores`        | Órdenes de compra, importación y costo puesto; proveedores.                                               |
| `/tesoreria`, `/cuentas-corrientes` | Cajas y bancos; cuentas corrientes de clientes y proveedores.                                           |
| `/configuracion/medios-de-pago`   | Mercado Pago (acá vuelve su OAuth) y Payway.                                                              |
| `/configuracion/mercadolibre`     | Conexión con Mercado Libre (acá vuelve su OAuth).                                                         |
| `/configuracion/medios-de-envio`  | Envíos propios, Correo Argentino, Andreani y Zipnova.                                                     |
| `/configuracion/facturacion`      | ARCA: certificado, CUIT y punto de venta.                                                                 |
| `/configuracion/usuarios`, `/configuracion/roles` | Equipo y permisos por rol.                                                                |
| `/tenants`                        | Mis tiendas: alta y edición.                                                                              |
| `/ayuda`                          | Centro de ayuda.                                                                                          |

## Cuando el 3000 está ocupado

El panel está fijo en 5173 para no pelearse con Next, que si encuentra el 3000
tomado se muda solo al siguiente puerto libre. Si otra app de la máquina ya
usa el 3000, movés la tienda:

```powershell
.\dev-up.ps1 -StorefrontPort 3001
```

`dev-up.ps1` escribe `VITE_STOREFRONT_ORIGIN=http://{sub}.localhost:3001` en
`admin/.env.local` (salvo que ya apunte a otro lado a propósito, como un
túnel). Sin eso, "Ver mi tienda" y la vista previa del editor apuntan al 3000,
donde responde la otra app.

## Todo en Docker (`.\dev-up.ps1 -Docker`)

`infra/docker/docker-compose.dev.yml` + `docker-compose.app.yml`, para demo o
smoke (sin hot-reload):

| Pieza  | Dirección             |
| ------ | --------------------- |
| Tienda | `127.0.0.1:3000`      |
| Panel  | `127.0.0.1:3001` (ojo: no es el 5173) |
| API    | `127.0.0.1:5080`      |

Postgres, MinIO y pgAdmin, igual que en desarrollo.

## Producción

El Caddy del borde (`infra/edge/`, puertos 80/443) enruta por dominio a los
servicios del stack, que escuchan solo en `127.0.0.1` (puertos en
`infra/docker/.env.prod`). Dominio de la plataforma: `puenteoriente.com.ar`
(`TIENDAFY_DOMAIN` en `infra/edge/.env`, `STACK_DOMAIN` en `.env.prod`).

| URL                                | Qué es                                                                                     | Interno          |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ---------------- |
| https://puenteoriente.com.ar       | La tienda principal (`PRIMARY_STORE_SUBDOMAIN`). `www.` redirige acá.                      | `127.0.0.1:3000` |
| `https://<subdominio>.puenteoriente.com.ar` | Cada tienda.                                                                      | `127.0.0.1:3000` |
| https://admin.puenteoriente.com.ar | Panel.                                                                                     | `127.0.0.1:8090` |
| https://api.puenteoriente.com.ar   | API; acá llegan los webhooks de Mercado Pago, Mercado Libre y Resend.                      | `127.0.0.1:5080` |
| `https://<dominio-propio>`         | Dominio propio de una tienda: Caddy saca el certificado en la primera visita, si la API confirma que el dominio es de una tienda. | `127.0.0.1:3000` |

Paso a paso del servidor: [PUBLICAR-EN-LA-VPS.md](./PUBLICAR-EN-LA-VPS.md).
Deploy y variables: [DEPLOY.md](./DEPLOY.md) y [CONFIGURACION.md](./CONFIGURACION.md).
