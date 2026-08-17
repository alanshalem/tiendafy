# Agregar un módulo al backend

Guía basada en módulos reales del repo (los ejemplos citados existen y
compilan). Dos tamaños:

- **Simple** (una entidad, pocos endpoints): un solo proyecto
  `X.Infrastructure`. Ejemplos reales: `Support`, `Discounts`.
- **Completo** (dominio con reglas): `X.Contracts` (DTOs/eventos públicos) +
  `X.Core` (dominio + handlers) + `X.Infrastructure` (EF + registro).
  Ejemplo real: `Catalog`.

El patrón de features es **handler plano** (`Features/<Caso>/<Caso>Handler.cs`
con `IUnitOfWork`, ver `Catalog.Core/Features/CreateProduct/`) + endpoint
minimal API en `backend/src/Api/Endpoints/`. No hay MediatR ni FluentValidation.

## Receta (módulo simple, espejo de Support)

1. **Proyecto**: `backend/src/Modules/Mimodulo/Mimodulo.Infrastructure/` con
   csproj referenciando `SharedKernel` y `SharedKernel.Persistence`; sumarlo a
   `backend.slnx`.

2. **Entidad + DbContext** (`MimoduloDbContext`): toda tabla lleva
   `TenantId` y el DbContext define el **query filter global de tenant**
   (copiar el patrón de `SupportDbContext.cs` — el filtro es lo que hace
   imposible leer datos de otra tienda).

3. **Registro del DbContext** — una línea, todo lo demás lo da
   `SharedKernel.Persistence/ModuleDb`:

   ```csharp
   public static IServiceCollection AddMimoduloModule(this IServiceCollection services, IConfiguration configuration)
   {
       services.AddModuleDbContext<MimoduloDbContext>(configuration);
       return services;
   }
   ```

4. **DesignTimeFactory** para las migraciones (delegando en
   `ModuleDb.DesignTimeOptions`, copiar `Support/DesignTimeFactory.cs`).

5. **Migración** (el patrón real del repo — proyecto del módulo + startup Api
   + context explícito):

   ```bash
   dotnet ef migrations add InitialMimodulo \
     --project src/Modules/Mimodulo/Mimodulo.Infrastructure \
     --startup-project src/Api --context MimoduloDbContext
   dotnet ef database update --project src/Modules/Mimodulo/Mimodulo.Infrastructure \
     --startup-project src/Api --context MimoduloDbContext
   ```

   Gotcha de CI: `dotnet format` no debe tocar migraciones — ya está excluido,
   no reformatearlas a mano.

6. **Registrar en el arranque**:
   - `Api/Startup/ServiceRegistration.cs` → `services.AddMimoduloModule(configuration);`
     junto a los otros 17 (el ORDEN de los `AddHostedService` importa si el
     módulo trae workers).
   - `Api/Startup/PipelineExtensions.cs` → `apiV1.MapMimoduloEndpoints();`.

7. **Endpoints** en `Api/Endpoints/MimoduloEndpoints.cs`: grupo con
   `RequireTenant()` + el permiso que corresponda —
   `RequirePermission(Permission.X)` o `RequirePermissionForWrites(...)`
   (ver [rbac.md](../rbac.md); si hace falta un permiso nuevo, la receta está
   al final de ese doc). Errores como RFC 7807 (`ToProblem()`).

8. **Tests**: unit tests del dominio en `backend/tests/UnitTests/Mimodulo/`
   (helpers compartidos en `TestData.cs`); si el módulo guarda datos por
   tenant, el test de aislamiento de integración ya lo cubre vía query filter,
   pero un caso explícito no sobra.

9. **Docs**: sumar el módulo a la lista de `docs/START_HERE.md` y al diagrama
   de `docs/ARQUITECTURA-VISUAL.md`.

## Checklist de verificación

```bash
dotnet build backend.slnx            # 0 warnings (CI usa -warnaserror)
dotnet test backend.slnx
dotnet ef migrations has-pending-model-changes --project ... --context ...   # "No changes"
```
