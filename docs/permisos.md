# Permisos: roles y excepciones por tienda

**Estado: implementado.** Matriz editable por tienda y excepciones por persona
desde 2026-10-12 (antes era fija en código). Fuente de verdad:
`backend/src/Modules/Identity/Identity.Infrastructure/` (`Permissions.cs`,
`Roles.cs`, `AccessPolicy.cs`, `TeamRules.cs`, `AccessService.cs`), con tests
`AccessPolicyTests` y `TeamRulesTests` (unitarios), `TeamPermissionsTests` y
`EndpointPermissionTests` (integración).

Esto gobierna solo el panel. El comprador de la tienda no tiene roles: su
sesión es otra (cookie por tienda, `/api/v1/shop/*`) y solo ve lo suyo.

## El modelo en una frase

Cada miembro de una tienda tiene UN rol; lo que puede hacer se calcula en tres
capas: **lo que el rol trae de fábrica** (en código) → **lo que la tienda le
cambió a ese rol** (tabla `tenant_role_permissions`) → **las excepciones de esa
persona** (tabla `member_permissions`). Cada endpoint del admin exige el
permiso de su funcionalidad. **Deny by default.** El dueño tiene todo, siempre.

## El catálogo de permisos

Una entrada por funcionalidad del panel, en `PermissionCatalog.All` (39
permisos en 10 secciones: Estadísticas, Ventas, Mercado Libre, Catálogo,
Clientes, Marketing, Tienda online, Finanzas y facturación, Configuración y
Equipo): clave
estable (`orders.refund`), sección, texto, descripción, si es **sensible** (mueve
plata, obligaciones fiscales o da más accesos), si es **solo del dueño**
(`tenant.admin`: dominios, editar y borrar la tienda; `ai.config`: claves,
modelos, tope y consumo de la IA — no se delegan) y su
**requisito** (`orders.refund` necesita `orders.read`; sin el requisito, el
permiso no cuenta). También dice qué roles lo traen de fábrica.

Es la ÚNICA lista: el backend la sirve en `GET /api/v1/members/roles` y el
panel la muestra tal cual. Agregar una funcionalidad es:

1. Agregar el valor al enum `Permission` (al final: el orden del enum no se
   corre) y su línea en `PermissionCatalog.All`.
2. Proteger sus endpoints con `RequirePermission(Permission.X)`.
   `EndpointPermissionTests` recorre todas las rutas de la API y falla si una
   no exige un permiso y tampoco está en su lista de excepciones con motivo
   (la tienda pública, el comprador, el login, los webhooks).
3. Sumar la clave a `PERMISSION_KEYS` en `admin/src/lib/access.ts` y decir qué
   pantalla la pide. `access.test.ts` exige que las claves sean las mismas del
   backend y en el mismo orden (las compara contra `test-fixtures/api.json`,
   así que hay que regenerar las fixtures con `pnpm fixtures:api`).

## Inteligencia artificial: dos tipos de permiso

`ai.config` (`Permission.AiConfig`, sensible y solo del dueño) cubre la pantalla
Configuración → Inteligencia artificial entera, consumo incluido: quien tiene
una clave puede gastar plata del dueño. No lo trae ningún rol de fábrica, ni
siquiera `admin`.

**Usar** una función de IA no pide `ai.config` sino el permiso de esa función
(por ejemplo, `catalog.write` para la descripción de un producto). El mapa vive
en un solo lugar, `backend/src/Api/Ai/AiTaskPermissions.cs`, y lo usan
`GET /ai/status` (así el panel oculta el botón con el código `Ai.Denied`) y los
endpoints de cada función. El aviso de tope en Inicio lo ve solo quien tiene
`ai.config`. Más en [integraciones/ia.md](./integraciones/ia.md).

El asistente de datos ("Preguntale a tu tienda") pide `stats.read` y ofrece al
modelo solo las herramientas que el permiso de cada una deja ver, con las
excepciones de la persona incluidas: `resumen_ventas` y `productos_mas_vendidos`
(`stats.read`), `carritos_abandonados` (`orders.read`), `rentabilidad`
(`costs.read`), `stock_bajo` (`inventory.read`), `sugerencias_de_reposicion` y
`ordenes_de_compra` (`purchasing.manage`) y `resumen_clientes` (`customers.read`).
Un vendedor de fábrica recibe cinco; sin `costs.read` no hay rentabilidad.

## Roles

Fijos (`Roles.All`): lo que se edita es qué puede cada uno.

| Rol                     | Rank | De fábrica                                                                                                                              |
| ----------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `owner` (Dueño)         | 3    | Todo, siempre. Su columna no se edita.                                                                                                  |
| `admin` (Administrador) | 2    | Todo menos lo que es solo del dueño.                                                                                                    |
| `vendedor`              | 1    | Ventas (ver, registrar, despachar), presupuestos, atender ML, clientes (ver), chat, mensajes, reseñas, cupones (ver), estadísticas, stock (ver). |
| `catalogo`              | 1    | Productos, precios y repreciación, stock, costos, publicar en ML.                                                                       |
| `finanzas`              | 1    | Ventas (ver), devoluciones, facturación, tesorería, compras, cobros (ver), costos, estadísticas, clientes (ver), cupones (ver), stock (ver). |
| `soporte`               | 1    | Ventas (ver), clientes (ver), chat, mensajes, reseñas, atender ML.                                                                      |

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

Dos chequeos no usan esos helpers, a propósito: las rutas
`/api/v1/tenants/{id}` (editar, archivar, activar, borrar) piden `tenant.admin`
sobre la tienda del id y no la del header, y `GET /api/v1/theme/draft` pide
`content.write` salvo que llegue con el token de preview firmado del editor.

El acceso efectivo lo resuelve `IAccessService` contra la base **en cada
request** (memorizado durante el request): un cambio de la matriz vale desde el
próximo clic, sin volver a entrar. Las denegaciones se loguean (categoría
`Rbac`).

## Registro de actividad

`audit_events`: quién sumó, sacó, cambió el rol, las excepciones o la matriz,
con el texto armado al momento (nombres de ese momento). Se ve en
Configuración → Usuarios; `GET /api/v1/members/activity` (`members.read`).

## El panel

- `GET /api/v1/me/permissions` → rol, permisos efectivos en la tienda activa
  y si la persona tiene excepciones propias (`customized`).
- `admin/src/lib/access.ts`: qué permiso pide cada pantalla (rutas, menú
  lateral, menú de Configuración y buscador salen de ahí).
- Configuración → **Roles y permisos**: la matriz editable.
- Configuración → **Usuarios**: roles, excepciones por persona (botón de
  permisos de cada fila) y el registro.

La autoridad real siempre es la API: el panel solo evita ofrecer lo que va a fallar.
