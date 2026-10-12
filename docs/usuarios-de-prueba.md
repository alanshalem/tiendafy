# Usuarios de prueba

## Panel de administración: una cuenta por rol

En desarrollo la API siembra al arrancar una cuenta por cada rol, con acceso a
**todas** las tiendas. Sirven para ver el panel exactamente como lo ve cada
uno. Todas usan la contraseña `password123`.

| Rol           | Email                          | Qué ve                                                              |
| ------------- | ------------------------------ | ------------------------------------------------------------------- |
| Dueño         | `admin@tiendafy.local`         | Todo (la cuenta de siempre; la usa el e2e)                          |
| Dueño         | `duenio@tiendafy.local`        | Todo (un segundo dueño, para probar las reglas entre dueños)        |
| Administrador | `administrador@tiendafy.local` | Todo menos dominios, editar y borrar la tienda                      |
| Vendedor      | `vendedor@tiendafy.local`      | Ventas, presupuestos, Mercado Libre, clientes, chat y estadísticas  |
| Catálogo      | `catalogo@tiendafy.local`      | Productos, precios, stock, costos y publicaciones de Mercado Libre |
| Finanzas      | `finanzas@tiendafy.local`      | Ventas, devoluciones, facturación, tesorería y compras              |
| Soporte       | `soporte@tiendafy.local`       | Chat posventa, mensajes, Mercado Libre y ver las ventas             |

Lo que puede cada rol es lo que trae de fábrica; si lo cambiás en
Configuración → Roles y permisos, estas cuentas lo reflejan al toque.

Cómo se comporta el sembrado (`DevAdminSeeder`):

- Crea lo que falta y no pisa nada: si desde el panel le cambiás el rol a una
  de estas cuentas, reiniciar la API lo respeta.
- Si sacás a una de una tienda, al reiniciar vuelve a entrar con su rol.
- Las tiendas que crees después reciben al equipo de prueba al reiniciar la API.

El panel **requiere login**. El registro está cerrado: la única cuenta que se
puede registrar sola es la primera de una instalación vacía; las demás las da
de alta un dueño o administrador desde Configuración → Usuarios. Cada cuenta es
una sola para toda la plataforma y el rol es **por tienda**.

---

# Compradores del storefront

El backend siembra automáticamente estos **compradores** en **cada tienda** al
arrancar en modo Development (`ShopperSeeder`). Sirven para probar el login del
storefront (favoritos, cuenta, etc.). Es idempotente: no duplica.

> Son cuentas de **comprador** (shoppers), distintas del login del **admin**
> (staff/merchant). Cada tienda tiene su propia población de compradores.

## Credenciales

Funcionan en cualquier tienda (subdominio):

| Nombre     | Email              | Contraseña     |
| ---------- | ------------------ | --------------- |
| Ana Test   | `ana@test.com`   | `password123` |
| Bruno Test | `bruno@test.com` | `password123` |

Ejemplo: en `http://tienda-de-gimnasio.localhost:3000`, tocá el ícono de cuenta
→ Iniciá sesión con `ana@test.com` / `password123`.

También podés **registrar** una cuenta nueva desde el mismo modal (email +
contraseña, mínimo 8 caracteres).

## Login con Google (opcional)

El botón "Continuar con Google" aparece **solo si está configurado** en el
servidor. Para activarlo:

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   creá un **OAuth 2.0 Client ID** (tipo *Web application*).
2. Agregá como **Authorized redirect URI**:
   `http://localhost:5080/api/v1/shop/auth/google/callback`
3. Cargá las credenciales en `backend/src/Api/appsettings.json` (o user-secrets):

   ```json
   "Authentication": {
     "Google": {
       "ClientId": "TU_CLIENT_ID.apps.googleusercontent.com",
       "ClientSecret": "TU_CLIENT_SECRET"
     }
   }
   ```
4. Reiniciá la API. El botón de Google aparece solo.

Sin credenciales, el login con email/contraseña funciona igual.

## Cómo funciona (resumen técnico)

- **Sesión**: token opaco persistido en `customer_sessions` (revocable),
  enviado en una cookie HttpOnly por tenant (`shop_{tenantId}`, con
  `credentials: 'include'`); no se guarda nada en `localStorage`.
- **Favoritos**: invitado → `localStorage`; logueado → tabla `customer_favorites`
  (sync). Al iniciar sesión se hace **merge** de los favoritos locales con los
  del servidor.
- **Shopper = fila `Customer`** extendida (`password_hash`, `google_subject`,
  `email_verified`). Email único por tienda.
