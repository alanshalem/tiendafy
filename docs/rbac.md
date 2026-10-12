# RBAC — roles y permisos por tienda

**Estado: implementado.** Matriz editable por tienda y excepciones por persona
desde 2026-10-12 (antes era fija en código). Fuente de verdad:
`backend/src/Modules/Identity/Identity.Infrastructure/` (`Permissions.cs`,
`AccessPolicy.cs`, `TeamRules.cs`), con tests `AccessPolicyTests`,
`TeamRulesTests` y `TeamPermissionsTests`.

## El modelo en una frase

Cada miembro de una tienda tiene UN rol; lo que puede hacer se calcula en tres
capas: **lo que el rol trae de fábrica** (en código) → **lo que la tienda le
cambió a ese rol** (tabla `tenant_role_permissions`) → **las excepciones de esa
persona** (tabla `member_permissions`). Cada endpoint del admin exige el
permiso de su funcionalidad. **Deny by default.** El dueño tiene todo, siempre.

## El catálogo de permisos

Una entrada por funcionalidad del panel, en `PermissionCatalog.All`: clave
estable (`orders.refund`), sección, texto, descripción, si es **sensible** (mueve
plata, obligaciones fiscales o da más accesos), si es **solo del dueño**
(`tenant.admin`: dominios, editar y borrar la tienda — no se delega) y su
**requisito** (`orders.refund` necesita `orders.read`; sin el requisito, el
permiso no cuenta). También dice qué roles lo traen de fábrica.

Es la ÚNICA lista: el backend la sirve en `GET /api/v1/members/roles` y el
panel la muestra tal cual. Agregar una funcionalidad es agregar una línea ahí y
proteger sus endpoints con `RequirePermission(Permission.X)`; el panel la
mapea en `admin/src/lib/access.ts` (un test verifica que las claves coincidan).

## Roles

Fijos (`Roles.All`): lo que se edita es qué puede cada uno.

| Rol                     | Rank | De fábrica                                                                                                                              |
| ----------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `owner` (Dueño)         | 3    | Todo, siempre. Su columna no se edita.                                                                                                  |
| `admin` (Administrador) | 2    | Todo menos lo que es solo del dueño.                                                                                                    |
| `vendedor`              | 1    | Ventas (ver, registrar, despachar), presupuestos, atender ML, clientes (ver), chat, mensajes, cupones (ver), estadísticas, stock (ver). |
| `catalogo`              | 1    | Productos, precios y repreciación, stock, costos, publicar en ML.                                                                       |
| `finanzas`              | 1    | Ventas (ver), devoluciones, facturación, tesorería, compras, cobros (ver), costos, estadísticas.                                        |
| `soporte`               | 1    | Ventas (ver), clientes (ver), chat, mensajes, atender ML.                                                                               |

El rol `staff` (de cuando había dos) se migró a `admin`.

## Reglas anti-escalada (`TeamRules`)

- Nadie da ni quita un permiso que no tiene (para roles y para personas).
- Nadie toca a alguien de su rango o más; el dueño toca a todos.
- Solo un dueño nombra o modifica dueños; la tienda nunca queda sin dueño.
- Nadie edita sus propias excepciones.
- Asignar un rol exige que ese rol (como está EN ESTA TIENDA) no pueda más que
  quien lo asigna.
- Cambiar el rol de alguien borra sus excepciones (eran para el rol anterior).

Editar la matriz pide `roles.manage`; las excepciones y altas, `members.manage`.

## Cuentas y tiendas

Cada persona tiene **una sola cuenta** (email + contraseña) para toda la
plataforma; el acceso es **por tienda**: una fila en `tenant_memberships` con
su rol. Sumar a alguien como vendedor en una tienda no le da nada en las demás.
Las contraseñas se guardan hasheadas: nadie (ni el dueño) las ve; quien la
olvida la restablece por email.

Crear una tienda nueva es de quien ya es **dueño** de alguna (`TeamRules.CanCreateStore`;
la única excepción es la primera tienda de una instalación nueva). Editar,
archivar y borrar una tienda es del dueño de **esa** tienda (`tenant.admin`).
Quien crea una tienda queda como su dueño.

## Enforcement (backend)

En `backend/src/Api/Auth/AuthExtensions.cs`:

- `RequirePermission(Permission.X)` — endpoint o grupo.
- `RequireAnyPermission(X, Y)` — lo que comparten dos funcionalidades (el
  estado de la conexión con Mercado Libre).
- `RequirePermissionForWrites(Permission.X)` — grupos mixtos con el
  storefront: los GET son públicos, las escrituras exigen X.

El acceso efectivo lo resuelve `IAccessService` contra la base **en cada
request** (memorizado durante el request): un cambio de la matriz vale desde el
próximo clic, sin volver a entrar. Las denegaciones se loguean (categoría
`Rbac`).

## Registro de actividad

`audit_events`: quién sumó, sacó, cambió el rol, las excepciones o la matriz,
con el texto armado al momento (nombres de ese momento). Se ve en
Configuración → Usuarios; `GET /api/v1/members/activity` (`members.read`).

## El panel

- `GET /api/v1/me/permissions` → permisos efectivos en la tienda activa.
- `admin/src/lib/access.ts`: qué permiso pide cada pantalla (rutas, menú
  lateral, menú de Configuración y buscador salen de ahí).
- Configuración → **Roles y permisos**: la matriz editable.
- Configuración → **Usuarios**: roles, excepciones por persona (botón de
  permisos de cada fila) y el registro.

La autoridad real siempre es la API: el panel solo evita ofrecer lo que va a fallar.
