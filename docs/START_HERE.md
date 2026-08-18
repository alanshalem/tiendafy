# Tiendafy — START HERE

Mapa de la documentación. El proyecto está **construido y funcionando** (no es
un plano): 18 módulos backend, storefront y admin completos, CI verde, deploy
reproducible. Este archivo te dice qué leer según lo que necesites.

## En 2 minutos

- **Qué es**: SaaS e-commerce multi-tenant para merchants de Argentina/LATAM
- **Stack**: .NET 10 (backend modular) + Next.js 16 (storefront SSR) + React+Vite (admin SPA)
- **Multi-tenant**: DB compartida + `tenant_id` en cada fila + query filters globales de EF por módulo + tests de aislamiento
- **Estado**: funcional de punta a punta — venta real con Mercado Pago, factura ARCA, envío con Correo Argentino, emails/WhatsApp automáticos

## Qué leer según lo que busques

| Necesito… | Leé |
|---|---|
| Levantar el entorno y ver algo andando | [../README.md](../README.md) → Quick start |
| Todas las API keys/secretos/variables (dev y prod) | [CONFIGURACION.md](./CONFIGURACION.md) — qué conseguir, dónde se consigue y dónde va |
| Entender TODO el sistema de un vistazo | [ARQUITECTURA-VISUAL.md](./ARQUITECTURA-VISUAL.md) — diagramas Mermaid: piezas, integraciones y el flujo de una venta |
| Loguearme en dev | [usuarios-de-prueba.md](./usuarios-de-prueba.md) |
| Ver las 130+ rutas de la API | http://localhost:5080/scalar/v1 (con la API corriendo) |
| Deployar a producción | [DEPLOY.md](./DEPLOY.md) — imágenes, compose.prod, Caddy, backups, variables |
| Entender los pagos | [payments-mercadopago.md](./payments-mercadopago.md) — OAuth marketplace, webhooks, refunds |
| Entender roles y permisos | [rbac.md](./rbac.md) — roles, matriz y enforcement (fuente de verdad: `Permissions.cs`) |
| Entender el chat posventa | [support-chat.md](./support-chat.md) |
| Construir UI nueva | [DESIGN.md](./DESIGN.md) (reglas de diseño) |
| Agregar un módulo | [guides/adding-a-module.md](./guides/adding-a-module.md) — receta basada en módulos reales |
| Por qué cada decisión de arquitectura | [adr/](./adr/) — monolito .NET, Next+Vite, multi-tenancy |

> Los documentos de planificación de junio 2026 (blueprint, checklist de
> construcción, investigación ARCA) se eliminaron: el código y esta doc son la
> fuente de verdad. Si necesitás ese contexto, está en el historial de git.
> La explicación de facturación "en criollo" vive ahora en el centro de ayuda
> del admin (`/ayuda/fiscal`).

## Los módulos del backend (los 18 reales)

`Tenancy` (tiendas, dominios, resolve por host) · `Identity` (staff, RBAC, verificación email) ·
`Catalog` (productos, variantes, categorías, CSV) · `Inventory` (stock, reservas anti-oversell) ·
`Checkout` (sesiones, envíos manuales + Correo Argentino) · `Orders` (órdenes, reembolsos, fulfillment) ·
`Payments` (Mercado Pago OAuth + webhooks) · `Fiscal` (ARCA: CAE, PDF con QR, NC) ·
`Themes` (editor draft/published) · `Customers` (compradores, favoritos, mensajes) ·
`Notifications` (email/WhatsApp por plantilla + contadores) · `Analytics` (visitas) ·
`Media` (imágenes/videos a MinIO/S3) · `Content` (páginas CMS) · `Discounts` (cupones) ·
`Support` (chat posventa) · `MercadoLibre` (canal ML: ventas, preguntas, mensajes, stock unificado, publicar) ·
`Purchasing` (compras a proveedores, ciclo de importación, landed cost, reposición)

Cada módulo: `{Module}.Contracts` (interfaz pública) / `.Core` (dominio+features) /
`.Infrastructure` (persistencia, DbContext propio con filtro de tenant). Los módulos
solo se hablan por Contracts.

## Preguntas frecuentes

**P: ¿Por qué .NET y no Node?** → [adr/0001-dotnet-monolith.md](./adr/0001-dotnet-monolith.md)

**P: ¿Por qué DB compartida entre tenants?** → [adr/0003-postgres-rls.md](./adr/0003-postgres-rls.md). Nota: el ADR propone RLS; lo implementado son query filters de EF + tests de aislamiento — el trade-off está anotado en el ADR.

**P: ¿Por qué Next.js + Vite y no un solo frontend?** → [adr/0002-next-and-vite.md](./adr/0002-next-and-vite.md)

**P: ¿Cómo se evita el data leak entre tenants?** → Query filters globales por DbContext + middleware de membresía en toda escritura admin + `X-Tenant-Id` verificado contra la sesión + tests de integración (`TenantIsolationTests`) contra Postgres real.

**P: ¿Dónde están los secretos?** → user-secrets en dev, env vars en prod. Credenciales de merchants (MP/ARCA/WhatsApp/MiCorreo) cifradas con DataProtection en la DB; el keyring vive en el volumen `dpkeys`.
