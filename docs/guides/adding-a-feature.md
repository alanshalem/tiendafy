# Cómo Agregar una Feature

Guía paso a paso para implementar un feature en Tiendafy.

## Antes de Codificar

### 1. Identificar el Módulo
¿Afecta a Catalog, Orders, Payments, Themes, etc.?

**Ejemplos:**
- "Permitir que merchants descuenten productos" → Catalog
- "Refundar un pago" → Payments
- "Agregar cupón al checkout" → Checkout

### 2. Definir el Caso de Uso
- **Quién**: Usuario (merchant, comprador, admin)
- **Qué**: Acción específica
- **Por qué**: Valor de negocio
- **Restricciones**: Permisos, validaciones, límites

**Ejemplo: "Actualizar el nombre de una categoría"**
```
Quién: Merchant (staff de tienda)
Qué: PATCH /api/v1/admin/categories/{id} con nuevo nombre
Por qué: Merchandising dinámica
Restricciones: Solo staff con permiso 'categories:write'
```

### 3. Validar que Encaja en Módulo
- ¿Usa tablas del módulo?
- ¿Dispara eventos del módulo?
- ¿O requiere feature en otro módulo también?

Si requiere múltiples módulos, divide en features separadas o entiende las dependencias.

## Estructura de una Feature

Cada feature vive en su propia carpeta bajo `Features/`:

```
Catalog.Core/Features/UpdateCategory/
├── UpdateCategoryCommand.cs          # Request
├── UpdateCategoryCommandHandler.cs    # Lógica
├── UpdateCategoryValidator.cs         # Validación
├── UpdateCategoryEndpoint.cs          # HTTP
└── Tests/
    └── UpdateCategoryHandlerTests.cs
```

## Paso a Paso

### 1. Crear Command/Query

```csharp
// UpdateCategoryCommand.cs
public record UpdateCategoryCommand(
    Guid CategoryId,
    string Name,
    string? Description
) : ICommand;
```

Para lectura, usa `IQuery<TResult>`:
```csharp
public record GetCategoryQuery(Guid CategoryId) : IQuery<CategoryDto>;
```

### 2. Crear Validador

```csharp
// UpdateCategoryValidator.cs
public class UpdateCategoryValidator : AbstractValidator<UpdateCategoryCommand>
{
    public UpdateCategoryValidator()
    {
        RuleFor(x => x.CategoryId).NotEmpty();
        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(100);
    }
}
```

### 3. Crear Handler

```csharp
// UpdateCategoryCommandHandler.cs
public class UpdateCategoryCommandHandler(
    ICategoryRepository repository,
    IUnitOfWork unitOfWork) : ICommandHandler<UpdateCategoryCommand>
{
    public async Task<Unit> Handle(UpdateCategoryCommand cmd, CancellationToken ct)
    {
        var category = await repository.GetByIdAsync(cmd.CategoryId, ct)
            ?? throw new NotFoundException("Category not found");

        category.Update(cmd.Name, cmd.Description);

        await unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
```

### 4. Crear Endpoint

```csharp
// UpdateCategoryEndpoint.cs
public class UpdateCategoryEndpoint : IEndpoint
{
    public void MapEndpoint(RouteGroupBuilder app)
    {
        app.MapPatch("/{id}", Handle)
            .WithName("UpdateCategory")
            .WithOpenApi();
    }

    private async Task<IResult> Handle(
        Guid id,
        UpdateCategoryRequest request,
        ISender sender,
        CancellationToken ct)
    {
        var cmd = new UpdateCategoryCommand(id, request.Name, request.Description);
        
        var result = await sender.Send(cmd, ct);
        
        return result.IsSuccess 
            ? Results.NoContent() 
            : Results.BadRequest(result.Error);
    }
}

public record UpdateCategoryRequest(string Name, string? Description);
```

### 5. Registrar en DI

```csharp
// Catalog.Core/Extensions/ServiceCollectionExtensions.cs
public static IServiceCollection AddCatalogModule(this IServiceCollection services)
{
    services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(Assembly).Assembly));
    services.AddValidatorsFromAssembly(typeof(Assembly).Assembly);
    
    services.AddScoped<ICategoryRepository, CategoryRepository>();
    
    return services;
}
```

### 6. Escribir Tests

```csharp
// Tests/UpdateCategoryHandlerTests.cs
public class UpdateCategoryHandlerTests
{
    private readonly UpdateCategoryCommandHandler _handler;
    private readonly Mock<ICategoryRepository> _mockRepo;
    private readonly Mock<IUnitOfWork> _mockUow;

    [SetUp]
    public void Setup()
    {
        _mockRepo = new Mock<ICategoryRepository>();
        _mockUow = new Mock<IUnitOfWork>();
        _handler = new UpdateCategoryCommandHandler(_mockRepo.Object, _mockUow.Object);
    }

    [Test]
    public async Task Handle_WithValidCommand_UpdatesCategory()
    {
        // Arrange
        var categoryId = Guid.NewGuid();
        var category = new Category { Id = categoryId, Name = "Old Name" };
        var cmd = new UpdateCategoryCommand(categoryId, "New Name", null);

        _mockRepo.Setup(x => x.GetByIdAsync(categoryId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(category);

        // Act
        await _handler.Handle(cmd, CancellationToken.None);

        // Assert
        Assert.AreEqual("New Name", category.Name);
        _mockUow.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }
}
```

### 7. Actualizar OpenAPI

Si el endpoint es nuevo en la API pública, OpenAPI se actualiza automáticamente desde Swagger/Swashbuckle.

Para webhooks o eventos, documenta manualmente en `docs/api/webhooks.md`.

## Checklist

Antes de hacer PR:

- [ ] Feature cabe lógicamente en su módulo
- [ ] Command/Query + Handler implementados
- [ ] Validación completa (input + lógica de dominio)
- [ ] Tests unitarios pasan (`dotnet test tests/Unit`)
- [ ] Tests de integración pasan (`dotnet test tests/Integration`)
- [ ] Tests de arquitectura pasan (módulo respeta Contracts)
- [ ] No hay referencias directas a internals desde otros módulos
- [ ] Migrations ejecutadas (si toca DB)
- [ ] OpenAPI spec actualizado
- [ ] Logging agregado (DEBUG para happy path, WARN/ERROR para excepciones)
- [ ] RLS policy revisada (si toca datos de tenant)

## Ejemplo Completo: "Crear Categoría"

```
Catalog.Core/Features/CreateCategory/
├── CreateCategoryCommand.cs
├── CreateCategoryCommandHandler.cs
├── CreateCategoryValidator.cs
├── CreateCategoryEndpoint.cs
└── Tests/
    └── CreateCategoryHandlerTests.cs

Catalog.Contracts/
├── CategoryCreatedEvent.cs (agregamos al evento de dominio)

Catalog.Infrastructure/
└── (sin cambios si Category ya está en DB)
```

Flujo:
1. Merchant envía POST /api/v1/admin/categories
2. Endpoint valida con CreateCategoryValidator
3. Handler ejecuta CreateCategoryCommand
4. Domain emite CategoryCreatedEvent
5. Outbox guarda evento
6. Worker consume evento y publica a RabbitMQ
7. Otros módulos pueden escuchar (ej: Analytics)

## Si Requiere Cambios en DB

1. Crear migración: `dotnet ef migrations add AddCategoryDescription`
2. Revisar SQL generado
3. Validar expand/contract (compatible con versión anterior)
4. Ejecutar migration: `dotnet ef database update`
5. Commitear migración con feature

Ver `docs/database/migrations.md` para expand/contract pattern.

## Si Cruza Múltiples Módulos

Ejemplo: "Aplicar descuento en checkout"

```
Checkout.Core/Features/ApplyDiscount/
├── ApplyDiscountCommand
└── ApplyDiscountHandler

Catalog.Core/Features/GetProductPrice/ (query)

Payments.Core/Features/UpdatePaymentAmount/ (después de checkout)
```

Comunicación:
- Checkout → Catalog: Call directo a `ICatalogService` (interfaz en Contracts)
- Checkout → Orders: Luego de checkout success, publica event
- Orders escucha OrderCreatedEvent y crea orden

## Debugging

Si algo falla:
1. Revisar logs (tenant_id + trace_id correlacionados)
2. Tests unitarios pasan? → Bug en integración
3. Tests de integración pasan? → Bug en deployment
4. Revisar RLS policies (¿vés datos de otro tenant?)
5. Revisar transacción (¿SET LOCAL app.tenant_id ejecutado?)

Ver `docs/guides/debugging.md` para tools.
