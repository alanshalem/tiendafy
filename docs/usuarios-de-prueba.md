# Usuarios de prueba

## Admin (panel del merchant)

En dev se siembra un usuario admin con membresía a **todas** las tiendas, así
entrás con login y las ves todas:

| Email | Contraseña |
|-------|------------|
| `admin@tiendafy.local` | `password123` |

El admin ahora **requiere login** (`/auth`). Todas las escrituras exigen sesión +
membresía a la tienda del `X-Tenant-Id`. Podés registrar otra cuenta desde el
modal; arranca sin tiendas hasta que crees una (quedás como dueño).

---

# Compradores del storefront

El backend siembra automáticamente estos **compradores** en **cada tienda** al
arrancar en modo Development (`ShopperSeeder`). Sirven para probar el login del
storefront (favoritos, cuenta, etc.). Es idempotente: no duplica.

> Son cuentas de **comprador** (shoppers), distintas del login del **admin**
> (staff/merchant). Cada tienda tiene su propia población de compradores.

## Credenciales

Funcionan en cualquier tienda (subdominio):

| Nombre     | Email           | Contraseña     |
|------------|-----------------|----------------|
| Ana Test   | `ana@test.com`  | `password123`  |
| Bruno Test | `bruno@test.com`| `password123`  |

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
  enviado como `Authorization: Bearer <token>`. El storefront lo guarda en
  `localStorage`.
- **Favoritos**: invitado → `localStorage`; logueado → tabla `customer_favorites`
  (sync). Al iniciar sesión se hace **merge** de los favoritos locales con los
  del servidor.
- **Shopper = fila `Customer`** extendida (`password_hash`, `google_subject`,
  `email_verified`). Email único por tienda.
