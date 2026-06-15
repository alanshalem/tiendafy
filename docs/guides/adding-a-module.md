# Cómo Agregar un Módulo

Cuando una feature requiere su propio bounded context con dominio, persistencia e integración, crea un módulo.

## Cuándo Crear un Módulo

No crees módulo para cada feature. Crea uno cuando:
- Bounded context claro (ej: "Webhooks outbound" es su propio módulo)
- Tablas propias + agregados de dominio
- Potencial de ser servicio en el futuro
- Otros módulos lo consumen

**Ejemplos de módulos buenos:**
- Webhooks (completamente separado, fan-out masivo)
- Search (índice separado, puede ser Meilisearch/Elasticsearch)
- Analytics (warehouse, patrón de consumo distinto)

**Ejemplos de features, no módulos:**
- "Crear etiqueta en producto" (integración de Catalog)
- "Marcar pedido como completado" (integración de Orders)

## Estructura

```
src/Modules/{ModuleName}/
├── {ModuleName}.Contracts/
│   ├── IPublicService.cs
│   ├── Events/
│   │   └── XxxHappenedEvent.cs
│   ├── DTOs/
│   │   └── XxxDto.cs
│   └── {ModuleName}.Contracts.csproj
├── {ModuleName}.Core/
│   ├── Domain/
│   │   ├── Aggregate.cs
│   │   ├── ValueObject.cs
│   │   └── AggregateEnum.cs
│   ├── Application/
│   │   └── IPrivateService.cs (implementa contratos)
│   ├── Features/
│   │   ├── FeatureA/
│   │   │   ├── FeatureACommand.cs
│   │   │   ├── FeatureACommandHandler.cs
│   │   │   ├── FeatureAValidator.cs
│   │   │   └── Tests/
│   │   └── FeatureB/
│   ├── Exceptions/
│   │   └── CustomException.cs
│   └── {ModuleName}.Core.csproj
└── {ModuleName}.Infrastructure/
    ├── Persistence/
    │   ├── Configurations/ (EF Core)
    │   │   └── AggregateConfiguration.cs
    │   ├── Repositories/
    │   │   └── AggregateRepository.cs
    │   └── DbContext.cs
    ├── Integrations/
    │   └── ExternalService.cs
    └── {ModuleName}.Infrastructure.csproj
```

## Paso a Paso

### 1. Crear Proyectos

```bash
cd backend/src/Modules/{ModuleName}

# Contracts
dotnet new classlib -n {ModuleName}.Contracts
cd {ModuleName}.Contracts
dotnet add package MediatR

# Core
cd ..
dotnet new classlib -n {ModuleName}.Core
cd {ModuleName}.Core
dotnet add reference ../{ModuleName}.Contracts
dotnet add package MediatR
dotnet add package FluentValidation

# Infrastructure
cd ..
dotnet new classlib -n {ModuleName}.Infrastructure
cd {ModuleName}.Infrastructure
dotnet add reference ../{ModuleName}.Core
dotnet add reference ../../SharedKernel
dotnet add package EntityFrameworkCore
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL
```

### 2. Agregar al Solution

```bash
cd backend

dotnet sln add src/Modules/{ModuleName}/{ModuleName}.Contracts
dotnet sln add src/Modules/{ModuleName}/{ModuleName}.Core
dotnet sln add src/Modules/{ModuleName}/{ModuleName}.Infrastructure
```

### 3. Definir Contratos

```csharp
// {ModuleName}.Contracts/IPublicService.cs
public interface I{ModuleName}Service
{
    Task<{ResponseDto}> DoSomethingAsync({RequestDto} request, CancellationToken ct);
}

// {ModuleName}.Contracts/Events/SomethingHappenedEvent.cs
public record SomethingHappenedEvent(
    Guid TenantId,
    Guid AggregateId,
    string What
) : DomainEvent;
```

Lo único público del módulo son los interfaces en `.Contracts/`.

### 4. Implementar Dominio

```csharp
// {ModuleName}.Core/Domain/MyAggregate.cs
public class MyAggregate : AggregateRoot
{
    public string Name { get; private set; }
    public MyAggregateStatus Status { get; private set; }

    public MyAggregate(Guid id, Guid tenantId, string name)
        : base(id, tenantId)
    {
        Name = name;
        Status = MyAggregateStatus.Active;
        RaiseDomainEvent(new MyAggregateCreatedEvent(tenantId, id, name));
    }

    public void DoSomething()
    {
        if (Status != MyAggregateStatus.Active)
            throw new InvalidOperationException("Aggregate not active");
        
        Status = MyAggregateStatus.Processing;
        RaiseDomainEvent(new SomethingHappenedEvent(TenantId, Id, "action"));
    }

    private MyAggregate() { } // EF Core
}
```

### 5. Implementar Persistencia

```csharp
// {ModuleName}.Infrastructure/Persistence/Configurations/MyAggregateConfiguration.cs
public class MyAggregateConfiguration : IEntityTypeConfiguration<MyAggregate>
{
    public void Configure(EntityTypeBuilder<MyAggregate> builder)
    {
        builder.ToTable("my_aggregates");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.TenantId)
            .HasColumnName("tenant_id")
            .IsRequired();

        builder.Property(x => x.Name)
            .HasMaxLength(255)
            .IsRequired();

        builder.HasIndex(x => new { x.TenantId, x.CreatedAt });

        builder.HasQueryFilter(x => 
            x.TenantId == EF.Property<Guid>("TenantId"));
    }
}
```

### 6. Crear Repository

```csharp
// {ModuleName}.Infrastructure/Persistence/Repositories/MyAggregateRepository.cs
public class MyAggregateRepository : IRepository<MyAggregate>
{
    private readonly MyDbContext _context;

    public MyAggregateRepository(MyDbContext context)
    {
        _context = context;
    }

    public async Task<MyAggregate?> GetByIdAsync(Guid id, CancellationToken ct)
    {
        return await _context.MyAggregates.FirstOrDefaultAsync(x => x.Id == id, ct);
    }

    public async Task AddAsync(MyAggregate aggregate, CancellationToken ct)
    {
        _context.MyAggregates.Add(aggregate);
        await _context.SaveChangesAsync(ct);
    }

    public async Task UpdateAsync(MyAggregate aggregate, CancellationToken ct)
    {
        _context.MyAggregates.Update(aggregate);
        await _context.SaveChangesAsync(ct);
    }
}
```

### 7. Implementar Servicio Público

```csharp
// {ModuleName}.Core/Application/{ModuleName}Service.cs
public class {ModuleName}Service : I{ModuleName}Service
{
    private readonly IRepository<MyAggregate> _repository;
    private readonly IPublisher _publisher;

    public {ModuleName}Service(
        IRepository<MyAggregate> repository,
        IPublisher publisher)
    {
        _repository = repository;
        _publisher = publisher;
    }

    public async Task<MyAggregateDto> DoSomethingAsync(
        CreateMyAggregateRequest request, 
        CancellationToken ct)
    {
        var aggregate = new MyAggregate(
            Guid.NewGuid(), 
            request.TenantId, 
            request.Name);

        await _repository.AddAsync(aggregate, ct);

        await PublishEventsAsync(aggregate, ct);

        return new MyAggregateDto(aggregate.Id, aggregate.Name);
    }

    private async Task PublishEventsAsync(MyAggregate aggregate, CancellationToken ct)
    {
        var domainEvents = aggregate.GetDomainEvents();
        foreach (var domainEvent in domainEvents)
        {
            await _publisher.Publish(domainEvent, ct);
        }
    }
}
```

### 8. Registrar en DI

```csharp
// Api/Program.cs o Extension en cada módulo
services.AddScoped<I{ModuleName}Service, {ModuleName}Service>();
services.AddScoped(typeof(IRepository<>), typeof(GenericRepository<>));
services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof({ModuleName}Module).Assembly));
services.AddValidatorsFromAssembly(typeof({ModuleName}Module).Assembly);
```

### 9. Crear Endpoints

```csharp
// {ModuleName}.Core/Features/CreateMyAggregate/CreateMyAggregateEndpoint.cs
public class CreateMyAggregateEndpoint : IEndpoint
{
    public void MapEndpoint(RouteGroupBuilder app)
    {
        app.MapPost("/", Handle)
            .WithName("Create{ModuleName}Aggregate")
            .WithOpenApi()
            .Produces<MyAggregateDto>(StatusCodes.Status201Created)
            .WithValidation<CreateMyAggregateRequest>();
    }

    private async Task<IResult> Handle(
        CreateMyAggregateRequest request,
        I{ModuleName}Service service,
        CancellationToken ct)
    {
        var result = await service.DoSomethingAsync(request, ct);
        return Results.Created($"/{result.Id}", result);
    }
}
```

### 10. Agregar Migraciones

```bash
cd backend

# Migration con nombre claro
dotnet ef migrations add AddXxxxModule --project src/Api

# Verificar SQL generado
dotnet ef migrations script --idempotent --output migrations/002_AddXxxModule.sql

# Aplicar
dotnet ef database update --project src/Api
```

### 11. Tests

```csharp
// Tests/Unit/{ModuleName}/MyAggregateTests.cs
public class MyAggregateTests
{
    [Test]
    public void Create_WithValidName_InitializesCorrectly()
    {
        // Arrange
        var tenantId = Guid.NewGuid();
        var name = "Test Aggregate";

        // Act
        var aggregate = new MyAggregate(Guid.NewGuid(), tenantId, name);

        // Assert
        Assert.AreEqual(name, aggregate.Name);
        Assert.AreEqual(MyAggregateStatus.Active, aggregate.Status);
    }
}
```

### 12. Validar Arquitectura

```bash
dotnet test tests/Architecture
```

Tests verifican:
- `{ModuleName}.Core` no referencia `.Infrastructure` directamente
- Otros módulos solo referencian `.Contracts`
- No hay referencias circulares

## Cómo Usar el Módulo desde Otro

```csharp
// En otro módulo
public class OtherModuleFeatureHandler(
    I{ModuleName}Service service) // ← Inyecta interfaz pública
{
    public async Task Handle(SomeCommand cmd, CancellationToken ct)
    {
        var result = await service.DoSomethingAsync(..., ct);
    }
}
```

**NUNCA** imports internos:
```csharp
// ❌ PROHIBIDO
using MyModule.Core.Domain; // ← Solo Contracts es público
```

## Checklist

- [ ] Proyectos creados y agregados a .sln
- [ ] Contratos definidos en `.Contracts/`
- [ ] Dominio implementado en `.Core/`
- [ ] Persistencia en `.Infrastructure/`
- [ ] DI configurado
- [ ] Migraciones creadas y probadas
- [ ] Tests unitarios + integración
- [ ] Tests de arquitectura pasan
- [ ] Documentación en ADR (si módulo es complejo)
- [ ] OpenAPI spec actualizado

## Ejemplo Completo: Webhooks Module

```
src/Modules/Webhooks/
├── Webhooks.Contracts/
│   ├── IWebhooksService.cs
│   ├── WebhookRegisteredEvent.cs
│   └── CreateWebhookRequest.cs
├── Webhooks.Core/
│   ├── Domain/
│   │   ├── Webhook.cs (aggregate)
│   │   ├── WebhookEvent.cs (value object)
│   │   └── WebhookStatus.cs (enum)
│   ├── Features/
│   │   ├── RegisterWebhook/
│   │   ├── TriggerWebhook/
│   │   ├── RetryFailedWebhooks/
│   │   └── GetWebhookDeliveries/
│   └── Application/
│       └── WebhooksService.cs
└── Webhooks.Infrastructure/
    ├── Persistence/
    │   ├── WebhookRepository.cs
    │   └── WebhookDbContext.cs
    └── Integrations/
        └── HttpWebhookDispatcher.cs
```

Flujo:
- Merchant registra webhook en admin
- Registración guardada via Webhooks module
- Cuando evento ocurre (ej OrderCreated), Worker publica a RabbitMQ
- Webhooks consumer escucha y ejecuta HttpWebhookDispatcher
- Reintentos automáticos con exponential backoff
