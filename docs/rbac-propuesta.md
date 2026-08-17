# RBAC — roles y permisos por tienda

**Estado: IMPLEMENTADO** (2026-07-23). Fuente de verdad de la matriz:
`Identity.Infrastructure/Permissions.cs` (+ tests `RolePermissionsTests`).
Enforcement: `RequirePermission` / `RequirePermissionForWrites` en
`Api/Auth/AuthExtensions.cs`; el front consume `GET /api/v1/me/permissions`.
Los "staff" legacy equivalen a admin.

## Punto de partida (estado previo, histórico)

- `TenantMembership(UserId, TenantId, Role)` con `Role` como string; en la
  práctica solo existe `owner` (`RoleOwner`). `RequireTenantMembership` chequea
  "es miembro" (binario) y `RequireTenantOwner` chequea "es owner".
- Consecuencia: cualquier miembro no-owner tiene HOY los mismos permisos que el
  dueño en casi todo el panel (salvo gestión de staff). No hay granularidad.

## Roles propuestos

| Rol | A quién representa | Resumen |
|---|---|---|
| **owner** | Dueño del negocio | Todo, incluida facturación del plan, dominios, borrar la tienda y gestionar usuarios |
| **admin** | Gerente / mano derecha | Todo lo operativo + configuración, sin plan/borrado de tienda ni gestión de owners |
| **vendedor** | Ventas / atención al cliente | Órdenes (ver, fulfillar), clientes, chat posventa, mensajes. Sin refunds ni configuración |
| **catalogo** | Cargador de productos / fotógrafo | Productos, categorías, inventario, media, import CSV. Nada de ventas ni clientes |
| **finanzas** | Contador / administración | Solo lectura de ventas y estadísticas + ejecutar refunds + (futuro) facturación ARCA. Sin tocar catálogo ni configuración |
| **soporte** | Atención posventa dedicada | Chat posventa y mensajes de contacto; lectura de órdenes (contexto). Nada más |
| **platform-admin** | Staff de Tiendafy (super-admin) | Cross-tenant: gestión de tenants, planes, impersonación con auditoría. NO es un rol de tienda: vive aparte (hoy: página Tenants) |

Principios:
- **Deny by default**: un rol solo puede lo que su matriz permite.
- **owner ≥ admin ≥ resto**: jerarquía simple; sin permisos custom por usuario
  en v1 (evita explosión de combinaciones — se puede sumar después).
- Un usuario puede tener roles distintos en tiendas distintas (ya soportado por
  TenantMembership).

## Matriz de permisos

`V` = ver · `E` = editar/crear/borrar · `—` = sin acceso

| Área | owner | admin | vendedor | catalogo | finanzas | soporte |
|---|---|---|---|---|---|---|
| Catálogo (productos, categorías, variantes) | E | E | V | E | V | — |
| Inventario | E | E | V | E | V | — |
| Import/Export CSV | E | E | — | E | — | — |
| Media (imágenes) | E | E | — | E | — | — |
| Órdenes: ver | V | V | V | — | V | V |
| Órdenes: fulfillar (marcar enviada) | E | E | E | — | — | — |
| **Órdenes: reembolsar** | E | E | — | — | E | — |
| Clientes | E | E | V | — | V | V |
| Chat posventa | E | E | E | — | — | E |
| Mensajes de contacto | E | E | E | — | — | E |
| Descuentos/cupones | E | E | V | — | V | — |
| Estadísticas | V | V | V | — | V | — |
| Páginas (CMS) / Tema | E | E | — | — | — | — |
| **Config: medios de pago (conectar MP, modo)** | E | E | — | — | V | — |
| Config: envíos, emails, checkout | E | E | — | — | — | — |
| **Usuarios y roles de la tienda** | E | E(1) | — | — | — | — |
| Dominios / plan / borrar tienda | E | — | — | — | — | — |
| Facturación ARCA (futuro) | E | V | — | — | E | — |

(1) admin puede invitar/gestionar roles operativos pero NO tocar owners ni
auto-elevarse.

## Permisos sensibles (protección extra)

1. **Reembolsos** — mueven plata. Además del rol: auditoría (ya existe
   `payment_refunds` con requestedBy), y a futuro límite configurable por rol
   (p.ej. finanzas hasta $X sin aprobación del owner).
2. **Credenciales de pago (conectar/desconectar MP, cambiar modo)** — un
   atacante podría redirigir cobros. Solo owner/admin; considerar re-auth
   (pedir password de nuevo) para desconectar.
3. **Gestión de usuarios** — vía de escalación. Regla dura: nadie puede
   asignar un rol superior al propio; solo owner gestiona owners.
4. **Dominios** — phishing/secuestro de tienda. Solo owner.
5. **Certificados ARCA (futuro)** — material criptográfico fiscal. Solo
   owner + finanzas, cifrado como los tokens MP.

## Implementación (tal como se hizo; se conserva como registro)

1. `Role` pasa de string libre a enum persistido como string:
   `owner|admin|vendedor|catalogo|finanzas|soporte` (compatible: los `owner`
   existentes no cambian).
2. Matriz en código como `Permission` enum + `RolePermissions` estático (sin
   tabla en v1: la matriz es política de producto, no dato del tenant).
3. Nuevo filtro `RequirePermission(Permission.X)` que reemplaza gradualmente a
   `RequireTenantMembership` endpoint por endpoint (empezando por refunds,
   pagos y usuarios — los sensibles).
4. El front consume `GET /me/permissions` (lista efectiva para el tenant
   activo) y oculta secciones del menú; la autoridad real siempre es la API.
5. Auditoría: log estructurado `user, tenant, permission, endpoint` en cada
   denegación (detección de intentos de escalación).

## Preguntas abiertas para decidir

- ¿`admin` puede ver estadísticas de facturación del plan (costos Tiendafy) o
  eso es solo owner?
- ¿Vendedor puede crear descuentos o solo verlos? (propuse solo ver)
- ¿Hace falta un rol de "solo lectura total" (auditor externo)?
- ¿Límite de monto para refunds de `finanzas` en v1 o después?
