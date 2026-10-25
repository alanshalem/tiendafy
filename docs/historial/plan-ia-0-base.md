# IA — Parte 0 (la base): plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usá superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`).

**Objetivo:** toda la IA del sistema pasa por un gateway único con claves por tienda de cuatro proveedores, modelo por tarea con respaldo, consumo registrado, tope mensual con reserva y límites por ejecución; los usos actuales migran a él.

**Arquitectura:** persistencia en un módulo nuevo `Modules/Ai` (un proyecto, como `Reviews`) más dos tablas en `Modules/MercadoLibre`; orquestación en `backend/src/Api/Ai/` sobre Microsoft.Extensions.AI (`IChatClient`), con un adaptador por proveedor y un `DelegatingChatClient` que mide cada llamada. Panel: Configuración → Inteligencia artificial.

**Stack:** .NET 10, EF Core + Npgsql, Microsoft.Extensions.AI 10.11.x, `Anthropic` 13.3.x, `OpenAI` 2.14.x + `Microsoft.Extensions.AI.OpenAI` 10.11.x, `Google.GenAI` 1.27.x; Vite + React 19 + React Query.

**Spec:** [diseno-ia-multi-proveedor.md](./diseno-ia-multi-proveedor.md) — leela entera antes de empezar; este plan argumenta desde ahí.

## Restricciones globales

- Idioma: textos, comentarios, commits y docs en rioplatense con voseo; identificadores en inglés (`AGENTS.md`).
- DataProtection purpose **`Tiendafy.Ai.Keys.v1`**, constante, nunca cambia.
- Plata de IA en **micro-dólares (`long`)**, sufijo `MicroUsd` en todo nombre. Nunca `double`/`decimal` para acumular.
- Mes de consumo = mes calendario en hora Argentina (`ArgentinaTime`).
- URLs de proveedor constantes en código; Groq: `https://api.groq.com/openai/v1`. No hay campo de URL.
- `ChatMessage.AuthorName` nunca se setea. A Claude no se le manda `temperature`.
- Ninguna clave en respuestas JSON, logs, Sentry ni prompts.
- Permiso nuevo `AiConfig` al **final** del enum `Permission`.
- **Todas las migraciones de las Partes 0 y A–D salen en este plan** (Tareas 1 y 2).
- Compilar con `-c Release -m:1` (la API de dev corre en Debug y la RAM es poca); `dotnet format backend.slnx --no-restore` antes de cada commit; vitest con `VITEST_MAX_WORKERS=2`.
- Integración: `TIENDAFY_TEST_DB="Host=localhost;Port=5432;Database=tiendafy_itests_ai;Username=tiendafy;Password=tiendafy"`.
- Ningún test llama a un proveedor real.

## Foco de revisión

1. Dos pedidos simultáneos de la misma tienda con el tope casi agotado: solo uno pasa (Tarea 6 lo fija con un test concurrente).
2. Un proveedor que devuelve 401 no dispara el respaldo y el panel muestra "la clave de X no es válida" (Tarea 8).
3. Un PUT de clave vacía no borra la guardada; un DELETE sí; ninguna respuesta trae la clave (Tarea 9).
4. "Copiar a mis otras tiendas" con una tienda destino donde la persona es admin pero no dueña: 403 y nada copiado (Tarea 12).
5. Cambiar el modelo asignado o borrar la clave de un proveedor mientras una tarea lo usa como principal: la tarea pasa a "no disponible" con motivo, no a un 500 (Tarea 9).

---

### Tarea 1: Módulo `Ai` con todas sus tablas

**Archivos:**
- Crear: `backend/src/Modules/Ai/Ai.Infrastructure/Ai.Infrastructure.csproj` (copia de `Reviews.Infrastructure.csproj`)
- Crear: `.../Ai.Infrastructure/AiEnums.cs`, `AiEntities.cs`, `AiDbContext.cs`, `AiModule.cs`, `DesignTimeFactory.cs`
- Crear: migración `InitialAi`
- Modificar: `backend/backend.slnx`, `backend/src/Api/Api.csproj`, `backend/src/Api/Startup/ServiceRegistration.cs` (`AddAllModules`), `backend/src/Api/Startup/DatabaseMigrator.cs` (al final de la lista)
- Test: `backend/tests/UnitTests/Ai/AiEntitiesTests.cs`

**Interfaces — produce:**
```csharp
namespace Ai.Infrastructure;
public enum AiProvider { Anthropic, OpenAI, Google, Groq }
public enum AiTask { QuestionClassify, QuestionDraft, DataAssistant, CatalogWrite, CatalogJudge, InvoiceRead, ShortText }
public enum AiOutcome { Ok, Error, Fallback, Limited }
public enum AiCatalogJobStatus { Queued, Running, PausedBudget, PausedUnavailable, Done, Cancelled }
public enum AiCatalogItemStatus { Pending, NeedsCategory, Review, Approved, Discarded, Failed }

public sealed class AiProviderCredential   // tabla ai_provider_credentials, único (TenantId, Provider)
{ Guid Id; Guid TenantId; AiProvider Provider; string KeyEncrypted; string Last4; bool? LastTestOk; DateTime? LastTestAtUtc; DateTime UpdatedAtUtc;
  static AiProviderCredential Create(Guid tenantId, AiProvider p, string keyEncrypted, string last4);
  void ReplaceKey(string keyEncrypted, string last4); void RecordTest(bool ok, DateTime atUtc); }
public sealed class AiTaskAssignment       // ai_task_assignments, PK (TenantId, Task)
{ Guid TenantId; AiTask Task; string PrimaryModel; string? FallbackModel; void Set(string primary, string? fallback); }
public sealed class AiSettings             // ai_settings, PK TenantId
{ Guid TenantId; bool Enabled; long MonthlyBudgetMicroUsd; int AlertThresholdPct /*default 80*/; DateTime UpdatedAtUtc;
  static AiSettings CreateDefault(Guid tenantId); void Update(bool enabled, long monthlyBudgetMicroUsd, int alertThresholdPct); }
public sealed class AiUsage                // ai_usage, índice (TenantId, CreatedAtUtc)
{ Guid Id; Guid TenantId; Guid? UserId; AiTask Task; AiProvider Provider; string Model; Guid RunId;
  long InputTokens; long CachedInputTokens; long OutputTokens; long CostMicroUsd; AiOutcome Outcome; DateTime CreatedAtUtc; }
public sealed class AiCatalogJob           // ai_catalog_jobs
{ Guid Id; Guid TenantId; Guid CreatedBy; AiCatalogJobStatus Status; int Total; int Processed;
  long EstimatedCostMicroUsd; long ActualCostMicroUsd; DateTime CreatedAtUtc; DateTime UpdatedAtUtc; }
public sealed class AiCatalogJobItem       // ai_catalog_job_items, índice (JobId, Status), ProposalJson jsonb
{ Guid Id; Guid TenantId; Guid JobId; Guid ProductId; AiCatalogItemStatus Status; string? ProposalJson;
  int? JudgeScore; string? JudgeNotes; int Attempts; DateTime? ClaimedAtUtc; DateTime UpdatedAtUtc; }
public sealed class AiDbContext : DbContext   // ctor (options, ITenantContext? tenant = null), HasQueryFilter en las 6
{ DbSet<AiProviderCredential> Credentials; DbSet<AiTaskAssignment> Assignments; DbSet<AiSettings> Settings;
  DbSet<AiUsage> Usage; DbSet<AiCatalogJob> CatalogJobs; DbSet<AiCatalogJobItem> CatalogJobItems; }
public static IServiceCollection AddAiModule(this IServiceCollection, IConfiguration);
```
Enums se guardan como string (`HasConversion<string>()`), como `ReviewsDbContext`.

- [ ] **Paso 1: test que falla** — `AiEntitiesTests`:
  - `Credential_Create_guarda_last4_y_rechaza_vacio`: `Create(t, Groq, "enc", "a1b2").Last4 == "a1b2"`; `Create(t, Groq, "", "")` lanza `ArgumentException`.
  - `Settings_por_defecto_apagada_con_umbral_80`: `AiSettings.CreateDefault(t)` → `Enabled == false`, `MonthlyBudgetMicroUsd == 0`, `AlertThresholdPct == 80`.
- [ ] **Paso 2:** `dotnet test tests/UnitTests -c Release -m:1 --filter "FullyQualifiedName~AiEntitiesTests"` → FAIL (no compila).
- [ ] **Paso 3:** crear el proyecto, entidades, contexto, módulo y factory siguiendo [guias/agregar-un-modulo.md](../guias/agregar-un-modulo.md) pasos 1–6 (sin endpoints todavía). Migración desde `backend/`: `dotnet ef migrations add InitialAi --project src/Modules/Ai/Ai.Infrastructure --startup-project src/Api --context AiDbContext`.
- [ ] **Paso 4:** el test del paso 2 pasa, y `dotnet test tests/UnitTests -c Release -m:1 --filter "FullyQualifiedName~Architecture"` pasa (`TenantQueryFilterTests` encuentra `AiDbContext` solo).
- [ ] **Paso 5:** `dotnet format backend.slnx --no-restore` y commit `feat(ia): módulo Ai con credenciales, asignaciones, presupuesto, consumo y trabajos de catálogo`.

### Tarea 2: Tablas de ML para categoría y atributos por producto

**Archivos:**
- Crear: `backend/src/Modules/MercadoLibre/MercadoLibre.Infrastructure/MeliProductCategory.cs`, `MeliProductAttribute.cs`
- Modificar: `MeliDbContext.cs` (DbSets + filtros), migración `AddMeliProductAttributes`
- Test: `backend/tests/UnitTests/Meli/MeliProductAttributeTests.cs`

**Interfaces — produce:**
```csharp
public enum MeliCategorySource { Manual, Listing, Predicted }
public sealed class MeliProductCategory   // meli_product_categories, PK (TenantId, ProductId)
{ Guid TenantId; Guid ProductId; string CategoryId; string CategoryName; MeliCategorySource Source; DateTime UpdatedAtUtc;
  static MeliProductCategory Create(Guid tenantId, Guid productId, string categoryId, string categoryName, MeliCategorySource source);
  void Change(string categoryId, string categoryName, MeliCategorySource source); }
public sealed class MeliProductAttribute  // meli_product_attributes, único (TenantId, ProductId, AttributeId)
{ Guid Id; Guid TenantId; Guid ProductId; string AttributeId; string? ValueId; string? ValueName; string? Unit; DateTime UpdatedAtUtc;
  static MeliProductAttribute Create(Guid tenantId, Guid productId, string attributeId, string? valueId, string? valueName, string? unit); }
// MeliDbContext: DbSet<MeliProductCategory> ProductCategories; DbSet<MeliProductAttribute> ProductAttributes;
```

- [ ] **Paso 1: test que falla**: `Create_exige_valueId_o_valueName` (los dos null → `ArgumentException`); `Create_normaliza_attributeId_a_mayusculas` (`"brand"` → `"BRAND"`).
- [ ] **Paso 2:** correr el filtro `MeliProductAttributeTests` → FAIL.
- [ ] **Paso 3:** entidades, DbSets con `HasQueryFilter`, migración desde `backend/`: `dotnet ef migrations add AddMeliProductAttributes --project src/Modules/MercadoLibre/MercadoLibre.Infrastructure --startup-project src/Api --context MeliDbContext`.
- [ ] **Paso 4:** el filtro y `Architecture` pasan.
- [ ] **Paso 5:** format + commit `feat(meli): categoría y atributos de ML guardados por producto`.

### Tarea 3: Catálogo de modelos, especificación de tareas y cálculo de costo

**Archivos:**
- Crear: `backend/src/Api/Ai/AiModelCatalog.cs`, `AiTaskSpecs.cs`, `AiCost.cs`
- Test: `backend/tests/UnitTests/Api/Ai/AiModelCatalogTests.cs`, `AiCostTests.cs`

**Interfaces — produce:**
```csharp
namespace Api.Ai;
[Flags] public enum AiCapability { None = 0, Tools = 1, Json = 2, JsonWithTools = 4, Pdf = 8, Image = 16 }
public sealed record AiModelInfo(AiProvider Provider, string Id, string Label, AiCapability Capabilities,
    long InputMicroUsdPerMTok, long CachedInputMicroUsdPerMTok, long OutputMicroUsdPerMTok, bool Cheap);
public static class AiModelCatalog
{
    public const string PricesVerifiedOn = "2026-10-25";
    public static IReadOnlyList<AiModelInfo> All { get; }
    public static AiModelInfo? Find(string modelId);
    public static IEnumerable<AiModelInfo> Eligible(AiTask task, IReadOnlySet<AiProvider> configured);
    public static AiModelInfo CheapestOf(AiProvider provider);          // para "Probar conexión"
}
public sealed record AiTaskSpec(AiTask Task, AiCapability Requires, int MaxIterations, int MaxOutputTokens,
    TimeSpan Timeout, string? ClaudeEffort, bool Cheap /* sugerencia: modelo barato */);
public static class AiTaskSpecs { public static AiTaskSpec For(AiTask task); public static IReadOnlyList<AiTaskSpec> All { get; } }
public static class AiCost
{
    public static long MicroUsd(AiModelInfo m, long inputTokens, long cachedInputTokens, long outputTokens);
    public static long WorstCaseMicroUsd(AiModelInfo m, AiTaskSpec spec, int estimatedInputTokens);
}
```
Valores: la tabla de modelos y precios y la tabla de tareas (requisitos y límites) de la spec, tal cual. `ClaudeEffort`: `"low"` para `QuestionClassify`, `CatalogJudge`, `ShortText`; `"medium"` el resto. `CachedInputMicroUsdPerMTok` sin dato publicado = 10 % de la entrada, con un comentario que lo diga. Antes de cerrar la tarea, reconfirmá precios en las páginas de cada proveedor y actualizá `PricesVerifiedOn`.

`MicroUsd`: los tokens en caché se cobran al precio de caché y **no** se suman al precio de entrada; `InputTokens` del medidor ya excluye los cacheados (ver Tarea 7). Redondeo hacia arriba al micro-dólar.

- [ ] **Paso 1: tests que fallan**:
  - `Sonnet_1M_entrada_y_1M_salida_cuesta_12_dolares`: `MicroUsd(Find("claude-sonnet-5-5")!, 1_000_000, 0, 1_000_000) == 12_000_000`.
  - `Cacheados_se_cobran_a_precio_de_cache`: Sonnet, `(0, 1_000_000, 0) == 200_000`.
  - `Redondea_hacia_arriba`: Haiku, `(1, 0, 0) == 1`.
  - `WorstCase_DataAssistant`: Sonnet, spec `DataAssistant`, entrada estimada 5.000 → `6 * (5_000 * 2 + 1_500 * 10)` = `150_000`.
  - `InvoiceRead_solo_ofrece_modelos_con_Pdf`: con Groq y Anthropic configurados, ningún modelo de Groq en `Eligible(InvoiceRead, …)`.
  - `Groq_es_elegible_para_DataAssistant`: `DataAssistant` requiere solo `Tools` (no `JsonWithTools`) → los modelos de Groq aparecen en `Eligible(DataAssistant, …)`.
  - `Todas_las_tareas_tienen_spec` y `Todos_los_ids_son_unicos`.
- [ ] **Paso 2:** filtro `FullyQualifiedName~Api.Ai` → FAIL.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** pasa.
- [ ] **Paso 5:** commit `feat(ia): catálogo de modelos con capacidades y precios, y límites por tarea`.

### Tarea 4: Fábrica de clientes por proveedor

**Archivos:**
- Modificar: `backend/src/Api/Api.csproj` (paquetes del Stack, versiones exactas que estén publicadas al implementar)
- Crear: `backend/src/Api/Ai/AiChatClientFactory.cs`
- Test: `backend/tests/UnitTests/Api/Ai/AiChatClientFactoryTests.cs`

**Interfaces — produce:**
```csharp
public interface IAiChatClientFactory
{
    IChatClient Create(AiProvider provider, string apiKey, string modelId, int maxOutputTokens);
}
public sealed class AiChatClientFactory : IAiChatClientFactory { public static readonly Uri GroqEndpoint; }
```
Anthropic: `AsIChatClient(modelId, maxOutputTokens)` del SDK oficial. OpenAI: `new OpenAIClient(key).GetChatClient(model).AsIChatClient()` (Chat Completions). Groq: lo mismo con `OpenAIClientOptions { Endpoint = GroqEndpoint }`. Google: `new Google.GenAI.Client(apiKey: key).AsIChatClient(model)`. Las firmas exactas de cada SDK se confirman contra el paquete instalado (compilá primero y corregí con lo que diga el compilador). Registro singleton en `ServiceRegistration` reemplazando el bloque `AiOptions`/`AiClient` (`:195-199`) — `InvoiceScanner` sigue registrado.

- [ ] **Paso 1: tests que fallan**: `Groq_apunta_a_la_url_fija` (`GroqEndpoint == new Uri("https://api.groq.com/openai/v1")`); `Crea_un_cliente_por_proveedor` (los cuatro devuelven no-null con clave `"x"` y el modelo más barato de cada uno; no hay llamada de red al crear).
- [ ] **Paso 2–4:** FAIL → implementar → PASS.
- [ ] **Paso 5:** commit `feat(ia): clientes de Anthropic, OpenAI, Google y Groq detrás de IChatClient`.

### Tarea 5: Presupuesto con reserva

**Archivos:**
- Crear: `backend/src/Api/Ai/AiBudget.cs`
- Test: `backend/tests/UnitTests/Api/Ai/AiBudgetTests.cs`

**Interfaces — produce:**
```csharp
public interface IAiMonthSpend { Task<long> SpentThisMonthMicroUsdAsync(Guid tenantId, CancellationToken ct); }  // suma de AiUsage del mes AR
public sealed class AiBudget   // singleton
{
    public AiBudget(IAiMonthSpend spend, TimeProvider clock);
    public Task<AiReservation?> TryReserveAsync(Guid tenantId, long budgetMicroUsd, long worstCaseMicroUsd, CancellationToken ct);
    public Task<long> CommittedMicroUsdAsync(Guid tenantId, CancellationToken ct); // gastado + reservado
}
public sealed class AiReservation : IAsyncDisposable
{ public void AddActual(long microUsd); }   // Dispose libera lo reservado; lo real ya está en AiUsage
```
Lock por tienda (`SemaphoreSlim` en un `ConcurrentDictionary`); la suma del mes se cachea 30 s y se le suma lo real reportado desde la última lectura, para no depender de releer la base.

- [ ] **Paso 1: tests que fallan** (`IAiMonthSpend` falso):
  - `Reserva_si_entra`: gastado 0, tope 1.000, peor caso 400 → no null; `CommittedMicroUsdAsync == 400`.
  - `No_reserva_si_no_entra`: gastado 700, tope 1.000, peor caso 400 → null.
  - `Al_liberar_queda_solo_lo_real`: reservar 400, `AddActual(50)`, dispose → `Committed == 50`.
  - `Dos_reservas_simultaneas_no_pasan_juntas`: gastado 0, tope 1.000, peor caso 600, dos `TryReserveAsync` con `Task.WhenAll` → exactamente una no null.
  - `El_mes_corta_en_hora_argentina`: `IAiMonthSpend` real contra una lista en memoria con una fila del 31-oct 23:30 AR (02:30 UTC del 1-nov) → cuenta en octubre. (El cálculo del rango va en un helper `AiMonth.RangeUtc(DateOnly anyDayAr)`.)
- [ ] **Paso 2–4:** FAIL → implementar `AiBudget`, `AiMonth`, y `AiMonthSpend` (EF sobre `AiDbContext`, con `IgnoreQueryFilters` + `Where(TenantId == …)` porque corre también fuera de un request) → PASS.
- [ ] **Paso 5:** commit `feat(ia): tope mensual por tienda con reserva del peor caso`.

### Tarea 6: Medidor de consumo

**Archivos:**
- Crear: `backend/src/Api/Ai/MeteringChatClient.cs`, `AiUsageRecorder.cs`
- Test: `backend/tests/UnitTests/Api/Ai/MeteringChatClientTests.cs`, `backend/tests/UnitTests/Api/Ai/FakeChatClient.cs`

**Interfaces — produce:**
```csharp
public sealed record AiUsageEntry(Guid TenantId, Guid? UserId, AiTask Task, AiModelInfo Model, Guid RunId,
    long InputTokens, long CachedInputTokens, long OutputTokens, AiOutcome Outcome);
public interface IAiUsageRecorder { Task RecordAsync(AiUsageEntry entry, CancellationToken ct); }  // inserta AiUsage en un scope propio, calcula el costo con AiCost
public sealed class MeteringChatClient(IChatClient inner, IAiUsageRecorder recorder, AiUsageEntry template, AiReservation? reservation)
    : DelegatingChatClient(inner);
// Tests: FakeChatClient(params ChatResponse[] script) — devuelve en orden; registra los ChatMessage recibidos en Calls
//        y las ChatOptions de cada llamada en Options (para afirmar qué herramientas y formato recibió el modelo).
```
Normalización de tokens (unificar proveedores): `InputTokens = UsageDetails.InputTokenCount - CachedInputTokenCount`; `CachedInputTokens = CachedInputTokenCount ?? 0`; en Anthropic sumar además `AdditionalCounts["CacheCreationInputTokens"]` a `InputTokens` (se escriben al precio de entrada en esta versión: documentarlo en el comentario). Respuesta sin `Usage` → registra 0 y loguea un warning. Excepción del inner → registra `Outcome = Error` con 0 tokens y relanza.

- [ ] **Paso 1: tests que fallan**:
  - `Registra_una_fila_por_respuesta` (2 llamadas → 2 entradas en un recorder falso).
  - `Resta_los_cacheados_de_la_entrada` (`InputTokenCount = 1000, Cached = 800` → `Input 200, Cached 800`).
  - `Suma_escritura_de_cache_de_Anthropic` (`AdditionalCounts["CacheCreationInputTokens"] = 300`, input 1000, cached 0 → `Input 1300`).
  - `Informa_el_costo_a_la_reserva`.
  - `Un_error_del_proveedor_queda_registrado_y_se_relanza`.
- [ ] **Paso 2–4:** FAIL → implementar → PASS.
- [ ] **Paso 5:** commit `feat(ia): cada llamada a un modelo queda registrada con su costo`.

### Tarea 7: Gateway

**Archivos:**
- Crear: `backend/src/Api/Ai/AiGateway.cs`, `AiCircuitBreaker.cs`, `AiKeyProtector.cs`, `AiErrors.cs`
- Modificar: `backend/src/SharedKernel/Common/Result.cs:49` (`ErrorType.Unavailable`), `backend/src/Api/Endpoints/ErrorResults.cs:13` (→ 503)
- Test: `backend/tests/UnitTests/Api/Ai/AiGatewayTests.cs`, `AiCircuitBreakerTests.cs`, `AiKeyProtectorTests.cs`

**Interfaces — produce (CONTRATO CONGELADO para A–D):**
```csharp
public interface IAiKeyProtector { string Protect(string key); string Unprotect(string encrypted); }  // purpose "Tiendafy.Ai.Keys.v1"
public sealed record AiTaskAvailability(AiTask Task, bool Available, string? Reason);  // Reason en castellano para el panel
public sealed class AiRunContext
{
    public Guid RunId { get; }
    public AiTaskSpec Spec { get; }
    public AiModelInfo Model { get; }
    public IChatClient Chat { get; }                 // medido, sin herramientas
    public ChatOptions NewOptions();                 // MaxOutputTokens = Spec.MaxOutputTokens; effort de Claude si aplica
    public ChatMessage System(string stableText);    // system prompt constante; en Anthropic lo marca con WithCacheControl (caché de prompts)
    public IChatClient WithTools();                  // Chat + FunctionInvokingChatClient(MaximumIterationsPerRequest = Spec.MaxIterations, MaximumConsecutiveErrorsPerRequest = 2)
}
public sealed record AiRunOptions(int EstimatedInputTokens, Guid? TenantId = null, Guid? UserId = null);  // TenantId/UserId solo para workers sin request
public interface IAiGateway
{
    Task<IReadOnlyList<AiTaskAvailability>> AvailabilityAsync(CancellationToken ct);   // tienda y usuario del request
    Task<Result<T>> RunAsync<T>(AiTask task, AiRunOptions options,
        Func<AiRunContext, CancellationToken, Task<T>> body, CancellationToken ct);
}
public static class AiErrors   // Error.* de SharedKernel; title = código
{ Disabled "Ai.Disabled" (Conflict); NotConfigured "Ai.TaskNotConfigured" (Conflict); Budget "Ai.BudgetExceeded" (Conflict); Busy "Ai.Busy" (Conflict);
  BadKey "Ai.ProviderAuth" (Conflict; detalle "La clave de {Proveedor} no es válida o no tiene saldo.");
  Unavailable "Ai.Unavailable" (Unavailable); TimedOut "Ai.TimedOut" (Unavailable); }
// SharedKernel/Common/Result.cs: sumar ErrorType.Unavailable = 4 (al final) y mapearlo a 503 en
// Api/Endpoints/ErrorResults.cs. Ningún error de IA sale como 500 (anti-objetivo de la spec).
// Herramientas (A, B): se declaran con AIFunctionFactory.Create(closure, name, description). El closure captura
// el id de la publicación / pedido / tienda; ningún parámetro de herramienta es una tienda ni un id que el modelo elija.
```
Orden dentro de `RunAsync` (spec, "El gateway"): `Ai:Disabled` global → `AiSettings.Enabled` → asignación de la tarea con modelo en catálogo y clave cargada → reserva (`AiCost.WorstCaseMicroUsd(model, spec, options.EstimatedInputTokens)`; la entrada se estima por lo alto, largo del prompt / 3) → corte por fallas (principal abierto = ir directo al respaldo) → ejecutar `body` con timeout `Spec.Timeout` → si el principal falla con 429/5xx/timeout/red (`HttpRequestException`, `TaskCanceledException` que no sea del `ct` del llamador, o la excepción de estado de cada SDK con status ≥ 500 o 429) y hay respaldo: **una** reejecución de `body` con el respaldo y `Outcome = Fallback`; con 400/401/403: `AiErrors.BadKey` sin respaldo. Timeout de la tarea → `AiErrors.TimedOut`. `body` es siempre de solo lectura, por eso se puede reejecutar.

`AiCircuitBreaker` (singleton): 3 fallas seguidas por (tienda, proveedor) → abierto 5 min (`TimeProvider`).

- [ ] **Paso 1: tests que fallan** (fábrica falsa que devuelve `FakeChatClient` por modelo, contexto Ai en memoria o fakes de repositorio):
  - `Apagado_global_devuelve_Disabled`, `Tienda_apagada_devuelve_Disabled`.
  - `Tarea_sin_asignar_devuelve_NotConfigured_y_availability_lo_explica` (`Reason == "Elegí un modelo para esta tarea en Configuración → Inteligencia artificial."`).
  - `Sin_presupuesto_no_llama_al_modelo` (fábrica: 0 llamadas).
  - `503_del_principal_usa_el_respaldo_una_vez` (principal lanza 503, respaldo responde → `IsSuccess`, una fila `Fallback`).
  - `401_no_usa_el_respaldo` → `Ai.ProviderAuth`, respaldo con 0 llamadas.
  - `Tres_fallas_abren_el_circuito_y_va_directo_al_respaldo`.
  - `Timeout_devuelve_TimedOut`.
  - `Errores_de_IA_no_son_500` (`AiErrors.Unavailable.ToProblem()` → 503; `AiErrors.Budget.ToProblem()` → 409).
  - `WithTools_corta_en_MaxIterations` (un `FakeChatClient` que siempre pide la misma herramienta: se detiene en `Spec.MaxIterations` respuestas).
  - `System_marca_cache_solo_en_Anthropic` (con un modelo de Anthropic el mensaje lleva la marca de caché del SDK; con uno de OpenAI no lleva nada extra).
  - `AiKeyProtector_usa_el_purpose_fijo` (`AiKeyProtector.Purpose == "Tiendafy.Ai.Keys.v1"`; protect/unprotect ida y vuelta con `EphemeralDataProtectionProvider`).
- [ ] **Paso 2–4:** FAIL → implementar → PASS.
- [ ] **Paso 5:** commit `feat(ia): gateway con tope, respaldo, corte por fallas y límites por tarea`.

### Tarea 8: Rate limit `ai` y concurrencia

**Archivos:**
- Modificar: `backend/src/Api/Startup/ServiceRegistration.cs` (`AddAppRateLimiting`, `:237-300`)
- Crear: `backend/src/Api/Ai/AiConcurrency.cs`
- Test: `backend/tests/UnitTests/Api/Ai/AiConcurrencyTests.cs`; `backend/tests/IntegrationTests/AiRateLimitTests.cs`

**Interfaces — produce:**
```csharp
// ServiceRegistration: helper PerUserPerPath(ctx, permitLimit) junto a PerIpPerPath (clave = userId ?? ip, + path).
// Políticas: "ai" = PerUserPerPath 30 / 5 min (config RateLimiting:AiPermitLimit); "ai-jobs" = por tienda, 5 / hora (RateLimiting:AiJobsPermitLimit).
public sealed class AiConcurrency   // singleton
{ public IDisposable? TryEnter(string scope, string key); }   // B: ("assistant", userId) ; C: ("catalog-job", tenantId). Null = ocupado → AiErrors.Busy.
```
- [ ] **Paso 1: test que falla**: `TryEnter_dos_veces_la_misma_clave_da_null_hasta_liberar`. (El test de integración del rate limit va en la Tarea 10, que crea el primer endpoint con la política.)
- [ ] **Paso 2–4:** FAIL → implementar → PASS. En `ApiFactory` subir ambos cupos como los demás (`:71-73`).
- [ ] **Paso 5:** commit `feat(ia): rate limit por usuario y una ejecución pesada a la vez`.

### Tarea 9: Configuración por tienda (endpoints y permiso)

**Archivos:**
- Modificar: `Identity.Infrastructure/Permissions.cs` (enum al final + entrada del catálogo, grupo `"Configuración"`)
- Crear: `backend/src/Api/Endpoints/AiConfigEndpoints.cs`, `backend/src/Api/Ai/AiConfigService.cs`
- Modificar: `backend/src/Api/Startup/PipelineExtensions.cs` (`MapApiV1`)
- Test: `backend/tests/IntegrationTests/AiConfigTests.cs`, `backend/tests/IntegrationTests/Infrastructure/FakeAi.cs`, `ApiFactory.cs` (reemplazo de `IAiChatClientFactory` en `ConfigureTestServices`, `:107`; borrar `UseSetting("Ai:ApiKey", …)`, `:97`)

**Interfaces — produce:**
```csharp
// Permissions.cs
AiConfig   // new(Permission.AiConfig, "ai.config", "Configuración", "Inteligencia artificial",
           //     "Claves de los proveedores, modelos, tope mensual y consumo.", [], Sensitive: true, OwnerOnly: true)
// Endpoints (grupo /api/v1/ai/config, RequireTenant, RequirePermission(AiConfig)):
GET    /ai/config                      → AiConfigDto
PUT    /ai/config/providers/{provider} { apiKey }        (vacía = conserva; 400 si no existe y viene vacía)
DELETE /ai/config/providers/{provider}
POST   /ai/config/providers/{provider}/test              → { ok, message }   (usa CheapestOf, tarea ShortText, 1 mensaje "ok")
PUT    /ai/config/assignments  { items: [{ task, primaryModel, fallbackModel? }] }
PUT    /ai/config/settings     { enabled, monthlyBudgetUsd (decimal en el wire, a micro-USD en el server), alertThresholdPct }
public sealed record AiConfigDto(AiProviderDto[] Providers, AiAssignmentDto[] Assignments, AiSettingsDto Settings, AiTaskOptionsDto[] Tasks);
public sealed record AiProviderDto(string Provider, bool Configured, string? Last4, bool? LastTestOk, DateTime? LastTestAt);
public sealed record AiTaskOptionsDto(string Task, string Label, string[] EligibleModels, string[] SuggestedModels, string? Warning);
// Integración: FakeAi — ApiFactory.Ai.Respond(modelId, params ChatResponse[]), .Throw(modelId, Exception),
//              .Calls(modelId) (mensajes recibidos), .Options(modelId) (ChatOptions de cada llamada)
```
Reglas: un modelo de una asignación tiene que existir en el catálogo, ser `Eligible` para la tarea y tener la clave de su proveedor; `enabled = true` exige `monthlyBudgetUsd > 0`; `Warning` de `CatalogJudge` cuando su principal es del mismo proveedor que el principal de `CatalogWrite` ("Conviene que evalúe un modelo de otro proveedor."). Borrar una clave deja las asignaciones y `AvailabilityAsync` las informa como no disponibles con motivo ("Falta la clave de {Proveedor}.").

- [ ] **Paso 1: tests que fallan** (`AiConfigTests`, dueño y admin con `Merchant`):
  - `La_clave_nunca_vuelve`: PUT `{ apiKey: "sk-test-123456a1b2" }` → GET: `last4 == "a1b2"` y el JSON entero no contiene `"sk-test-123456a1b2"`.
  - `Put_vacio_conserva_y_delete_borra`.
  - `Solo_el_duenio_configura` (admin → 403 en GET y PUT).
  - `Asignar_un_modelo_sin_clave_da_400`, `Asignar_Groq_a_InvoiceRead_da_400`.
  - `Habilitar_sin_tope_da_400`.
  - `Probar_conexion_registra_el_resultado` (`FakeAi` responde → `lastTestOk == true`; lanza 401 → `false` y `message` con "no es válida").
  - `Borrar_la_clave_deja_la_tarea_no_disponible_con_motivo` (vía `GET /ai/status`, Tarea 10).
  - Agregar las rutas nuevas a lo que exige `EndpointPermissionTests` (ya cubiertas por `RequirePermission`).
- [ ] **Paso 2–4:** FAIL → implementar → PASS.
- [ ] **Paso 5:** commit `feat(ia): cada tienda carga sus claves, elige modelos por tarea y fija su tope`.

### Tarea 10: Migrar los usos actuales al gateway

**Archivos:**
- Modificar: `backend/src/Api/Endpoints/AiEndpoints.cs`, `backend/src/Api/Purchasing/InvoiceScanner.cs`
- Borrar: `backend/src/Api/Ai/AiClient.cs`
- Modificar: `infra/docker/docker-compose.stack.yml` (borrar `Ai__ApiKey`, `Ai__Model`, `:195-196`), cualquier `.env.*.example` que los nombre
- Test: reescribir `backend/tests/IntegrationTests/AiFlowTests.cs` con `FakeAi`; pasar a `FakeAi` también `PurchasingFlowTests.cs` (hoy simula Claude por HTTP)

**Interfaces — produce:**
```csharp
GET  /ai/status → { tasks: [{ task, available, reason }] }          // reemplaza { enabled }
POST /ai/short-text { kind: "social-post" | "product-description", draft?, productName?, name?, notes? } → { text }
     // reemplaza /ai/social-post y /ai/product-description; permiso según kind (SocialPublish / CatalogWrite), política "ai"
// /ai/ml-answer y /ai/support-reply quedan, pasando por el gateway con la tarea QuestionDraft y una sola llamada sin herramientas,
// hasta que la Parte A los reemplace (A los borra).
// InvoiceScanner: misma firma pública; adentro, IAiGateway.RunAsync(AiTask.InvoiceRead, …) con DataContent(bytes, mediaType).
```
Prompts: los mismos textos que hoy (no se reescriben en esta tarea). Todos los endpoints de IA con `.RequireRateLimiting("ai")`.

- [ ] **Paso 1: tests que fallan** (`AiFlowTests` reescrito):
  - `Status_lista_las_tareas_con_motivo` (sin config: todas `available == false`).
  - `ShortText_sugiere_y_sobrevive_a_un_fallo` (equivale al test actual: respuesta → `text` recortado; vacío → 400; el modelo lanza 503 sin respaldo → error explicado, no 500).
  - `Cada_sugerencia_queda_en_el_consumo` (después de una sugerencia, una fila en `ai_usage` con la tarea `ShortText`).
  - `Factura_pasa_el_pdf_al_modelo` (el `FakeAi` recibe un `DataContent` con `application/pdf`).
  - `Ai_limita_por_usuario` (`AiRateLimitTests`, con `RateLimiting:AiPermitLimit=2` en un `ApiFactory` propio): la tercera llamada a `POST /ai/short-text` → 429 con título `RateLimit.Exceeded`; otro usuario de la misma tienda sigue pudiendo.
- [ ] **Paso 2–4:** FAIL → implementar → PASS. Correr `pnpm fixtures:api` (cambia `/ai/status`).
- [ ] **Paso 5:** commit `refactor(ia): los botones de IA y la lectura de facturas pasan por el gateway`.

### Tarea 11: Consumo y aviso en Inicio

**Archivos:**
- Crear: `backend/src/Api/Endpoints/AiUsageEndpoints.cs`, `backend/src/Api/Ai/AiUsageQueries.cs`
- Modificar: `backend/src/Api/Endpoints/HomeEndpoints.cs` (`:36-86`, campo `aiBudget`)
- Test: `backend/tests/IntegrationTests/AiUsageTests.cs`, `HomeTodoTests.cs`

**Interfaces — produce:**
```csharp
GET /ai/config/usage?month=2026-10&scope=store|owned   (AiConfig)
  → { month, scope, budgetMicroUsd, spentMicroUsd, byDay: [{ day, microUsd }], byTask: [...], byModel: [...], byUser: [{ userId, name, microUsd }],
      stores?: [{ tenantId, name, spentMicroUsd, budgetMicroUsd }] }      // stores solo con scope=owned
// scope=owned: suma de MembershipService.OwnedTenantIdsAsync(userId) — IgnoreQueryFilters + Where(TenantId in owned).
// /home/todo: aiBudget = { pct, level: "warn" | "over" } cuando pct >= umbral; null si no aplica o el usuario no tiene AiConfig.
```
- [ ] **Paso 1: tests que fallan**: `Owned_suma_solo_tiendas_propias` (dueño de A y B, admin de C con consumo → `stores` tiene A y B, no C); `Agrupa_por_dia_en_hora_argentina`; `Home_avisa_al_80_por_ciento` (tope 1 USD, 0,85 USD gastado → `aiBudget.level == "warn"`); `Home_no_avisa_a_quien_no_es_duenio`.
- [ ] **Paso 2–4:** FAIL → implementar → PASS. `pnpm fixtures:api`.
- [ ] **Paso 5:** commit `feat(ia): consumo del mes por tienda y de todas mis tiendas, con aviso en Inicio`.

### Tarea 12: Copiar a mis otras tiendas

**Archivos:**
- Modificar: `AiConfigEndpoints.cs`, `AiConfigService.cs`
- Test: `backend/tests/IntegrationTests/AiConfigCopyTests.cs`

**Interfaces — produce:**
```csharp
POST /ai/config/copy { targetTenantIds: Guid[], keys: bool, models: bool, budget: bool } → { copied: Guid[] }   (AiConfig)
// Cada destino tiene que estar en OwnedTenantIdsAsync; si alguno no está: 403 y no se copia nada (todo o nada, una transacción).
// Claves: Unprotect + Protect con el mismo purpose; pisa las del destino. Modelos: pisa asignaciones. Presupuesto: pisa AiSettings.
```
- [ ] **Paso 1: tests que fallan**: `Copia_claves_modelos_y_tope_a_tienda_propia`; `Destino_ajeno_da_403_y_no_copia_nada`; `Solo_copia_lo_elegido` (`keys: false` → el destino no tiene claves).
- [ ] **Paso 2–4:** FAIL → implementar → PASS.
- [ ] **Paso 5:** commit `feat(ia): copiar la configuración de IA a mis otras tiendas`.

### Tarea 13: Panel — hook de disponibilidad y botones actuales

**Archivos:**
- Modificar: `admin/src/lib/useAi.ts` (`useAiEnabled` → `useAiTask(task)`), `admin/src/lib/queryKeys.ts` (`qk.aiStatus(storeId)`)
- Modificar: `pages/redes-composer.tsx:185`, `pages/Products/product-form.tsx:46` (→ `/ai/short-text`), `pages/mercadolibre-preguntas.tsx:75`, `pages/inbox-thread.tsx:560,564`, `pages/SupportChat.tsx:215`, `pages/compras-factura.tsx` (solo el gating)
- Test: `admin/src/lib/useAi.test.tsx` y los tests existentes de esas páginas

**Interfaces — produce:**
```ts
export type AiTask = 'QuestionClassify' | 'QuestionDraft' | 'DataAssistant' | 'CatalogWrite' | 'CatalogJudge' | 'InvoiceRead' | 'ShortText';
export function useAiTask(task: AiTask): { available: boolean; reason: string | null };
```
Con `available == false` y `reason`, el botón no desaparece en silencio para quien tiene el permiso de la función: queda deshabilitado con `reason` como tooltip (anti-objetivo de la spec). Sin ninguna tarea configurada en la tienda, el botón no se muestra (como hoy).

- [ ] **Paso 1: tests que fallan**: `useAiTask` devuelve `reason` del status; en `product-form`, con `ShortText` no disponible por presupuesto, el botón "Sugerir" está deshabilitado y su tooltip dice el motivo.
- [ ] **Paso 2:** `VITEST_MAX_WORKERS=2 pnpm --filter tiendafy-admin exec vitest run src/lib/useAi src/pages/Products` → FAIL.
- [ ] **Paso 3–4:** implementar → PASS.
- [ ] **Paso 5:** commit `feat(panel): los botones de IA dicen por qué no están disponibles`.

### Tarea 14: Panel — Configuración → Inteligencia artificial

**Archivos:**
- Crear: `admin/src/pages/Settings/AiSettings.tsx`, `AiProvidersCard.tsx`, `AiModelsCard.tsx`, `AiBudgetCard.tsx`, `AiUsageCard.tsx`, `AiCopyDialog.tsx`, `admin/src/lib/ai.ts` (tipos y labels)
- Modificar: `admin/src/App.tsx:146` (`{ path: 'inteligencia-artificial', el: <AiSettingsPage /> }`), `admin/src/lib/access.ts:65` (`'inteligencia-artificial': 'ai.config'`), `admin/src/config/navigation.tsx:312` (grupo nuevo o el de "Tienda": ícono `Sparkles`, desc "Claves, modelos, tope mensual y consumo de la IA.")
- Modificar: `admin/src/pages/Home.tsx:244` (`todoAvisos`: aviso de `aiBudget` con link a la pantalla)
- Test: `admin/src/pages/Settings/AiSettings.test.tsx`

Comportamiento (spec, "Pantalla"): tarjetas de proveedores (`…a1b2`, cargar/reemplazar/borrar con confirmación, probar), modelos por tarea (principal y respaldo; solo `EligibleModels`; botón "Usar recomendados" que completa con `SuggestedModels[0]`; muestra `Warning`), presupuesto (interruptor deshabilitado hasta que haya tope; sugiere 20), consumo (`KpiCard` gastado vs tope, `BarChart` por día, `RankBars` por tarea, modelo y persona; selector "Esta tienda / Todas mis tiendas"; leyenda "Estimado. La factura real es la de cada proveedor; poné también un límite en su consola."), y el diálogo de copiar (lista de tiendas propias, tres checkboxes, confirmación "Esto reemplaza la configuración de IA de las tiendas elegidas."). Montos en USD con `ArgentineNumbers` del lado del panel (el helper equivalente del front).

- [ ] **Paso 1: tests que fallan**: la clave nunca se muestra (después de guardar, el input queda vacío y se ve `…a1b2`); "Usar recomendados" completa las tareas; el interruptor está deshabilitado sin tope; el selector "Todas mis tiendas" pide `scope=owned`; la pantalla aparece en `ALL_PATHS` y la ve solo quien tiene `ai.config`.
- [ ] **Paso 2:** `VITEST_MAX_WORKERS=2 pnpm --filter tiendafy-admin exec vitest run src/pages/Settings/AiSettings src/pages/Home` → FAIL.
- [ ] **Paso 3–4:** implementar → PASS (incluidos los tests que recorren `ALL_PATHS`).
- [ ] **Paso 5:** commit `feat(panel): pantalla de inteligencia artificial con claves, modelos, tope y consumo`.

### Tarea 15: Documentación y cierre

**Archivos:**
- Crear: `docs/integraciones/ia.md` (proveedores, cómo sacar cada clave, tareas, tope, qué se registra y qué no, purpose)
- Modificar: `docs/despliegue.md` (tras el deploy: cargar claves en cada tienda, poner límite en la consola de cada proveedor, `Ai__Disabled`), `docs/permisos.md` (`AiConfig`), `docs/configuracion.md` (borrar `Ai__ApiKey`/`Ai__Model`, sumar `Ai__Disabled`, `RateLimiting:AiPermitLimit`, `RateLimiting:AiJobsPermitLimit`), `AGENTS.md` (sumar `Tiendafy.Ai.Keys.v1` a los ejemplos de purpose), `docs/README.md` (índice), centro de ayuda (`admin/src/config/help-content-*.ts`: entrada "Inteligencia artificial")
- [ ] **Paso 1:** `git grep -n "Ai__ApiKey\|AI_API_KEY\|AiClient\b\|useAiEnabled"` → vacío.
- [ ] **Paso 2:** `pnpm verify --back` y `pnpm verify --front` (por separado) → verdes.
- [ ] **Paso 3:** construir y **correr** la imagen de la API (`AGENTS.md`, "Lecciones"): `docker build -f backend/Dockerfile .` y levantar con el compose de dev; `GET /api/v1/ai/status` responde.
- [ ] **Paso 4:** commit `docs(ia): integración de IA, despliegue, permisos y ayuda del panel`.

**Al terminar la Parte 0, el contrato queda congelado:** `IAiGateway`, `AiRunContext`, `AiRunOptions`, `AiTask`, `AiTaskSpecs`, `AiErrors` (con sus tipos), la forma de declarar herramientas, `AiConcurrency`, `FakeAi` (integración) y `FakeChatClient` (unit), ambos registrando `ChatOptions`. Una cadena de varios pasos (C, D) hace **un `RunAsync` por llamada al modelo**, así cada reserva cubre exactamente su llamada. A–D no los cambian; si una parte necesita algo más, se agrega sin romper y se avisa en su plan.
