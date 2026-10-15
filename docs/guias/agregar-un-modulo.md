# Agregar un módulo al backend

Receta basada en los módulos que existen hoy en `backend/src/Modules`.

## Qué forma tiene un módulo

| Tamaño | Proyectos | Ejemplos |
| --- | --- | --- |
| Simple (entidades + persistencia; la lógica vive en los endpoints) | `X.Infrastructure` | `Support`, `Discounts`, `Reviews`, `Finance` |
| Con dominio propio | `X.Core` (dominio y handlers) + `X.Infrastructure` | `Orders`, `Checkout` |
| Con tipos que usan otros módulos | `X.Contracts` + `X.Infrastructure` | `Social` |
| Con las dos cosas | `X.Contracts` + `X.Core` + `X.Infrastructure` | `Catalog`, `Inventory`, `Payments`, `Fiscal`, `Tenancy` |

Dónde va cada cosa:

- **Endpoints**: en la Api, `backend/src/Api/Endpoints/<X>Endpoints.cs`
  (minimal APIs). Un módulo nunca referencia a la Api.
- **Orquestación entre módulos** (un caso que toca dos o más): en la Api, en
  una carpeta por área (`Api/Orders/`, `Api/Finance/`…). Un módulo solo ve el
  `.Contracts` de otro.
- **Handlers** (si hay `.Core`): clase plana por caso de uso en
  `Features/<Caso>/<Caso>Handler.cs`, con su repositorio e `IUnitOfWork`
  (ver `Catalog.Core/Features/CreateProduct/`). No hay MediatR ni
  FluentValidation.

Las reglas las controlan dos tests de arquitectura que corren con los
unitarios (`backend/tests/UnitTests/Architecture/`):

- `ModuleBoundariesTests`: un módulo solo puede referenciar el `.Contracts` de
  otro, ningún módulo referencia a `Api`, y un `.Contracts` no referencia un
  `.Infrastructure`.
- `TenantQueryFilterTests`: toda entidad con `TenantId`, en todos los
  DbContext que alcanza la Api, tiene filtro global de tienda. Una excepción
  se declara en `SinFiltroAProposito` con su motivo.

## Receta (módulo simple, espejo de `Support`)

1. **Proyecto** `backend/src/Modules/Mimodulo/Mimodulo.Infrastructure/`, con
   un `.csproj` como el de `Support.Infrastructure` (referencias a
   `SharedKernel` y `SharedKernel.Persistence`, paquetes
   `Npgsql.EntityFrameworkCore.PostgreSQL` y `EFCore.NamingConventions`).
   Sumalo a `backend/backend.slnx` y referencialo desde `src/Api/Api.csproj`.

2. **Entidades y `MimoduloDbContext`**: toda tabla de una tienda lleva
   `TenantId`, y el contexto recibe `ITenantContext? tenant = null` y declara
   `HasQueryFilter` en cada una de esas entidades. Copiá el patrón de
   `SupportDbContext.cs`: el filtro es lo que impide leer filas de otra tienda.

3. **Registro**, en `MimoduloModule.cs`:

   ```csharp
   public static IServiceCollection AddMimoduloModule(this IServiceCollection services, IConfiguration configuration)
   {
       services.AddModuleDbContext<MimoduloDbContext>(configuration);
       return services;
   }
   ```

   `AddModuleDbContext` (`SharedKernel.Persistence/ModuleDb.cs`) arma la
   conexión, el naming en snake_case y lo demás.

4. **`DesignTimeFactory`** para las migraciones: copiá
   `Support.Infrastructure/DesignTimeFactory.cs` (delega en
   `ModuleDb.DesignTimeOptions`).

5. **Primera migración**, desde `backend/`:

   ```bash
   dotnet tool restore     # dotnet-ef, fijado en backend/dotnet-tools.json
   dotnet ef migrations add InitialMimodulo \
     --project src/Modules/Mimodulo/Mimodulo.Infrastructure \
     --startup-project src/Api --context MimoduloDbContext
   ```

   No hace falta `dotnet ef database update`: la API aplica las migraciones al
   arrancar en dev (`Database:MigrateOnStartup`) y con `dotnet Api.dll migrate`
   en el deploy, siempre que el contexto esté en la lista del paso 6.
   Después de generar una migración corré `dotnet format backend.slnx`
   completo: el `pre-commit` formatea solo lo que commiteás y no deja las
   migraciones como las pide CI.

6. **Arranque** (`backend/src/Api/Startup/`):
   - `ServiceRegistration.cs` → `AddAllModules`:
     `services.AddMimoduloModule(configuration);`. Si el módulo trae workers,
     se registran en `AddIntegrations`, respetando `Workers:Enabled`.
   - `DatabaseMigrator.cs` → `MigrateDatabaseAsync`:
     `await MigrateAsync<MimoduloDbContext>(sp, logger);`. La lista es
     explícita: un contexto que no esté ahí nunca se migra solo.
   - `PipelineExtensions.cs` → `MapApiV1`: `apiV1.MapMimoduloEndpoints();`.

7. **Endpoints** en `Api/Endpoints/MimoduloEndpoints.cs`: grupo con
   `RequireTenant()` y el permiso que corresponda, `RequirePermission(...)` o
   `RequirePermissionForWrites(...)` (`Api/Auth/AuthExtensions.cs`). Un
   permiso nuevo es una línea en el catálogo de
   `Identity.Infrastructure/Permissions.cs` (ver [permisos.md](../permisos.md)).
   `EndpointPermissionTests` falla si una ruta no exige permiso y no está en
   su lista de excepciones con motivo. Los errores de dominio salen como
   problem+json con `ToProblem()` (`Api/Endpoints/ErrorResults.cs`).

8. **Tests**: unitarios en `backend/tests/UnitTests/Mimodulo/` (helpers en
   `TestData.cs`) y el flujo por HTTP en `backend/tests/IntegrationTests/`
   con `Merchant` y `ApiFactory` (ver [tests.md](../tests.md)).

9. **Docs**: sumá el módulo a la lista de [primeros-pasos.md](../primeros-pasos.md) y
   al diagrama de [arquitectura.md](../arquitectura.md).

## Antes de dar por terminado

```bash
cd backend
dotnet build backend.slnx -c Release -warnaserror --no-incremental   # como CI
dotnet format backend.slnx --verify-no-changes
dotnet test backend.slnx
dotnet ef migrations has-pending-model-changes \
  --project src/Modules/Mimodulo/Mimodulo.Infrastructure \
  --startup-project src/Api --context MimoduloDbContext
```

O todo junto: `pnpm verify --back`.
