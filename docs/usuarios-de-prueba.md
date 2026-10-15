# Usuarios de prueba

Cuentas que la API siembra al arrancar en **Development** (en Production no
existen). Todas usan la contraseña `password123`.

## Panel: una cuenta por rol

`backend/src/Api/Startup/DevAdminSeeder.cs` crea una cuenta por rol y la suma
a **todas** las tiendas de la base, para ver el panel como lo ve cada uno.

| Rol           | Email                          | Qué puede, con los permisos de fábrica                                                              |
| ------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| Dueño         | `admin@tiendafy.local`         | Todo. Es la que usa el e2e (`e2e/tests/_helpers.ts`)                                                |
| Dueño         | `duenio@tiendafy.local`        | Todo (un segundo dueño, para probar las reglas entre dueños)                                        |
| Administrador | `administrador@tiendafy.local` | Todo menos dominios, editar y borrar la tienda (eso es solo del dueño)                              |
| Vendedor      | `vendedor@tiendafy.local`      | Ventas (registrar y despachar), presupuestos, atender Mercado Libre, clientes, chat, reseñas, estadísticas; ve stock y cupones |
| Catálogo      | `catalogo@tiendafy.local`      | Productos, listas de precios, stock, costos y publicaciones de Mercado Libre                        |
| Finanzas      | `finanzas@tiendafy.local`      | Ventas y devoluciones, facturación ARCA, tesorería, compras, costos y estadísticas                   |
| Soporte       | `soporte@tiendafy.local`       | Chat posventa, mensajes, reseñas, atender Mercado Libre; ve ventas y clientes                       |

La matriz completa está en
`backend/src/Modules/Identity/Identity.Infrastructure/Permissions.cs` (ver
[rbac.md](./rbac.md)). Si cambiás qué puede un rol desde Configuración → Roles y permisos,
estas cuentas lo reflejan al toque.

El sembrado crea lo que falta y no pisa nada:

- Si le cambiás el rol a una de estas cuentas, reiniciar la API lo respeta.
- Si la sacás de una tienda, al reiniciar vuelve a entrar con su rol.
- Las tiendas que crees después reciben al equipo al reiniciar la API.

El registro del panel está cerrado: solo se puede registrar sola la primera
cuenta de una base vacía, y en Development las cuentas sembradas ya ocupan ese
lugar. Las demás las da de alta un dueño o administrador desde Configuración →
Usuarios. Una cuenta sirve para todas las tiendas; el rol es por tienda.

## Compradores de la tienda

`backend/src/Api/Startup/ShopperSeeder.cs` crea en **cada** tienda:

| Nombre     | Email            |
| ---------- | ---------------- |
| Ana Test   | `ana@test.com`   |
| Bruno Test | `bruno@test.com` |

Son cuentas de comprador, aparte de las del panel, y cada tienda tiene las
suyas (el email es único por tienda). En la tienda: ícono de cuenta → Iniciar
sesión. Desde el mismo modal se puede registrar una cuenta nueva (contraseña
de 8 caracteres o más).

## Login con Google (opcional)

El botón "Continuar con Google" aparece solo si la API tiene
`Authentication:Google:ClientId`. Para probarlo en dev:

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   creá un OAuth 2.0 Client ID de tipo *Web application*.
2. Redirect URI autorizada: `http://localhost:5080/api/v1/shop/auth/google/callback`.
3. Pasale las credenciales a la API como variables de entorno antes de
   levantarla (no las escribas en `appsettings.json`, que se commitea):

   ```powershell
   $env:Authentication__Google__ClientId = 'TU_CLIENT_ID.apps.googleusercontent.com'
   $env:Authentication__Google__ClientSecret = 'TU_CLIENT_SECRET'
   .\dev-up.ps1
   ```

Sin credenciales, el login con email y contraseña anda igual.
