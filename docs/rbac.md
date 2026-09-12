# RBAC — roles y permisos por tienda

**Estado: implementado** (2026-07-23). Fuente de verdad de la matriz:
`backend/src/Modules/Identity/Identity.Infrastructure/Permissions.cs`
(+ tests `RolePermissionsTests`). Este doc describe el sistema tal como
funciona; el razonamiento de diseño previo quedó en el historial de git
(`rbac-propuesta.md`).

## El modelo en una frase

Cada miembro de una tienda tiene UN rol; cada rol mapea a un conjunto fijo de
permisos (`Permission` enum, 23 permisos); cada endpoint del admin exige el
permiso que corresponde. **Deny by default**: lo que la matriz no otorga, no se
puede. La matriz es política de producto y vive en código, no en la DB.

## Roles

| Rol | Rank | Qué puede |
| --- | --- | --- |
| `owner` | 3 | Todo, incluido `TenantAdmin` (dominios, plan, borrar la tienda). |
| `admin` | 2 | Todo menos `TenantAdmin`. |
| `staff` (legacy) | 2 | Equivale a `admin` — los staff pre-RBAC operaban todo el panel. |
| `vendedor` | 1 | Pedidos (ver + despachar), clientes, chat, mensajes, cupones (ver), stats, stock (ver). |
| `catalogo` | 1 | Catálogo (escribir) + inventario (ver y escribir). |
| `finanzas` | 1 | Pedidos (ver + **reembolsar**), config de pagos (ver), facturación ARCA (config + emitir), compras/importaciones, **tesorería y cuentas corrientes**, clientes/cupones/stats/stock (ver). |
| `soporte` | 1 | Pedidos (ver), clientes (ver), chat posventa, mensajes de contacto. |

`Rank` gobierna la gestión de miembros: nadie asigna un rol por encima del
propio (`MembersManage` + jerarquía).

## Permisos sensibles

Marcados en el enum con comentario: `OrdersRefund` (mueve plata),
`PaymentsConfigWrite` (conectar/desconectar MP), `MembersManage` (vía de
escalación), `FiscalConfig`/`FiscalEmit` (obligaciones fiscales),
`Finance` (mueve saldos de caja y deuda de clientes y proveedores),
`TenantAdmin` (solo owner).

## Enforcement (backend)

En `backend/src/Api/Auth/AuthExtensions.cs`:

- `RequirePermission(Permission.X)` — todo el grupo de endpoints exige X.
- `RequirePermissionForWrites(Permission.X)` — los GET pasan con membership;
  POST/PUT/PATCH/DELETE exigen X (patrón de catálogo: todos ven, `catalogo`
  escribe).

Las lecturas públicas del storefront (catálogo, tema publicado, CMS) **no**
pasan por RBAC — esto gobierna exclusivamente la superficie admin.

## El front

`GET /api/v1/me/permissions` devuelve la lista efectiva del usuario para el
tenant activo como claves wire estables (`orders.refund`, `catalog.write`, …
— `WireKey` en Permissions.cs). El admin oculta secciones del menú según eso,
pero la autoridad real siempre es la API.

## Auditoría

Cada denegación se loggea estructurada (user, tenant, permiso, endpoint) para
detectar intentos de escalación.

## Cómo agregar un permiso nuevo

1. Sumarlo al enum `Permission` + su `WireKey`.
2. Otorgarlo en la matriz a los roles que corresponda.
3. Exigirlo en el endpoint (`RequirePermission[ForWrites]`).
4. `RolePermissionsTests` valida la matriz; el front lo consume solo.
