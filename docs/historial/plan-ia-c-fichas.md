# IA — Parte C (fichas del catálogo en lote): plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usá superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`).

**Objetivo:** la persona elige hasta 500 productos, ve cuántos son, el costo estimado y cuánto le queda del tope, y al confirmar un worker redacta para cada uno descripción, SEO y **los atributos reales de su categoría de Mercado Libre**, los pasa por un gate determinista y por un evaluador de otro proveedor (máximo 2 intentos), y deja todo para revisar. Aprobar guarda en la tienda y en las tablas de ML; mandar a la publicación de ML es otro clic.

**Arquitectura:** orquestación en `backend/src/Api/Ai/Catalog/` (selección, estimación, gate, prompts, bucle redactar-evaluar, worker, revisión, endpoints) sobre el contrato congelado de la Parte 0 (`IAiGateway`). Lectura de ML (categoría, predicción, atributos de la categoría, una llamada a la vez por tienda) y escritura de atributos en `backend/src/Api/Meli/`. Persistencia en las tablas que ya creó la Parte 0: `AiCatalogJob`/`AiCatalogJobItem` (`Modules/Ai`) y `MeliProductCategory`/`MeliProductAttribute` (`Modules/MercadoLibre`). Panel: acción en Catálogo y pantalla de revisión en `admin/src/pages/Products/`.

**Stack:** .NET 10, EF Core + Npgsql, Microsoft.Extensions.AI (lo que dejó la Parte 0), `IMemoryCache`; Vite + React 19 + React Query.

**Spec:** [diseno-ia-multi-proveedor.md](./diseno-ia-multi-proveedor.md), "Parte C" — leela entera, y también el plan de la base: [plan-ia-0-base.md](./plan-ia-0-base.md). Este plan **arranca con la Parte 0 terminada** y no la rediseña.

**Consume (contrato congelado de la Parte 0, no se cambia):**
```csharp
IAiGateway.RunAsync<T>(AiTask task, AiRunOptions options, Func<AiRunContext, CancellationToken, Task<T>> body, CancellationToken ct)  // Result<T>
IAiGateway.AvailabilityAsync(ct)                       // AiTaskAvailability(Task, Available, Reason)
AiRunOptions(int EstimatedInputTokens, Guid? TenantId, Guid? UserId)   // el worker pasa TenantId y UserId (no hay request)
AiRunContext: RunId, Spec, Model, Chat, NewOptions(), System(stableText)   // C no usa WithTools: CatalogWrite y CatalogJudge van sin herramientas
AiTask.CatalogWrite, AiTask.CatalogJudge; AiTaskSpecs.For(task); AiModelCatalog.Find(id); AiCost.MicroUsd / WorstCaseMicroUsd
AiErrors (Ai.Disabled, Ai.TaskNotConfigured, Ai.BudgetExceeded, Ai.Busy, Ai.ProviderAuth, Ai.Unavailable, Ai.TimedOut)
AiBudget.CommittedMicroUsdAsync(tenantId, ct); AiConcurrency.TryEnter("catalog-job", tenantId.ToString())
Política de rate limit "ai-jobs" (5 por hora por tienda)
AiDbContext.CatalogJobs / CatalogJobItems / Settings / Assignments / Usage; MeliDbContext.ProductCategories / ProductAttributes
Tests: FakeAi (ApiFactory.Ai.Respond / Throw / Calls) en integración; FakeChatClient en unit
```

## Restricciones globales

- Idioma: textos, comentarios, commits y docs en rioplatense con voseo; identificadores en inglés (`AGENTS.md`).
- **Ninguna migración.** Las tablas son las de la Parte 0 (Tareas 1 y 2 de ese plan). Lo que este plan suma a esas entidades son métodos y un valor de enum guardado como string: no cambia el esquema (Tarea 1).
- Todo uso de IA pasa por `IAiGateway`; nunca se crea un `IChatClient` acá. `CatalogWrite` y `CatalogJudge` van **sin herramientas**.
- Plata de IA en micro-dólares (`long`, sufijo `MicroUsd`), como la Parte 0.
- El system prompt de cada tarea es **constante** (sin fechas, ids ni nombres de tienda) y va con `ctx.System(...)`; los datos del producto van en el mensaje de usuario, delimitados (`<datos_del_producto>…</datos_del_producto>`).
- Al modelo van **solo datos del producto** (nombre, descripción, marca, SKU, opciones de variantes, specs, categorías de la tienda, atributos de ML ya guardados). Nunca precios, costos, stock ni datos de personas (quién pidió el trabajo, clientes).
- **Ninguna escritura hacia Mercado Libre sin su clic propio**: el worker y "aprobar" solo leen de ML. "Actualizar la ficha en ML" exige además `MeliPublish`. La cuenta de demostración nunca sale a ML.
- Llamadas del worker a ML: **una a la vez por tienda** (`MeliTenantGate`); un 429 espera y reintenta, y **no** cuenta como falla del ítem.
- `UpdateProductHandler.UpdateDetailsAsync` pide `Name` y pisa `Brand` (null la borra): aprobar pasa siempre el nombre y la marca actuales. `Product.SetSpecs` reemplaza la ficha entera: aprobar manda las specs existentes más las nuevas.
- Toda ruta de ML que use este plan se confirma en la documentación oficial antes de codificarla (regla de skills de `AGENTS.md`; Tarea 4, Paso 1).
- Compilar con `-c Release -m:1`; `dotnet format backend.slnx --no-restore` antes de cada commit; vitest con `VITEST_MAX_WORKERS=2`.
- Integración con base propia (C corre en paralelo con A, B y D): `TIENDAFY_TEST_DB="Host=localhost;Port=5432;Database=tiendafy_itests_ai_c;Username=tiendafy;Password=tiendafy"`.
- Ningún test llama a un proveedor de IA real ni a Mercado Libre (FakeAi y `ApiFactory.ExternalHttp`).

Comandos de referencia (desde `backend/`):
```bash
dotnet test tests/UnitTests -c Release -m:1 --filter "FullyQualifiedName~<Filtro>"
TIENDAFY_TEST_DB="Host=localhost;Port=5432;Database=tiendafy_itests_ai_c;Username=tiendafy;Password=tiendafy" \
  dotnet test tests/IntegrationTests -c Release -m:1 --filter "FullyQualifiedName~<Filtro>"
```

**Decisiones que toma este plan** (no estaban cerradas en la spec; se pueden revisar):
- Largos del gate: descripción 200–3.000 caracteres, título SEO hasta 60, descripción SEO 70–160.
- "Descripción corta" = menos de 300 caracteres. "Sin los atributos que pide ML" se aproxima como **"sin datos de ML guardados"** (ni categoría ni atributos en las tablas nuevas): saber qué pide cada categoría exige llamar a ML por producto, que es justamente lo que hace el trabajo.
- Solo se le piden al modelo los atributos **que faltan**: los que ya tienen valor (spec mapeada con valor, atributo de ML guardado, `BRAND` si el producto tiene marca) van como dato y no se pisan. `SELLER_SKU` nunca se pide (sale de la variante al publicar).
- Al armar atributos para ML, lo de la tienda gana: `BRAND` de la marca, `SELLER_SKU` de la variante y las specs mapeadas van primero; de `MeliProductAttribute` solo entran los ids que no estén ya.
- "Actualizar la ficha en ML" manda solo atributos (no categoría, que ML no deja cambiar con ventas, ni `SELLER_SKU`, que es de la variación).
- Crear un trabajo exige una cuenta de ML conectada y que no sea la de demostración (ver "Preguntas abiertas").
- Un trabajo activo (en cola, corriendo o pausado) por tienda a la vez: el segundo da 409.

## Foco de revisión

1. Un identificador (GTIN/EAN, modelo, número de parte) que no está textual en los datos del producto nunca llega a una propuesta aprobable: el gate lo vuelve `falta_dato` (Tarea 2) y aprobar con edición tampoco acepta un GTIN con dígito verificador inválido (Tarea 10).
2. Aprobar no hace ningún pedido a Mercado Libre; solo "Actualizar la ficha en ML" (con `MeliPublish`) hace `PUT /items/{id}`, y con la cuenta de demostración da 409 sin salir (Tareas 10 y 12).
3. Reinicio a mitad de un ítem: si la redacción ya estaba guardada, retoma en el evaluador sin volver a llamar a `CatalogWrite`; con el tope alcanzado el trabajo queda `PausedBudget` y ningún ítem queda `Failed` por eso (Tarea 9).
4. Un 429 de ML: espera y reintenta, nunca hay dos llamadas del worker a ML de la misma tienda en paralelo, y el ítem no suma intento ni falla (Tareas 3 y 9).
5. Aprobar conserva nombre, marca y specs que ya tenía el producto, y lo que es solo de ML (`GTIN`, "Es kit") va a `MeliProductAttribute`, no a la ficha que ve el comprador (Tarea 10).

---

### Tarea 1: Métodos de dominio de los trabajos de catálogo

La Parte 0 creó `AiCatalogJob` y `AiCatalogJobItem` con sus columnas pero sin comportamiento. Esto se **agrega sin romper** (regla de cierre de la Parte 0): métodos nuevos y un valor de enum al final. No hay migración: los enums se guardan como string.

**Archivos:**
- Modificar: `backend/src/Modules/Ai/Ai.Infrastructure/AiEnums.cs` (valor nuevo al final de `AiCatalogJobStatus`), `backend/src/Modules/Ai/Ai.Infrastructure/AiEntities.cs` (métodos)
- Test: `backend/tests/UnitTests/Ai/AiCatalogJobTests.cs`

**Interfaces — produce:**
```csharp
namespace Ai.Infrastructure;
public enum AiCatalogJobStatus { Queued, Running, PausedBudget, Done, Cancelled, PausedUnavailable }   // PausedUnavailable: IA apagada, sin modelo, clave inválida o ML desconectado

public sealed class AiCatalogJob
{
    public const int MaxItems = 500;
    public static AiCatalogJob Create(Guid tenantId, Guid createdBy, int total, long estimatedCostMicroUsd, DateTime nowUtc); // total 1..500, si no ArgumentOutOfRangeException
    public bool IsActive { get; }                 // Queued, Running, PausedBudget o PausedUnavailable
    public void Start(DateTime nowUtc);           // Queued → Running
    public void PauseForBudget(DateTime nowUtc);  // Running → PausedBudget
    public void PauseUnavailable(DateTime nowUtc); // Running → PausedUnavailable
    public void Resume(DateTime nowUtc);          // PausedBudget | PausedUnavailable → Running; Done → Running (reabrir por un ítem que volvió a la cola)
    public void Finish(DateTime nowUtc);          // Running → Done
    public void Cancel(DateTime nowUtc);          // cualquiera menos Done/Cancelled → Cancelled
}
public sealed class AiCatalogJobItem
{
    public static AiCatalogJobItem Create(Guid tenantId, Guid jobId, Guid productId, DateTime nowUtc);   // Pending, Attempts 0
    public void Checkpoint(string stateJson, int attempts, DateTime nowUtc);   // guarda el paso; sigue Pending y reclamado
    public void ToNeedsCategory(string stateJson, DateTime nowUtc);           // libera el reclamo
    public void ToReview(string stateJson, int attempts, int? judgeScore, string? judgeNotes, DateTime nowUtc);
    public void Fail(string stateJson, DateTime nowUtc);
    public void Requeue(string stateJson, DateTime nowUtc);                    // NeedsCategory → Pending (categoría elegida a mano), Attempts 0
    public void ReleaseClaim();                                                // ClaimedAtUtc = null (429 de ML, tope)
    public void Approve(DateTime nowUtc);                                      // Review → Approved
    public void Discard(DateTime nowUtc);                                      // Review | NeedsCategory | Failed → Discarded
}
```
Transición inválida → `InvalidOperationException` (la valida el servicio antes, con un 409 explicado; esto es la red).

- [ ] **Paso 1: tests que fallan** (`AiCatalogJobTests`):
  - `Create_rechaza_cero_y_mas_de_500`: `Create(t, u, 0, …)` y `Create(t, u, 501, …)` lanzan `ArgumentOutOfRangeException`; `Create(t, u, 500, 1_000, now).Status == Queued`.
  - `Reanudar_vale_desde_las_dos_pausas_y_desde_Done`: `PauseForBudget` → `Resume` → `Running`; `PauseUnavailable` → `Resume` → `Running`; `Finish` → `Resume` → `Running`.
  - `Cancelado_no_se_reanuda`: `Cancel` → `Resume` lanza `InvalidOperationException`.
  - `IsActive_solo_en_cola_corriendo_o_pausado`: `Done` y `Cancelled` → `false`.
  - `Requeue_vuelve_a_Pending_con_intentos_en_cero`: ítem en `NeedsCategory` → `Requeue(json, now)` → `Status == Pending`, `Attempts == 0`, `ClaimedAtUtc == null`, `ProposalJson == json`.
  - `Approve_solo_desde_Review`: ítem `Pending` → `Approve` lanza.
- [ ] **Paso 2:** `dotnet test tests/UnitTests -c Release -m:1 --filter "FullyQualifiedName~AiCatalogJobTests"` → FAIL (no compila).
- [ ] **Paso 3:** implementar los métodos y el valor de enum. Confirmar que `AiDbContext` guarda el enum con `HasConversion<string>()` (Parte 0, Tarea 1); si no, **parar** y avisar: sin eso el valor nuevo cambiaría el esquema.
- [ ] **Paso 4:** el filtro del Paso 2 y `FullyQualifiedName~Architecture` pasan.
- [ ] **Paso 5:** format y commit `feat(ia): estados y transiciones de los trabajos de fichas` (cuerpo: se agrega sin romper el contrato de la Parte 0; `PausedUnavailable` va al final del enum, sin migración).

### Tarea 2: GTIN y gate determinista

**Archivos:**
- Crear: `backend/src/Api/Ai/Catalog/Gtin.cs`, `AiCatalogProposal.cs`, `AiCatalogGate.cs`
- Crear: `backend/src/Api/Meli/MeliCategoryAttribute.cs` (el modelo que usan el gate, los prompts y el lector de la Tarea 4)
- Test: `backend/tests/UnitTests/Api/Ai/Catalog/GtinTests.cs`, `AiCatalogGateTests.cs`

**Interfaces — produce:**
```csharp
namespace Api.Meli;
public enum MeliAttributeKind { Text, Number, NumberUnit, List, Boolean, Other }
public sealed record MeliAttributeValue(string Id, string Name);
public sealed record MeliCategoryAttribute(string Id, string Name, MeliAttributeKind Kind,
    IReadOnlyList<MeliAttributeValue> Values, IReadOnlyList<string> AllowedUnits, string? DefaultUnit,
    int? MaxLength, bool Required, bool Relevant, bool IsIdentifier);

namespace Api.Ai.Catalog;
public static class Gtin
{
    public static string Normalize(string raw);     // saca espacios y guiones
    public static bool IsValid(string? value);      // 8, 12, 13 o 14 dígitos con dígito verificador módulo 10
}
public sealed record AiCatalogAttributeProposal(string Id, string? ValueId, string? ValueName, string? Unit, bool Missing); // Missing = falta_dato
public sealed record AiCatalogProposal(string Description, string SeoTitle, string SeoDescription,
    IReadOnlyList<AiCatalogAttributeProposal> Attributes);
public sealed record AiCatalogGateResult(AiCatalogProposal Cleaned, IReadOnlyList<string> Violations, IReadOnlyList<string> Notes)
{ public bool Ok => Violations.Count == 0; }
public static class AiCatalogGate
{
    public const int DescriptionMin = 200, DescriptionMax = 3_000, SeoTitleMax = 60, SeoDescriptionMin = 70, SeoDescriptionMax = 160;
    // Salida del modelo: todas las reglas. sourceText = lo que cuenta como "textual" (AiCatalogProductData.SourceText, Tarea 5).
    public static AiCatalogGateResult Check(AiCatalogProposal proposal, IReadOnlyList<MeliCategoryAttribute> asked, string sourceText);
    // Edición de una persona al aprobar: atributos de la lista, valores permitidos, unidades, GTIN válido y largos máximos;
    // no exige que un identificador esté en los datos (lo tipeó ella).
    public static IReadOnlyList<string> CheckHumanEdit(IReadOnlyList<AiCatalogAttributeProposal> attributes,
        IReadOnlyList<MeliCategoryAttribute> asked, string? description, string? seoTitle, string? seoDescription);
}
```
Reglas de `Check` (spec, Parte C, paso 2):
- Largos de las constantes; textos sin precios (`$ 1.500`, `US$`, `1500 pesos`, `ARS`, `USD`), sin links (`http(s)://`, `www.`, `algo.com`/`.com.ar`/`.net`/`.org`) y sin mails. Cada uno es una violación con texto en castellano que después se usa como crítica para reintentar.
- Un atributo que no está en `asked` se saca y es violación; un id repetido, violación.
- `List` y `Boolean`: `ValueId` o `ValueName` tienen que coincidir con uno de `Values` (sin distinguir mayúsculas); el limpio lleva el `ValueId` de la lista. Si no, violación y queda `Missing`.
- `Number`: número válido (coma o punto decimal). `NumberUnit`: número más una unidad de `AllowedUnits` (si viene sin unidad y hay `DefaultUnit`, se usa esa y va a `Notes`). `Text`: hasta `MaxLength`.
- **Identificadores** (`IsIdentifier`): el valor tiene que aparecer textual en `sourceText` (sin distinguir mayúsculas; para GTIN se compara normalizado). GTIN/EAN además con `Gtin.IsValid`. Si no cumple: **no es violación**, se vuelve `Missing` y va a `Notes` ("El GTIN no aparece en los datos del producto: queda para completar.").
- Un `Missing` nunca es violación.

- [ ] **Paso 1: tests que fallan**:
  - `GtinTests`: `IsValid("4006381333931") == true`; `IsValid("4006381333932") == false`; `IsValid("036000291452") == true` (UPC-A); `IsValid("12345") == false`; `IsValid(Normalize("400-6381 333931")) == true`.
  - `AiCatalogGateTests`:
    - `Descripcion_corta_es_violacion` (150 caracteres → `Ok == false`, una violación que menciona "200").
    - `Precio_link_o_mail_en_el_texto_es_violacion` (tres casos: `"a solo $ 15.000"`, `"mirá www.tienda.com.ar"`, `"escribinos a ventas@x.com"`).
    - `Atributo_fuera_de_la_categoria_se_saca` (`"INVENTADO"` → no está en `Cleaned.Attributes`, una violación).
    - `Valor_de_lista_no_permitido_queda_falta_dato` (COLOR `"Fucsia flúor"` con valores `Rojo/Azul` → violación y `Missing == true`).
    - `Valor_de_lista_se_normaliza_al_id` (`"rojo"` → `ValueId == "52049"` del valor `Rojo`).
    - `Numero_con_unidad_invalida_es_violacion` (`"30 pulgadas"` con unidades `cm`, `m` → violación).
    - `Numero_sin_unidad_usa_la_por_defecto` (`"30"` con `DefaultUnit = "cm"` → `Unit == "cm"`, una nota, `Ok == true`).
    - `GTIN_que_no_esta_en_los_datos_queda_falta_dato_sin_violacion` (GTIN válido `"4006381333931"` y `sourceText` sin ese número → `Missing`, `Ok == true`, una nota).
    - `GTIN_textual_con_digito_invalido_queda_falta_dato` (`"4006381333932"` presente en `sourceText` → `Missing`).
    - `GTIN_textual_y_valido_pasa` (presente como `"4006381 333931"` → se acepta).
    - `Modelo_inventado_queda_falta_dato` (`MODEL = "XR-500"` con `sourceText` sin `"XR-500"` → `Missing`).
    - `Edicion_humana_acepta_GTIN_valido_que_no_esta_en_los_datos` y `Edicion_humana_rechaza_GTIN_invalido`.
- [ ] **Paso 2:** `dotnet test tests/UnitTests -c Release -m:1 --filter "FullyQualifiedName~Api.Ai.Catalog"` → FAIL (no compila).
- [ ] **Paso 3:** implementar `Gtin`, los records y `AiCatalogGate` con las firmas de arriba (funciones puras; las regex, `static readonly` con `RegexOptions.Compiled`).
- [ ] **Paso 4:** el filtro del Paso 2 pasa.
- [ ] **Paso 5:** format y commit `feat(ia): gate determinista de las fichas, con identificadores que nunca se inventan`.

### Tarea 3: Mercado Libre de a una llamada por tienda, con espera ante el 429

**Archivos:**
- Crear: `backend/src/Api/Meli/MeliTenantGate.cs`
- Modificar: `backend/src/Api/Startup/ServiceRegistration.cs` (junto a `MeliTokenService`, `:171`: `MeliTenantGate` singleton y `MeliWait` singleton con `Task.Delay`)
- Test: `backend/tests/UnitTests/Meli/MeliTenantGateTests.cs`

**Interfaces — produce:**
```csharp
namespace Api.Meli;
public delegate Task MeliWait(TimeSpan delay, CancellationToken ct);   // producción: Task.Delay; tests: no espera y anota
public sealed class MeliBusyException(string message) : Exception(message);   // ML sigue limitando después de los reintentos
public sealed class MeliTenantGate(MeliWait wait)   // singleton
{
    public const int Max429Retries = 5;            // esperas 1, 2, 4, 8 y 16 s
    public Task<T> RunAsync<T>(Guid tenantId, Func<CancellationToken, Task<T>> call, CancellationToken ct);
}
```
Un `SemaphoreSlim(1, 1)` por tienda en un `ConcurrentDictionary` (mismo patrón que `MeliTokenService.Locks`). `MeliException` con `Status == 429` → `wait(2^n s)` y reintento **dentro del mismo turno** del semáforo (así ningún otro pedido de la tienda se cuela mientras ML limita); agotados los reintentos, `MeliBusyException("Mercado Libre está limitando el tráfico; se sigue en un rato.")`. Cualquier otra `MeliException` sale tal cual.

- [ ] **Paso 1: tests que fallan** (`MeliTenantGateTests`, con un `MeliWait` que anota las esperas y no espera):
  - `Una_llamada_a_la_vez_por_tienda`: dos `RunAsync` de la misma tienda con `Task.WhenAll`, cada una con un `TaskCompletionSource` que se libera a mano → máximo observado de llamadas simultáneas == 1.
  - `Tiendas_distintas_van_en_paralelo`: lo mismo con dos tiendas → máximo observado == 2.
  - `429_espera_y_reintenta`: la llamada lanza `MeliException("x", HttpStatusCode.TooManyRequests)` una vez y después devuelve 7 → resultado 7, esperas anotadas `[1 s]`.
  - `429_persistente_termina_en_MeliBusy`: siempre 429 → `MeliBusyException`, esperas `[1, 2, 4, 8, 16 s]`.
  - `Otro_error_no_se_reintenta`: 500 → sale la `MeliException`, ninguna espera.
- [ ] **Paso 2:** `dotnet test tests/UnitTests -c Release -m:1 --filter "FullyQualifiedName~MeliTenantGateTests"` → FAIL.
- [ ] **Paso 3:** implementar y registrar.
- [ ] **Paso 4:** pasa.
- [ ] **Paso 5:** format y commit `feat(meli): de a una llamada por tienda y espera ante el límite de Mercado Libre`.

### Tarea 4: Lector de categorías y atributos de ML

**Archivos:**
- Crear: `backend/src/Api/Meli/MeliCatalogReader.cs`, `backend/src/Api/Meli/MeliAttributeSelection.cs`
- Modificar: `backend/src/Api/Endpoints/MeliEndpoints.cs` (`/categories/predict`, `:817`: usa `MeliCatalogReader.ParseSuggestions`; la respuesta no cambia), `ServiceRegistration.cs` (`MeliCatalogReader` scoped)
- Test: `backend/tests/UnitTests/Meli/MeliCatalogReaderTests.cs`, `MeliAttributeSelectionTests.cs`, `backend/tests/IntegrationTests/MeliCatalogReaderTests.cs`

**Interfaces — produce:**
```csharp
namespace Api.Meli;
public sealed record MeliReaderConnection(Guid TenantId, string SiteId, string Token);
public sealed record MeliCategoryRef(string Id, string Name);
public sealed record MeliCategorySuggestion(string CategoryId, string CategoryName, string? DomainName);
public sealed class MeliCatalogReader(MeliDbContext db, MeliTokenService tokens, MeliClient client, MeliTenantGate gate, IMemoryCache cache)
{
    public static readonly TimeSpan CacheTtl = TimeSpan.FromHours(24);
    public Task<MeliReaderConnection?> ConnectAsync(Guid tenantId, CancellationToken ct);  // IgnoreQueryFilters + TenantId; null si no hay conexión, es demo o no hay token
    public Task<string?> ItemCategoryIdAsync(MeliReaderConnection c, string itemId, CancellationToken ct);         // GET /items/{id} (solo category_id); 404 → null
    public Task<IReadOnlyList<MeliCategorySuggestion>> PredictAsync(MeliReaderConnection c, string title, CancellationToken ct); // la ruta de domain_discovery de :828
    public Task<MeliCategoryRef?> CategoryAsync(MeliReaderConnection c, string categoryId, CancellationToken ct);  // GET /categories/{id}; 404 → null; caché 24 h
    public Task<IReadOnlyList<MeliCategoryAttribute>> AttributesAsync(MeliReaderConnection c, string categoryId, CancellationToken ct); // caché 24 h
    public static IReadOnlyList<MeliCategorySuggestion> ParseSuggestions(JsonElement root);
    public static IReadOnlyList<MeliCategoryAttribute> ParseAttributes(JsonElement root);
}
public static class MeliAttributeSelection
{
    public const int MaxAsked = 40;
    // Solo obligatorios y los que mejoran la publicación, sin los ocultos/solo lectura/fijos ni los ya cargados;
    // obligatorios primero, después por el orden de ML; corta en MaxAsked.
    public static IReadOnlyList<MeliCategoryAttribute> ToAsk(IReadOnlyList<MeliCategoryAttribute> category, IReadOnlySet<string> alreadyFilled);
}
```
Todas las llamadas pasan por `MeliTenantGate.RunAsync(c.TenantId, …)`. La caché de categoría y de atributos es **por id de categoría y global**: son datos públicos de ML, iguales para todas las tiendas (no hay dato de una tienda adentro). Clave `meli:cat:{id}` y `meli:cat-attrs:{id}`.

- [ ] **Paso 1: confirmar en la documentación oficial de Mercado Libre** (developers.mercadolibre.com.ar, regla de `AGENTS.md`) antes de escribir código, y anotar lo confirmado en el comentario de `MeliCatalogReader` con la fecha:
  - la ruta de atributos de una categoría (`GET /categories/{id}/attributes`) y sus campos: `id`, `name`, `value_type` (y qué valores trae: `string`, `number`, `number_unit`, `list`, `boolean`, …), `values`, `allowed_units`, `default_unit`, `value_max_length`, `tags` y **cuáles de sus claves marcan obligatorio** (`required`, `catalog_required`, `conditional_required`, …) y cuáles excluyen (`hidden`, `read_only`, `fixed`, `others`, `variation_attribute`…), `relevance` (qué valor es "mejora la publicación") y `hierarchy` (si `PRODUCT_IDENTIFIER` marca los identificadores);
  - qué ids son identificadores (`GTIN`, `MPN`, `MODEL`, `ALPHANUMERIC_MODEL`… según la doc) para `IsIdentifier`;
  - `GET /items/{id}` con filtro de campos para traer solo `category_id`, y `GET /categories/{id}` (campo `name`);
  - cómo se manda un atributo en `PUT /items/{id}` (`value_id` vs `value_name`, y el formato de `number_unit`): lo usa la Tarea 12.
  Si algo difiere de este plan, se ajusta acá y en las tareas que lo usan, y se dice en el cuerpo del commit.
- [ ] **Paso 2: tests que fallan**:
  - Unit `MeliCatalogReaderTests` (JSON de ejemplo copiado de la doc confirmada, en `TestData`):
    - `ParseAttributes_lee_tipo_valores_unidades_y_marcas`: un `list` con dos valores → `Kind == List`, `Values.Count == 2`; un `number_unit` con `allowed_units` `cm`, `m` y `default_unit` `cm`; uno con la marca de obligatorio → `Required == true`; el GTIN → `IsIdentifier == true`.
    - `ParseSuggestions_ignora_las_que_no_tienen_categoria`.
  - Unit `MeliAttributeSelectionTests`:
    - `Deja_solo_obligatorios_y_relevantes` (de 5: uno obligatorio, uno relevante, uno común, uno oculto, uno de solo lectura → quedan 2).
    - `Saca_los_ya_cargados_y_SELLER_SKU` (`alreadyFilled = { "BRAND" }` → sin `BRAND`; `SELLER_SKU` nunca).
    - `Corta_en_40_con_los_obligatorios_primero`.
  - Integración `MeliCatalogReaderTests` (comercio conectado con `MeliAccount.ConnectAsync`, ver abajo):
    - `Atributos_se_piden_una_vez_por_categoria`: dos `AttributesAsync` de la misma categoría → `ExternalHttp.SentTo(".../categories/MLA1/attributes").Count == 1`.
    - `Demo_no_conecta`: tienda con la cuenta de demostración → `ConnectAsync == null` y ningún pedido a `api.mercadolibre.com`.
    - `Item_borrado_da_null`: `GET /items/MLA9` responde 404 → `ItemCategoryIdAsync == null`.
  - Helper de tests: mover `ConnectedAsync` y `StubTokens` de `MercadoLibreFlowTests` a `backend/tests/IntegrationTests/Infrastructure/MeliAccount.cs` como `MeliAccount.ConnectAsync(ApiFactory factory, string tag) → (Merchant, long UserId)` y `MeliAccount.Api = "https://api.mercadolibre.com"`; `MercadoLibreFlowTests` pasa a usarlo sin cambiar ningún test.
- [ ] **Paso 3:** `dotnet test tests/UnitTests -c Release -m:1 --filter "FullyQualifiedName~Meli"` y la integración con `--filter "FullyQualifiedName~MeliCatalogReaderTests|FullyQualifiedName~MercadoLibreFlowTests"` → FAIL los nuevos.
- [ ] **Paso 4:** implementar; el endpoint `/categories/predict` usa `ParseSuggestions` (los tests de `MercadoLibreFlowTests` que lo cubren siguen verdes).
- [ ] **Paso 5:** los filtros del Paso 3 pasan.
- [ ] **Paso 6:** format y commit `feat(meli): categoría de una publicación, predicción y atributos de una categoría, con caché`.

### Tarea 5: Categoría del producto y datos para el modelo

**Archivos:**
- Crear: `backend/src/Api/Meli/MeliCategoryResolver.cs`, `backend/src/Api/Ai/Catalog/AiCatalogProductData.cs`
- Modificar: `ServiceRegistration.cs` (`MeliCategoryResolver` scoped)
- Test: `backend/tests/UnitTests/Api/Ai/Catalog/MeliCategoryResolverTests.cs`, `AiCatalogProductDataTests.cs`; `backend/tests/IntegrationTests/MeliCategoryResolverTests.cs`

**Interfaces — produce:**
```csharp
namespace Api.Meli;
public abstract record MeliCategoryResolution
{
    public sealed record Resolved(MeliCategoryRef Category, MeliCategorySource Source) : MeliCategoryResolution;
    public sealed record Unclear(IReadOnlyList<MeliCategorySuggestion> Suggestions) : MeliCategoryResolution;   // "elegí la categoría"
}
public sealed class MeliCategoryResolver(MeliDbContext db, MeliCatalogReader reader)
{
    // 1) MeliProductCategory guardada; 2) publicación vinculada (MeliItemLink) → GET /items/{id} category_id;
    // 3) predicción por el nombre del producto. Sin IA.
    public Task<MeliCategoryResolution> ResolveAsync(MeliReaderConnection c, Guid productId, string productName, CancellationToken ct);
    // Clara = una sola sugerencia, o todas con el mismo nombre de categoría. Más de un nombre distinto o ninguna → Unclear.
    public static MeliCategoryResolution FromPrediction(IReadOnlyList<MeliCategorySuggestion> suggestions);
}

namespace Api.Ai.Catalog;
public sealed record AiCatalogProductData(Guid ProductId, string Name, string? Description, string? Brand,
    IReadOnlyList<string> Skus, IReadOnlyList<string> VariantOptions, IReadOnlyList<(string Name, string Value)> Specs,
    IReadOnlyList<string> StoreCategories, IReadOnlyList<(string AttributeId, string Value)> SavedMeliAttributes)
{
    public string SourceText { get; }      // todo lo anterior junto: lo que cuenta como "textual" en el gate
    public static AiCatalogProductData From(Product product, IReadOnlyList<SpecDefinition> definitions,
        IReadOnlyList<MeliProductAttribute> saved, IReadOnlyList<string> storeCategoryNames);
    // Ids que ya tienen valor: specs mapeadas (SpecDefinition.MeliAttributeId) con valor, atributos guardados, BRAND si hay marca.
    public IReadOnlySet<string> FilledMeliAttributeIds(IReadOnlyList<SpecDefinition> definitions);
}
```
Una spec mapeada cuenta solo si su definición aplica al producto (`SpecDefinition.CategoryIds` vacío o con alguna categoría del producto). `From` no lee precios, costos ni stock: el record no tiene dónde ponerlos.

- [ ] **Paso 1: tests que fallan**:
  - Unit `MeliCategoryResolverTests` (sobre `FromPrediction`):
    - `Una_sugerencia_es_clara` → `Resolved` con `Source == Predicted`.
    - `Tres_con_el_mismo_nombre_es_clara`.
    - `Dos_nombres_distintos_es_Unclear` → `Unclear.Suggestions.Count == 2`.
    - `Ninguna_es_Unclear_vacia`.
  - Unit `AiCatalogProductDataTests`:
    - `SourceText_incluye_nombre_descripcion_skus_y_specs`.
    - `Spec_mapeada_de_otra_categoria_no_cuenta_como_cargada`.
    - `BRAND_cuenta_como_cargada_si_hay_marca`.
  - Integración `MeliCategoryResolverTests`:
    - `La_guardada_gana_y_no_llama_a_ML` (fila en `meli_product_categories` → `Resolved(…, Manual)` y 0 pedidos a `api.mercadolibre.com`).
    - `Con_publicacion_vinculada_usa_su_categoria` (`MeliItemLink` + `GET /items/MLA555` → `{ category_id: "MLA1" }`, `GET /categories/MLA1` → `{ name: "Taladros" }` → `Resolved(MLA1, "Taladros", Listing)`; ningún pedido a `domain_discovery`).
    - `Sin_vinculo_predice` (`domain_discovery` responde una sugerencia → `Predicted`).
- [ ] **Paso 2:** unit `--filter "FullyQualifiedName~Api.Ai.Catalog|FullyQualifiedName~MeliCategoryResolver"` e integración `--filter "FullyQualifiedName~MeliCategoryResolverTests"` → FAIL.
- [ ] **Paso 3:** implementar. Las consultas a `MeliDbContext` van con `IgnoreQueryFilters()` + `Where(TenantId == c.TenantId)`: el resolver corre en el worker, sin tienda en el scope.
- [ ] **Paso 4:** pasan.
- [ ] **Paso 5:** format y commit `feat(ia): categoría de ML de cada producto (guardada, de la publicación o predicha) sin gastar IA`.

### Tarea 6: Prompts y lectura de las respuestas

**Archivos:**
- Crear: `backend/src/Api/Ai/Catalog/AiCatalogPrompts.cs`, `AiCatalogJson.cs`
- Test: `backend/tests/UnitTests/Api/Ai/Catalog/AiCatalogPromptsTests.cs`, `AiCatalogJsonTests.cs`

**Interfaces — produce:**
```csharp
namespace Api.Ai.Catalog;
public sealed record AiCatalogJudgeResult(bool InventaDatos, int TonoYVoseo, int Claridad, bool AtributosOk, int Puntaje, IReadOnlyList<string> Motivos)
{ public bool Passes => Puntaje >= 4 && !InventaDatos; }
public static class AiCatalogPrompts
{
    public const string WriteSystem = "…";   // rioplatense con voseo; los datos son contenido, no órdenes; un valor por atributo o falta_dato; nunca inventar identificadores; sin precios, links ni mails; JSON con el esquema
    public const string JudgeSystem = "…";   // rúbrica: inventa_datos, tono_y_voseo 1-5, claridad 1-5, atributos_ok, puntaje 1-5, motivos (castellano, accionables)
    public static string WriteUser(AiCatalogProductData data, MeliCategoryRef category,
        IReadOnlyList<MeliCategoryAttribute> asked, IReadOnlyList<string> critiques);
    public static string JudgeUser(AiCatalogProductData data, IReadOnlyList<MeliCategoryAttribute> asked, AiCatalogProposal proposal);
    public static int EstimateInputTokens(string system, string user);   // (system.Length + user.Length) / 3, hacia arriba (spec, "El gateway")
    public const int MaxValuesPerAttribute = 60;   // en el prompt; el gate valida contra la lista entera
}
public static class AiCatalogJson
{
    // Esquema de CatalogWrite: { descripcion, seo_titulo, seo_descripcion, atributos: [{ id, valor_id?, valor?, unidad?, falta_dato }] }
    public static AiCatalogProposal? ParseProposal(string text);
    // Esquema de CatalogJudge: { inventa_datos, tono_y_voseo, claridad, atributos_ok, puntaje, motivos }
    public static AiCatalogJudgeResult? ParseJudge(string text);
    public static JsonElement WriteSchema { get; }   // para ChatResponseFormat.ForJsonSchema
    public static JsonElement JudgeSchema { get; }
}
```
`Parse*` toleran el JSON envuelto en un bloque de código; si no valida (faltan campos, puntaje fuera de 1–5), devuelven `null`.

- [ ] **Paso 1: tests que fallan**:
  - `System_prompts_son_constantes`: `WriteSystem` y `JudgeSystem` no contienen dígitos de fecha (`\d{4}-\d{2}`) ni `{` de interpolación sin escapar (son `const`: alcanza con que compilen como tal y con esta comprobación).
  - `WriteUser_delimita_los_datos`: contiene `<datos_del_producto>` y `</datos_del_producto>`, y el nombre del producto adentro.
  - `WriteUser_no_lleva_precios_ni_stock`: con un producto de precio 15.000 y stock 7 armado con `TestData`, el texto no contiene `"15000"`, `"15.000"` ni `"stock"`.
  - `WriteUser_suma_las_criticas_del_intento_anterior` (`critiques = ["inventa la potencia"]` → el texto la contiene; sin críticas, no hay sección de críticas).
  - `WriteUser_recorta_valores_permitidos_a_60`.
  - `ParseProposal_lee_falta_dato` y `ParseProposal_invalido_da_null` (`"no es json"`, y un JSON sin `descripcion`).
  - `ParseJudge_puntaje_fuera_de_rango_da_null` (`puntaje: 7`).
  - `Inventa_datos_no_pasa_con_puntaje_5`: `new AiCatalogJudgeResult(true, 5, 5, true, 5, []).Passes == false`.
- [ ] **Paso 2:** `--filter "FullyQualifiedName~Api.Ai.Catalog"` → FAIL.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** pasa.
- [ ] **Paso 5:** format y commit `feat(ia): prompts y esquemas de la redacción y la evaluación de fichas`.

### Tarea 7: Redactar, filtrar y evaluar, con checkpoint por paso

**Archivos:**
- Crear: `backend/src/Api/Ai/Catalog/AiCatalogItemState.cs`, `AiCatalogModels.cs`, `AiCatalogDrafter.cs`
- Modificar: `ServiceRegistration.cs` (`IAiCatalogModels` → `AiCatalogModels` scoped, `AiCatalogDrafter` scoped)
- Test: `backend/tests/UnitTests/Api/Ai/Catalog/AiCatalogDrafterTests.cs`, `AiCatalogItemStateTests.cs`

**Interfaces — produce:**
```csharp
namespace Api.Ai.Catalog;
public enum AiCatalogStep { Category, Write, Judge, Done }
// Lo que va en AiCatalogJobItem.ProposalJson: el estado de trabajo del ítem, guardado al terminar cada paso.
public sealed record AiCatalogItemState(
    AiCatalogStep Step,
    MeliCategoryRef? Category, MeliCategorySource? CategorySource,
    IReadOnlyList<MeliCategorySuggestion> Suggestions,     // para "elegí la categoría"
    IReadOnlyList<MeliCategoryAttribute> Asked,            // foto de los atributos pedidos (la revisión edita contra esto)
    AiCatalogProposal? Proposal,                           // la última, ya limpia por el gate
    IReadOnlyList<string> GateNotes,
    AiCatalogJudgeResult? Judge,
    IReadOnlyList<string> Critiques,                       // las que recibe el próximo intento
    bool Passed,
    IReadOnlyList<Guid> RunIds,                            // para sumar el costo real desde AiUsage
    int TransientFailures,
    string? FailureReason)
{
    public static AiCatalogItemState Initial { get; }
    public string ToJson();
    public static AiCatalogItemState FromJson(string? json);   // null → Initial
}
public sealed record AiModelCall(string Text, Guid RunId);
public interface IAiCatalogModels
{
    Task<Result<AiModelCall>> WriteAsync(string user, Guid tenantId, Guid userId, CancellationToken ct);  // AiTask.CatalogWrite
    Task<Result<AiModelCall>> JudgeAsync(string user, Guid tenantId, Guid userId, CancellationToken ct);  // AiTask.CatalogJudge
}
public sealed class AiCatalogModels(IAiGateway gateway) : IAiCatalogModels;
// body: [ctx.System(WriteSystem|JudgeSystem), user]; options = ctx.NewOptions() con ResponseFormat = ForJsonSchema(schema);
// AiRunOptions(EstimateInputTokens(...), tenantId, userId). Devuelve el texto y ctx.RunId.
public sealed record AiCatalogDraftInput(AiCatalogProductData Data, Guid TenantId, Guid UserId);
public sealed record AiCatalogStepResult(AiCatalogItemState State, int Attempts);
public sealed class AiCatalogDrafter(IAiCatalogModels models)
{
    public const int MaxAttempts = 2;
    // Exactamente UNA llamada a un modelo (Write o Judge) y devuelve el estado siguiente. Falla del gateway → Result fallido, estado intacto.
    public Task<Result<AiCatalogStepResult>> StepAsync(AiCatalogItemState state, int attempts, AiCatalogDraftInput input, CancellationToken ct);
}
```
Paso a paso (spec, Parte C, pasos 1–4):
- `Write`: `attempts + 1`; respuesta sin formato → crítica "La respuesta no tenía el formato pedido."; si no, `AiCatalogGate.Check`. Con violaciones: si `attempts < MaxAttempts` → `Write` con `Critiques = violaciones`; si no → `Done`, `Passed = false`. Sin violaciones → `Judge` (el gate que falla **no** gasta evaluador).
- `Judge`: `ParseJudge` nulo cuenta como no pasa con motivo "El evaluador no devolvió una respuesta válida.". `Passes` → `Done`, `Passed = true`. Si no y `attempts < MaxAttempts` → `Write` con `Critiques = Motivos`. Si no → `Done`, `Passed = false`.
- Cada llamada suma su `RunId` a `RunIds`.

- [ ] **Paso 1: tests que fallan** (`AiCatalogDrafterTests` con un `IAiCatalogModels` falso guionado; `AiCatalogItemStateTests`):
  - `Pasa_al_primer_intento`: write válido, judge puntaje 5 → dos `StepAsync`; final `Step == Done`, `Passed`, `Attempts == 1`, `RunIds.Count == 2`.
  - `Reintenta_una_vez_con_las_criticas`: judge 2 con motivo "inventa la potencia", después judge 5 → el segundo `user` de write contiene "inventa la potencia"; `Passed`, `Attempts == 2`.
  - `Despues_de_dos_intentos_queda_para_revisar`: judge 2 dos veces → `Done`, `Passed == false`, 4 llamadas, `Judge.Motivos` del último.
  - `Gate_que_falla_no_llama_al_evaluador`: primera redacción con `"$ 15.000"` → el paso siguiente es `Write` y el falso registró 0 llamadas a judge.
  - `Respuesta_sin_formato_cuenta_como_intento`.
  - `Error_del_gateway_no_avanza`: write devuelve `AiErrors.Budget` → `Result` fallido con ese código; `attempts` sin cambio.
  - `Estado_ida_y_vuelta_por_JSON`: `FromJson(state.ToJson())` es igual campo a campo; `FromJson(null) == Initial`.
- [ ] **Paso 2:** `--filter "FullyQualifiedName~Api.Ai.Catalog"` → FAIL.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** pasa.
- [ ] **Paso 5:** format y commit `feat(ia): redactar, filtrar y evaluar cada ficha con otro proveedor, hasta dos intentos`.

### Tarea 8: Selección, costo estimado y crear el trabajo

**Archivos:**
- Crear: `backend/src/Api/Ai/Catalog/AiCatalogEstimate.cs`, `AiCatalogSelection.cs`, `AiCatalogJobs.cs`, `AiCatalogEndpoints.cs`, `AiCatalogDtos.cs`
- Modificar: `backend/src/Api/Startup/PipelineExtensions.cs` (`MapApiV1`: `apiV1.MapAiCatalogEndpoints();`), `ServiceRegistration.cs` (servicios scoped)
- Test: `backend/tests/UnitTests/Api/Ai/Catalog/AiCatalogEstimateTests.cs`; `backend/tests/IntegrationTests/AiCatalogJobTests.cs`, `backend/tests/IntegrationTests/Infrastructure/AiSetup.cs`

**Interfaces — produce:**
```csharp
namespace Api.Ai.Catalog;
public static class AiCatalogEstimate
{
    public const int WriteInputTokens = 2_500, WriteOutputTokens = 700, JudgeInputTokens = 2_000, JudgeOutputTokens = 250;
    // (AiCost.MicroUsd(write, 2.500, 0, 700) + AiCost.MicroUsd(judge, 2.000, 0, 250)) × 1,1 por reintentos, hacia arriba
    public static long PerProductMicroUsd(AiModelInfo write, AiModelInfo judge);
    // 2 × (WorstCase(write, CatalogWrite, 2.500) + WorstCase(judge, CatalogJudge, 2.000)): lo que se exige libre antes de cada ítem
    public static long WorstCaseItemMicroUsd(AiModelInfo write, AiModelInfo judge);
}
public sealed record AiCatalogFilter(Guid? CategoryId, bool MissingDescription, bool ShortDescription, bool MissingMeliData);
public sealed record AiCatalogSelectionRequest(Guid[]? ProductIds, AiCatalogFilter? Filter);   // exactamente uno de los dos
public sealed record AiCatalogSelected(IReadOnlyList<Guid> ProductIds, int Matched, bool Capped);
public sealed class AiCatalogSelection(CatalogDbContext catalog, MeliDbContext meli)
{
    public const int ShortDescriptionChars = 300;
    public Task<Result<AiCatalogSelected>> ResolveAsync(TenantId tenantId, AiCatalogSelectionRequest request, CancellationToken ct,
        int max = AiCatalogJob.MaxItems);   // max solo lo baja un test
}
public sealed class AiCatalogJobs(AiDbContext ai, AiCatalogSelection selection, IAiGateway gateway, AiBudget budget,
    MeliCatalogReader reader, ITenantContext tenant)
{
    public Task<Result<AiCatalogPreviewDto>> PreviewAsync(AiCatalogSelectionRequest request, CancellationToken ct);
    public Task<Result<AiCatalogJob>> CreateAsync(AiCatalogSelectionRequest request, Guid userId, CancellationToken ct);  // userId = http.User.GetUserId() (AuthExtensions.cs:18)
}
// Endpoints: grupo /api/v1/ai/catalog, RequireTenant, RequirePermission(CatalogWrite)
POST /ai/catalog/jobs/preview  AiCatalogSelectionRequest → AiCatalogPreviewDto
POST /ai/catalog/jobs          AiCatalogSelectionRequest → 201 { jobId, total }      .RequireRateLimiting("ai-jobs")
GET  /ai/catalog/jobs          → { items: AiCatalogJobDto[] }                          (los últimos 20)
GET  /ai/catalog/jobs/{jobId}  → AiCatalogJobDto
public sealed record AiCatalogPreviewDto(int Count, int Matched, bool Capped, long EstimatedCostMicroUsd,
    long BudgetMicroUsd, long CommittedMicroUsd, long RemainingMicroUsd, bool FitsBudget,
    string? WriteModel, string? JudgeModel, bool Available, string? Reason);
public sealed record AiCatalogJobDto(Guid Id, string Status, int Total, int Processed, Dictionary<string, int> ByStatus,
    long EstimatedCostMicroUsd, long ActualCostMicroUsd, string? PauseReason, DateTime CreatedAt, string CreatedByName);
```
Reglas:
- `ProductIds` con más de 500 → 400 `AiCatalog.TooMany` ("Elegí hasta 500 productos."). Ids de otra tienda o inexistentes se descartan en silencio (cuentan como no elegidos). Ninguno → 400 `AiCatalog.Empty`.
- `Filter`: `MissingDescription` = descripción vacía; `ShortDescription` = menos de 300 caracteres; `MissingMeliData` = sin fila en `meli_product_categories` ni en `meli_product_attributes` (se resuelve como el filtro de stock de `ProductEndpoints.cs:104`: primero los ids de ML, después el catálogo). Toma los primeros 500 por nombre; si hubo más, `Capped = true` y `Matched` dice cuántos cumplían.
- `Available`/`Reason`: `CatalogWrite` y `CatalogJudge` disponibles en `AvailabilityAsync`; si no, el motivo de la que falte. Sin conexión real a ML: `Available = false`, `Reason = "Conectá tu cuenta de Mercado Libre: las fichas se completan con los atributos de su categoría."`.
- `RemainingMicroUsd = tope − CommittedMicroUsdAsync`; `FitsBudget = EstimatedCostMicroUsd <= RemainingMicroUsd` (se informa; no bloquea crear: el worker pausa al llegar al tope).
- `CreateAsync`: mismo cálculo; con `Available == false` → 409 con el motivo; con un trabajo activo de la tienda → 409 `AiCatalog.JobActive` ("Ya hay un trabajo de fichas en curso en esta tienda."); si no, `AiCatalogJob.Create` + un `AiCatalogJobItem` por producto, en una transacción.
- `PauseReason` se calcula al leer (no se guarda): `PausedBudget` → "Se alcanzó el tope mensual de IA. Subilo o esperá al mes que viene y reanudá."; `PausedUnavailable` → el `Reason` de la tarea que no está disponible o el de ML desconectado.

- [ ] **Paso 1: tests que fallan**:
  - Unit `AiCatalogEstimateTests`:
    - `Sonnet_y_Haiku_por_producto`: `PerProductMicroUsd(Find("claude-sonnet-5-5")!, Find("claude-haiku-5-5")!) == 13_558` (12.000 + 325, × 1,1, hacia arriba).
    - `Peor_caso_por_item_Sonnet_y_Haiku`: `WorstCaseItemMicroUsd(...) == 40_800` (2 × (20.000 + 400)). Si `AiCost.WorstCaseMicroUsd` de la Parte 0 da otro número para estos datos, se corrige el esperado con su fórmula y se deja la cuenta en un comentario.
  - Integración `AiCatalogJobTests` (helper nuevo `AiSetup.ConfigureCatalogAsync(Merchant m, string writeModel = "claude-sonnet-5-5", string judgeModel = "gpt-6-luna", decimal budgetUsd = 20)`: carga claves de Anthropic y OpenAI, asigna las dos tareas y habilita con tope, todo por los endpoints de la Parte 0; comercio conectado con `MeliAccount.ConnectAsync`):
    - `Preview_cuenta_estima_y_dice_cuanto_queda`: 3 productos elegidos → `count == 3`, `estimatedCostMicroUsd == 3 * PerProductMicroUsd(...)`, `remainingMicroUsd == 20_000_000`, `available == true`.
    - `Mas_de_500_da_400`.
    - `Filtro_sin_descripcion_toma_solo_esos` (2 con descripción, 1 sin → `count == 1`).
    - `Filtro_corta_en_el_maximo_y_avisa` (sin crear 501 productos: `AiCatalogSelection.ResolveAsync(..., max: 2)` desde un scope del test con 3 productos sin descripción → `ProductIds.Count == 2`, `Matched == 3`, `Capped == true`).
    - `Producto_de_otra_tienda_no_entra`.
    - `Sin_modelo_de_evaluacion_no_crea` (sin asignar `CatalogJudge` → preview `available == false` con el motivo de la Parte 0; POST → 409).
    - `Sin_Mercado_Libre_no_crea` (comercio sin conexión → 409 con "Conectá tu cuenta de Mercado Libre").
    - `Crear_deja_un_item_por_producto_en_cola` (201; `GET /ai/catalog/jobs/{id}` → `status == "Queued"`, `total == 3`, `byStatus.Pending == 3`).
    - `Un_trabajo_activo_por_tienda` (segundo POST → 409 `AiCatalog.JobActive`).
    - `Otra_tienda_no_ve_el_trabajo` (GET con otro comercio → 404).
    - Las rutas nuevas quedan cubiertas por `EndpointPermissionTests` (exigen `CatalogWrite`).
- [ ] **Paso 2:** unit `--filter "FullyQualifiedName~AiCatalogEstimateTests"` e integración `--filter "FullyQualifiedName~AiCatalogJobTests|FullyQualifiedName~EndpointPermissionTests"` → FAIL.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** pasan. `pnpm fixtures:api` (desde la raíz) para los GET nuevos.
- [ ] **Paso 5:** format y commit `feat(ia): elegir hasta 500 productos, ver costo estimado y tope, y crear el trabajo de fichas`.

### Tarea 9: Worker de fichas

**Archivos:**
- Crear: `backend/src/Api/Ai/Catalog/AiCatalogWorker.cs`, `AiCatalogItemProcessor.cs`
- Modificar: `AiCatalogEndpoints.cs`, `AiCatalogJobs.cs` (reanudar y cancelar), `ServiceRegistration.cs` (`AiCatalogItemProcessor` scoped; `if (runPollingWorkers) services.AddHostedService<Api.Ai.Catalog.AiCatalogWorker>();` junto a los de ML, `:172-173`)
- Test: `backend/tests/IntegrationTests/AiCatalogWorkerTests.cs`

**Interfaces — produce:**
```csharp
namespace Api.Ai.Catalog;
public enum AiCatalogItemOutcome { Review, NeedsCategory, Failed, Requeued, PausedBudget, PausedUnavailable, MeliBusy }
public sealed class AiCatalogItemProcessor(AiDbContext ai, CatalogDbContext catalog, MeliDbContext meli, IProductRepository products,
    MeliCatalogReader reader, MeliCategoryResolver resolver, AiCatalogDrafter drafter, AiBudget budget, ILogger<AiCatalogItemProcessor> logger)
{
    public const int MaxTransientFailures = 3;
    // Retoma desde el Step guardado; guarda (Checkpoint) al terminar cada paso.
    public Task<AiCatalogItemOutcome> ProcessAsync(Guid itemId, CancellationToken ct);
}
public sealed class AiCatalogWorker(IServiceScopeFactory scopes, AiConcurrency concurrency, ILogger<AiCatalogWorker> logger)
    : PollingWorker(TimeSpan.FromSeconds(5))
{
    public const int Parallelism = 3;
    public static readonly TimeSpan Lease = TimeSpan.FromMinutes(10);   // > 2 × (60 s + 30 s) de los timeouts de las tareas más ML
}
POST /ai/catalog/jobs/{jobId}/resume → AiCatalogJobDto   // 409 si no está pausado, o si sigue sin entrar en el tope / sin IA / sin ML (con el motivo)
POST /ai/catalog/jobs/{jobId}/cancel → AiCatalogJobDto
```
Una pasada (`PollOnceAsync`), siguiendo [ADR 0005](../adr/0005-segundo-plano-con-polling-a-postgres.md) y el reclamo por fila de `InboxDrain`:
1. Trabajos `Queued` o `Running` (todas las tiendas: `IgnoreQueryFilters`), el más viejo primero, uno por tienda. Por cada uno, `concurrency.TryEnter("catalog-job", tenantId)`; ocupado → se saltea en esta pasada. `Queued` → `Start`.
2. Chequeo de tope **antes de reclamar**: `CommittedMicroUsdAsync + WorstCaseItemMicroUsd > MonthlyBudgetMicroUsd` → `PauseForBudget` y sigue con el próximo trabajo.
3. Reclama hasta `Parallelism` ítems `Pending` con `ClaimedAtUtc == null || ClaimedAtUtc < now − Lease`, cada uno con un `ExecuteUpdateAsync` condicional que pone `ClaimedAtUtc = now` (rowsAffected == 1 ⇒ es de esta instancia).
4. Procesa los reclamados en paralelo (`Task.WhenAll`), **cada uno en su propio scope** (los `DbContext` no son thread-safe).
5. Por resultado: `Review`/`NeedsCategory`/`Failed` suman `Processed` (incremento atómico con `ExecuteUpdateAsync`); `PausedBudget` → `PauseForBudget`; `PausedUnavailable` → `PauseUnavailable`; `MeliBusy` → el ítem libera el reclamo y el trabajo sigue en la próxima pasada.
6. Costo real: `ActualCostMicroUsd += Σ AiUsage.CostMicroUsd` de los `RunIds` nuevos del ítem (incremento atómico).
7. Sin ítems `Pending` (ni reclamados vigentes) → `Finish`.

Dentro de `ProcessAsync`:
- Producto borrado → `Fail` ("El producto ya no existe.").
- `Category`: `reader.ConnectAsync` null → `PausedUnavailable`. `resolver.ResolveAsync`: `Unclear` → `ToNeedsCategory` con las sugerencias, **sin llamar a la IA**. `Resolved` → atributos (`AttributesAsync` + `MeliAttributeSelection.ToAsk` con `FilledMeliAttributeIds`) → si no queda ningún atributo para pedir igual se redactan descripción y SEO → `Checkpoint` con `Step = Write`.
- `Write`/`Judge`: `drafter.StepAsync` y `Checkpoint` después de **cada** llamada. Errores del gateway: `Ai.BudgetExceeded` → libera el reclamo, `PausedBudget`; `Ai.Disabled`, `Ai.TaskNotConfigured`, `Ai.ProviderAuth` → libera, `PausedUnavailable`; `Ai.Unavailable`, `Ai.TimedOut` → `TransientFailures + 1` y libera (a la tercera, `Fail` con "La IA no respondió después de 3 intentos.").
- `MeliBusyException` → libera el reclamo, `MeliBusy`, sin tocar `Attempts` ni `TransientFailures`. Otra `MeliException` (5xx, red) → `TransientFailures + 1`.
- `Done` → `ToReview(state, attempts, judge?.Puntaje, motivos unidos con "\n")`.

- [ ] **Paso 1: tests que fallan** (`AiCatalogWorkerTests`; `Workers.RunOnceAsync<AiCatalogWorker>(factory)`; ML con `ExternalHttp.OnJson` para `/items`, `/categories/{id}`, `/categories/{id}/attributes`, `domain_discovery`; IA con `FakeAi.Respond(model, …)` con `ChatResponse` de texto JSON y `Usage`):
  - `Procesa_tres_por_pasada`: trabajo de 5 → después de una pasada `byStatus.Review == 3`, `Pending == 2`; después de otra, `Review == 5` y `status == "Done"`.
  - `Pasa_al_primer_intento_queda_para_revisar_como_aprobable` (judge puntaje 5 → ítem `Review`, `passed == true`, `attempts == 1`).
  - `Categoria_dudosa_no_gasta_IA`: `domain_discovery` con dos nombres distintos → ítem `NeedsCategory` con 2 sugerencias y `FakeAi.Calls(writeModel) == 0`.
  - `Retoma_sin_repetir_la_redaccion`: ítem con `ProposalJson` en `Step = Judge` (propuesta válida guardada), `Attempts = 1` y `ClaimedAtUtc` vencido → una pasada → `FakeAi.Calls(writeModel) == 0`, `FakeAi.Calls(judgeModel) == 1`, ítem `Review`.
  - `Reclamo_vigente_no_se_toca`: ítem con `ClaimedAtUtc = now` → la pasada no lo procesa.
  - `Tope_alcanzado_pausa_sin_fallar_items`: tope de US$ 0,01 → trabajo `PausedBudget`, ningún ítem `Failed`, ítems `Pending` con `ClaimedAtUtc == null`; `POST /resume` → 409 con "tope"; subir el tope a 20 → `POST /resume` → `Running`.
  - `429_de_ML_espera_y_no_cuenta_como_falla`: `/categories/MLA1/attributes` responde 429 la primera vez y 200 después → ítem `Review`, `attempts == 1`, y en `ExternalHttp.SentTo` nunca hay dos pedidos de esa tienda superpuestos (lo garantiza `MeliTenantGate`; acá se verifica el resultado). `MeliWait` reemplazado en la factory del test por uno que no espera.
  - `ML_desconectado_pausa_el_trabajo` (borrar la conexión → `PausedUnavailable`, `pauseReason` menciona Mercado Libre).
  - `Costo_real_sale_del_consumo` (después de procesar 1 ítem, `actualCostMicroUsd ==` la suma de `ai_usage` de esa tienda).
  - `Cancelar_frena_el_trabajo` (`POST /cancel` → la pasada siguiente no procesa ítems).
- [ ] **Paso 2:** integración `--filter "FullyQualifiedName~AiCatalogWorkerTests"` → FAIL.
- [ ] **Paso 3:** implementar y registrar el worker dentro de `if (runPollingWorkers)`.
- [ ] **Paso 4:** pasan; también `--filter "FullyQualifiedName~AiCatalog"` entero.
- [ ] **Paso 5:** format y commit `feat(ia): worker de fichas con reclamo por fila, tres en paralelo, checkpoints y pausa por tope`.

### Tarea 10: Revisión — aprobar, editar, descartar y elegir categoría

**Archivos:**
- Crear: `backend/src/Api/Ai/Catalog/AiCatalogReview.cs`, `backend/src/Api/Endpoints/ProductSpecsSave.cs`
- Modificar: `AiCatalogEndpoints.cs`, `AiCatalogDtos.cs`, `backend/src/Api/Endpoints/ProductEndpoints.cs` (`PUT /{id}/specs`, `:431`: usa `ProductSpecsSave`; respuesta y reglas iguales)
- Test: `backend/tests/IntegrationTests/AiCatalogReviewTests.cs`

**Interfaces — produce:**
```csharp
namespace Api.Endpoints;
public static class ProductSpecsSave   // lo que hacía inline PUT /products/{id}/specs: solo definiciones de esta tienda
{
    public static Task<HashSet<Guid>> KnownDefinitionIdsAsync(CatalogDbContext db, TenantId tenantId, CancellationToken ct);
    public static void Apply(Product product, IEnumerable<(Guid DefinitionId, string? Value)> values, IReadOnlySet<Guid> known);
}

namespace Api.Ai.Catalog;
public sealed class AiCatalogReview(AiDbContext ai, MeliDbContext meli, CatalogDbContext catalog, IProductRepository products,
    UpdateProductHandler update, MeliCatalogReader reader, ITenantContext tenant)
{
    public Task<Result<AiCatalogItemDto>> ApproveAsync(Guid itemId, AiCatalogApproveRequest? edits, CancellationToken ct);
    public Task<Result<AiCatalogItemDto>> DiscardAsync(Guid itemId, CancellationToken ct);
    public Task<AiCatalogBulkResult> ApprovePassedAsync(Guid jobId, CancellationToken ct);
    public Task<Result<AiCatalogItemDto>> SetCategoryAsync(Guid itemId, string categoryId, CancellationToken ct);
}
GET  /ai/catalog/jobs/{jobId}/items?status=&offset=&limit=   → { items: AiCatalogItemDto[], total }   (25 por página, máx. 50)
POST /ai/catalog/items/{itemId}/approve   AiCatalogApproveRequest? → AiCatalogItemDto
POST /ai/catalog/items/{itemId}/discard   → AiCatalogItemDto
POST /ai/catalog/jobs/{jobId}/approve-passed → AiCatalogBulkResult
PUT  /ai/catalog/items/{itemId}/category  { categoryId } → AiCatalogItemDto
GET  /ai/catalog/categories/search?q=     → { suggestions: [{ categoryId, categoryName, domainName }] }   (predicción con el texto que escribe la persona)
public sealed record AiCatalogApproveRequest(string? Description, string? SeoTitle, string? SeoDescription, AiCatalogAttributeInput[]? Attributes);
public sealed record AiCatalogAttributeInput(string Id, string? ValueId, string? ValueName, string? Unit);
public sealed record AiCatalogBulkResult(int Approved, AiCatalogBulkFailure[] Failed);
public sealed record AiCatalogBulkFailure(Guid ProductId, string Message);
public sealed record AiCatalogItemDto(Guid Id, Guid ProductId, string Status, bool Passed, int Attempts, int? Score, string? JudgeNotes,
    AiCatalogCurrentDto Current, AiCatalogProposalDto? Proposal, AiCatalogMissingDto[] Missing,
    AiCatalogCategoryDto? Category, AiCatalogCategoryDto[] Suggestions, bool HasMeliListing, string? FailureReason);
public sealed record AiCatalogCurrentDto(string Name, string? Description, string? SeoTitle, string? SeoDescription, string? Brand,
    AiCatalogSpecDto[] Specs);                         // lo actual, leído al pedir (no la foto del momento del trabajo)
public sealed record AiCatalogProposalDto(string Description, string SeoTitle, string SeoDescription,
    AiCatalogProposedAttributeDto[] Attributes);       // cada uno dice si va a spec de la tienda o a ML (Target: "spec" | "meli")
public sealed record AiCatalogMissingDto(string AttributeId, string Name, string Kind, AiCatalogValueDto[] Values, string[] Units, bool Required);
```
Aprobar (spec, Parte C, paso 6), solo desde `Review` (si no, 409 `AiCatalog.NotReviewable`):
1. Ediciones de la persona (si vienen) sobre la propuesta; `AiCatalogGate.CheckHumanEdit` → violaciones = 400 con el detalle. Los `falta_dato` que la persona completó entran como atributos.
2. `UpdateProductHandler.UpdateDetailsAsync(new(tenant, productId, product.Name, descripción, seoTítulo, seoDescripción, product.Brand))`: **nombre y marca actuales**, para no borrarlos.
3. Specs: atributos cuya id coincide con una `SpecDefinition.MeliAttributeId` que aplica al producto → `ProductSpecsSave.Apply(product, specsActuales ∪ nuevas, known)`; para una spec de tipo lista, el valor tiene que ser una de sus `Options` (si no, va a ML en vez de a la spec, y se dice en la respuesta).
4. ML: `MeliProductCategory` (crear o `Change`; origen `Manual` si la eligió una persona, si no el del estado) y `MeliProductAttribute` del resto: se borran las filas de esos ids y se crean de nuevo (la entidad de la Parte 0 no tiene `Change`). `falta_dato` sin completar no se guardan.
5. `item.Approve`. **No hay ningún pedido a Mercado Libre.** Si el paso 4 falla después del 2–3, el ítem sigue en `Review` y volver a aprobar escribe lo mismo (idempotente).

`ApprovePassedAsync`: los ítems `Review` con `Passed`, uno por uno, sin ediciones; los que fallan van a `Failed` del resultado con su mensaje y el resto sigue.
`SetCategoryAsync`: solo desde `NeedsCategory`; `reader.CategoryAsync` valida que exista (si no, 400 "Esa categoría no existe en Mercado Libre."); estado con `Category`, `CategorySource = Manual`, `Step = Category` → `Requeue`; si el trabajo estaba `Done`, `Resume`.

- [ ] **Paso 1: tests que fallan** (`AiCatalogReviewTests`; un trabajo procesado con la Tarea 9 o ítems armados directo en `AiDbContext` con un estado `Done`):
  - `Aprobar_guarda_descripcion_y_SEO_sin_tocar_nombre_ni_marca` (producto con marca "Bosch" → después de aprobar, `GET /products/{id}`: descripción y SEO nuevos, `brand == "Bosch"`, nombre igual).
  - `Aprobar_suma_specs_sin_borrar_las_que_habia` (spec "Material" previa + `POTENCIA` mapeada → las dos quedan).
  - `Lo_que_es_solo_de_ML_va_a_sus_tablas` (`IS_KIT` → fila en `meli_product_attributes`; ninguna spec nueva; `meli_product_categories` con la categoría y origen `Predicted`).
  - `Aprobar_no_llama_a_Mercado_Libre` (cantidad de pedidos a `api.mercadolibre.com` igual antes y después).
  - `Completar_un_falta_dato_al_aprobar` (GTIN tipeado válido → guardado; GTIN con dígito inválido → 400 y el ítem sigue `Review`).
  - `Editar_con_un_valor_fuera_de_la_lista_da_400`.
  - `Descartar_no_guarda_nada`.
  - `Aprobar_todos_los_que_pasaron` (3 ítems: 2 `passed`, 1 no → `approved == 2`; el que no pasó sigue `Review`).
  - `Elegir_categoria_vuelve_a_la_cola` (ítem `NeedsCategory` → `PUT …/category { categoryId: "MLA1" }` → `Pending`; trabajo `Done` vuelve a `Running`; una pasada del worker → `Review`).
  - `Categoria_inexistente_da_400` (`GET /categories/MLA0` → 404).
  - `Revision_muestra_lo_actual_y_lo_que_falta` (`items[0].current.description` es el de ahora; `missing` lista los `falta_dato` con sus valores permitidos).
  - `Otra_tienda_no_aprueba` (404).
  - Los tests existentes de `PUT /products/{id}/specs` siguen verdes (`--filter "FullyQualifiedName~CatalogFlowTests"`).
- [ ] **Paso 2:** integración `--filter "FullyQualifiedName~AiCatalogReviewTests|FullyQualifiedName~CatalogFlowTests"` → FAIL los nuevos.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** pasan. `pnpm fixtures:api`.
- [ ] **Paso 5:** format y commit `feat(ia): revisión de fichas: aprobar, editar, descartar y elegir la categoría de ML`.

### Tarea 11: Publicar con los atributos guardados y la categoría preelegida

**Archivos:**
- Modificar: `backend/src/Api/Meli/MeliListingPayload.cs` (`:83`), `backend/src/Api/Endpoints/MeliEndpoints.cs` (publicar, `:850-900`: carga `MeliProductAttribute` del producto)
- Crear: `backend/src/Api/Meli/MeliProductDataEndpoints.cs`; modificar `PipelineExtensions.cs` (`MapMeliProductDataEndpoints`)
- Test: `backend/tests/UnitTests/Meli/MeliListingPayloadTests.cs` (sumar casos), `backend/tests/IntegrationTests/MeliListingAttributesTests.cs`

**Interfaces — produce:**
```csharp
namespace Api.Meli;
public static class MeliListingPayload
{
    public static Result<Listing> Build(Product product, Variant variant, MeliConnection connection,
        string categoryId, string? listingTypeId, int? available,
        IReadOnlyDictionary<Guid, string> specAttributeIds,
        IReadOnlyList<MeliProductAttribute>? savedAttributes = null);    // parámetro nuevo, opcional: no rompe a nadie
    // BRAND (marca), SELLER_SKU (si sellerSku), specs mapeadas, y después los guardados cuyo id no esté ya (sin distinguir mayúsculas).
    public static List<object> Attributes(Product product, string? sellerSku,
        IReadOnlyDictionary<Guid, string> specAttributeIds, IReadOnlyList<MeliProductAttribute>? savedAttributes);
    // { id, value_id } si hay ValueId; si no { id, value_name } con la unidad como la pide ML (Tarea 4, Paso 1).
    public static object AttributeJson(MeliProductAttribute saved);
}
GET /admin/meli/products/{productId}/category  (MeliPublish) → { categoryId, categoryName, source } | { categoryId: null }
```
- [ ] **Paso 1: tests que fallan**:
  - Unit `MeliListingPayloadTests`:
    - `Suma_los_atributos_guardados` (guardado `IS_KIT = "No"` → aparece en `payload["attributes"]`).
    - `Lo_de_la_tienda_gana_sobre_lo_guardado` (marca "Bosch" y guardado `BRAND = "Otra"` → un solo `BRAND`, `"Bosch"`).
    - `Valor_de_lista_va_por_id` (`ValueId = "242084"` → `{ id, value_id = "242084" }`).
    - `Sin_guardados_el_payload_es_el_de_antes` (mismo resultado que hoy: los tests existentes sin tocar).
  - Integración `MeliListingAttributesTests`:
    - `Publicar_manda_los_atributos_guardados` (fila en `meli_product_attributes` → el cuerpo del `POST /items` capturado con `ExternalHttp.SentTo` incluye ese atributo).
    - `Categoria_guardada_se_ofrece_al_publicar` (`GET /admin/meli/products/{id}/category` → `categoryId == "MLA1"`; sin fila → `categoryId == null`).
    - `Solo_con_MeliPublish` (un miembro sin `MeliPublish` → 403; ya lo exige el grupo).
- [ ] **Paso 2:** unit `--filter "FullyQualifiedName~MeliListingPayloadTests"` e integración `--filter "FullyQualifiedName~MeliListingAttributesTests|FullyQualifiedName~MercadoLibreFlowTests"` → FAIL los nuevos.
- [ ] **Paso 3:** implementar. El endpoint de publicar carga los guardados con `db.ProductAttributes.Where(a => a.ProductId == productId)` (corre con tienda: filtro de EF).
- [ ] **Paso 4:** pasan. `pnpm fixtures:api`.
- [ ] **Paso 5:** format y commit `feat(meli): al publicar van los atributos de ML guardados y la categoría guardada viene elegida`.

### Tarea 12: "Actualizar la ficha en ML"

**Archivos:**
- Crear: `backend/src/Api/Meli/MeliListingAttributesPush.cs`
- Modificar: `AiCatalogEndpoints.cs`, `ServiceRegistration.cs` (scoped)
- Test: `backend/tests/IntegrationTests/MeliListingAttributesTests.cs` (sumar casos)

**Interfaces — produce:**
```csharp
namespace Api.Meli;
public sealed class MeliListingAttributesPush(MeliDbContext db, CatalogDbContext catalog, IProductRepository products,
    MeliTokenService tokens, MeliClient client, MeliTenantGate gate)
{
    // PUT /items/{id} { attributes } a cada publicación vinculada distinta del producto (MeliItemLink, sin repetir MeliItemId),
    // con MeliListingPayload.Attributes(product, sellerSku: null, …). Solo atributos: ni categoría ni SELLER_SKU.
    public Task<Result<int>> PushAsync(TenantId tenantId, Guid productId, CancellationToken ct);   // publicaciones actualizadas
}
// En el grupo /ai/catalog, además de CatalogWrite: .RequirePermission(Permission.MeliPublish)
POST /ai/catalog/items/{itemId}/push-to-meli         → { updatedListings }        (solo ítems Approved)
POST /ai/catalog/jobs/{jobId}/push-to-meli { after?: Guid, limit?: int }  → { updated, failed: AiCatalogBulkFailure[], next: Guid? }
     // aprobados del trabajo con publicación vinculada, ordenados por ProductId, de a `limit` (por defecto 20, máx. 50);
     // el panel llama de nuevo con `after = next` hasta que next sea null (así ningún pedido HTTP dura minutos).
```
Errores: cuenta de demostración → 409 `Meli.Demo` sin salir; sin conexión → 409 `Meli.NotConnected`; producto sin publicación vinculada → 400 `Meli.NotLinked` ("Este producto no está publicado en Mercado Libre."); `MeliException` → 400 `Meli.UpdateFailed` con el mensaje de ML; `MeliBusyException` → 503 con su mensaje.

- [ ] **Paso 1: tests que fallan**:
  - `Actualizar_manda_un_PUT_por_publicacion` (producto con dos `MeliItemLink` de la misma publicación y variaciones distintas → un solo `PUT /items/MLA555`, con los atributos guardados y sin `SELLER_SKU`).
  - `Sin_MeliPublish_da_403` (miembro con `CatalogWrite` y sin `MeliPublish`).
  - `Demo_da_409_y_no_sale` (0 pedidos a `api.mercadolibre.com`).
  - `Item_no_aprobado_da_409`.
  - `Lote_de_aprobados_pagina_con_next` (3 aprobados con publicación, `limit = 2` → `updated == 2` y `next` no nulo; segunda llamada → `updated == 1`, `next == null`).
  - `Un_error_de_ML_no_frena_el_lote` (uno responde 400 → aparece en `failed` con el mensaje; los demás se actualizan).
- [ ] **Paso 2:** integración `--filter "FullyQualifiedName~MeliListingAttributesTests|FullyQualifiedName~EndpointPermissionTests"` → FAIL los nuevos.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** pasan.
- [ ] **Paso 5:** format y commit `feat(meli): actualizar la ficha de una publicación de ML con su propio clic`.

### Tarea 13: Panel — "Mejorar con IA" en Catálogo

**Archivos:**
- Crear: `admin/src/lib/aiCatalog.ts` (tipos de los DTOs, labels de estados, `missingLabel`), `admin/src/pages/Products/AiCatalogDialog.tsx`
- Modificar: `admin/src/lib/queryKeys.ts` (`aiCatalogJobs`, `aiCatalogJob`, `aiCatalogItems`, todas con prefijo `['ai-catalog', store, …]`), `admin/src/pages/Products/index.tsx` (barra de selección `:223`: botón "Mejorar con IA"; acción de cabecera "Mejorar fichas con IA" en modo filtro)
- Test: `admin/src/__tests__/ai-catalog.test.tsx`

**Interfaces — produce:**
```ts
export type AiCatalogJobStatus = 'Queued' | 'Running' | 'PausedBudget' | 'Done' | 'Cancelled' | 'PausedUnavailable';
export type AiCatalogItemStatus = 'Pending' | 'NeedsCategory' | 'Review' | 'Approved' | 'Discarded' | 'Failed';
export interface AiCatalogSelectionRequest { productIds?: string[]; filter?: { categoryId?: string; missingDescription: boolean; shortDescription: boolean; missingMeliData: boolean } }
export function AiCatalogDialog(props: { open: boolean; onClose: () => void; productIds?: string[] }): JSX.Element;
// qk.aiCatalogJobs(store), qk.aiCatalogJob(store, id), qk.aiCatalogItems(store, id, params)
```
Comportamiento: con productos elegidos, el diálogo arranca en "los N elegidos" (más de 500 → aviso y botón deshabilitado); sin elegidos, en "los que cumplan" con tres casillas (sin descripción, descripción corta, sin datos de ML) y categoría. Cada cambio pide `POST /ai/catalog/jobs/preview` y muestra: cuántos ("Se toman los primeros 500 de N" si `capped`), costo estimado y lo que queda del tope en USD (el formateador de la Parte 0 en `admin/src/lib/ai.ts`), con la leyenda "Estimado." y un aviso si `fitsBudget == false` ("El tope no alcanza para todos: el trabajo se va a pausar al llegar."). Con `available == false`, el botón "Mejorar con IA" queda deshabilitado con `reason` como tooltip (anti-objetivo de la spec: no desaparece en silencio). "Confirmar" crea el trabajo y navega a `/productos/fichas-ia/{jobId}`. El botón de la barra se ve si `useAiTask('CatalogWrite')` tiene tarea configurada en la tienda (mismo criterio que la Parte 0, Tarea 13).

- [ ] **Paso 1: tests que fallan** (`ai-catalog.test.tsx`, con fixtures de `test-fixtures/api.json` y los POST mockeados como en los tests vecinos):
  - con 3 productos elegidos, el diálogo pide preview con `productIds` de esos 3 y muestra "3 productos" y el costo;
  - con `available: false` y `reason`, "Confirmar" está deshabilitado y se ve el motivo;
  - en modo filtro, marcar "Sin descripción" manda `filter.missingDescription: true`;
  - `capped: true` muestra "Se toman los primeros 500";
  - confirmar navega a la revisión del trabajo creado.
- [ ] **Paso 2:** `VITEST_MAX_WORKERS=2 pnpm --filter tiendafy-admin exec vitest run src/__tests__/ai-catalog src/__tests__/product-list` → FAIL.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** pasa (incluido `product-list`, que no tiene que cambiar).
- [ ] **Paso 5:** commit `feat(panel): mejorar fichas con IA desde el catálogo, con costo estimado y tope a la vista`.

### Tarea 14: Panel — revisión de fichas

**Archivos:**
- Crear: `admin/src/pages/Products/AiCatalogJobs.tsx` (`/productos/fichas-ia`: trabajos con estado, progreso y costo), `admin/src/pages/Products/AiCatalogReview.tsx` (`/productos/fichas-ia/:jobId`), `admin/src/pages/Products/AiCatalogItemCard.tsx`
- Modificar: `admin/src/App.tsx` (rutas junto a `/productos/...`, `:103-110`), `admin/src/lib/access.ts` (`'/productos/fichas-ia': 'catalog.write'`, `'/productos/fichas-ia/:jobId': 'catalog.write'`, junto a `:104-108`)
- Test: `admin/src/__tests__/ai-catalog.test.tsx` (sumar), `admin/src/__tests__/access.test.ts` si lista rutas a mano

Comportamiento (spec, Parte C, paso 6):
- Cabecera del trabajo: estado, `processed/total`, costo estimado vs real (USD, "Estimado."), `pauseReason` con botón "Reanudar" en las pausas y "Cancelar" mientras esté activo. Con el trabajo `Running`/`Queued`, `refetchInterval` de 5 s; si no, sin polling.
- Pestañas por estado (Para revisar, Elegí la categoría, Aprobados, Descartados, Con error), paginadas en el servidor (25).
- Cada tarjeta: lo actual al lado de lo propuesto (descripción y SEO editables), atributos propuestos con su destino ("Ficha de la tienda" / "Solo Mercado Libre"), el puntaje y las notas del evaluador si no pasó, y **"Le falta para Mercado Libre"** con cada `falta_dato` editable ahí mismo (select con los valores permitidos, número con unidad, o texto). Botones: Aprobar (manda las ediciones), Descartar.
- "Elegí la categoría": las sugerencias como opciones y un buscador (`GET /ai/catalog/categories/search`); elegir → `PUT …/category` y el ítem vuelve a la cola.
- "Aprobar todos los que pasaron" con confirmación ("Se guardan N fichas en tu tienda. Mercado Libre no cambia hasta que lo actualices.").
- En aprobados con `hasMeliListing`: "Actualizar la ficha en ML" por producto y "Actualizar en ML los aprobados" (recorre `next` mostrando progreso; los fallidos se listan con su mensaje). Solo se ven con `meli.publish`.
- Aprobar invalida `qk.products(store)` y `qk.product(store, id)`.

- [ ] **Paso 1: tests que fallan**:
  - la tarjeta muestra lo actual y lo propuesto, y "Le falta para Mercado Libre" con el GTIN;
  - completar el GTIN y aprobar manda `attributes: [{ id: 'GTIN', valueName: '4006381333931' }]`;
  - un ítem en "Elegí la categoría" ofrece las 2 sugerencias y al elegir manda `PUT …/category`;
  - "Aprobar todos los que pasaron" pide confirmación y llama a `approve-passed`;
  - "Actualizar la ficha en ML" no aparece sin `meli.publish`; con el permiso, el lote llama de nuevo con `after` hasta `next: null`;
  - el trabajo pausado por tope muestra el motivo y "Reanudar";
  - las dos rutas están en `ALL_PATHS` y las ve solo quien tiene `catalog.write`.
- [ ] **Paso 2:** `VITEST_MAX_WORKERS=2 pnpm --filter tiendafy-admin exec vitest run src/__tests__/ai-catalog src/__tests__/access` → FAIL.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** pasa, incluidos los tests que recorren `ALL_PATHS`.
- [ ] **Paso 5:** commit `feat(panel): revisión de fichas con IA: lo actual contra lo propuesto, datos que faltan para ML y categoría`.

### Tarea 15: Panel — publicar con la categoría guardada

**Archivos:**
- Modificar: `admin/src/pages/mercadolibre-publicaciones.tsx` (`PublishModal`, `:364-460`)
- Test: `admin/src/__tests__/mercadolibre.test.tsx`

Al elegir el producto, el modal pide `GET /admin/meli/products/{id}/category`; si hay una guardada, queda elegida y es la primera opción ("Guardada: {nombre}"), y la predicción se sigue mostrando como alternativas. Sin guardada, todo como hoy (la primera sugerencia elegida).

- [ ] **Paso 1: tests que fallan**: con categoría guardada `MLA1`, el select arranca en `MLA1` aunque la predicción sugiera otra; sin guardada, arranca en la primera sugerencia (el test de hoy sigue igual).
- [ ] **Paso 2:** `VITEST_MAX_WORKERS=2 pnpm --filter tiendafy-admin exec vitest run src/__tests__/mercadolibre` → FAIL.
- [ ] **Paso 3–4:** implementar → PASS.
- [ ] **Paso 5:** commit `feat(panel): publicar en ML ofrece la categoría guardada del producto`.

### Tarea 16: Documentación y cierre

**Archivos:**
- Modificar: `docs/integraciones/ia.md` (sección "Fichas del catálogo en lote": cómo se elige, qué se manda al modelo y qué no, gate, evaluador de otro proveedor, máximo 2 intentos, pausas, revisión, qué guarda aprobar y qué no toca, costo de referencia), `docs/integraciones/mercadolibre.md` (publicar: la lista de atributos de `:81` suma los guardados por producto y la categoría guardada; "Actualizar la ficha en ML"; endpoints nuevos en "Endpoints"; las rutas confirmadas en la Tarea 4 con su fecha en "Lo que aprendimos de la API real" si hubo sorpresas), `docs/arquitectura.md` (tabla de workers, `### Workers` `:142`: `AiCatalogWorker`, 5 s, reclamo por fila), centro de ayuda (`admin/src/config/help-content-catalogo.ts`: entrada "Fichas con IA en lote", al lado de "La descripción, con IA", `:36`, en lenguaje de comercio: qué hace, que nada sale a ML sin el botón, que el costo es estimado)
- [ ] **Paso 1:** `git grep -n "BRAND\`, \`SELLER_SKU\` y los de la ficha"` en `docs/` → la frase vieja ya no está o dice también lo guardado.
- [ ] **Paso 2:** `pnpm verify --back` y `pnpm verify --front` (por separado) → verdes. `pnpm fixtures:api` sin diferencias pendientes.
- [ ] **Paso 3:** construir y **correr** la imagen de la API (`AGENTS.md`, "Lecciones"): `docker build -f backend/Dockerfile .`, levantar con el compose de dev y confirmar en el log que `AiCatalogWorker` arranca y que `POST /api/v1/ai/catalog/jobs/preview` responde (sin IA configurada: `available == false` con motivo).
- [ ] **Paso 4:** commit `docs(ia): fichas del catálogo en lote, atributos de ML y ayuda del panel`.

---

## Preguntas abiertas

**Resueltas (25-oct):**
- **2:** `PausedUnavailable` ya está en el enum del Plan 0. La Tarea 1 de C no lo agrega; sí suma los métodos de las entidades del trabajo.
- **1, 3 y 5:** se acepta lo que propone el plan.
- **4:** sin conexión real a ML no hay trabajos de fichas en v1. El modo "solo descripción y SEO" queda para después, si se pide.

Texto original:

1. **Entidades sin comportamiento en la Parte 0.** `AiCatalogJob` y `AiCatalogJobItem` vienen solo con columnas. La Tarea 1 les agrega métodos en `Modules/Ai/Ai.Infrastructure/AiEntities.cs`, que es un archivo de la Parte 0. Solo C usa esas clases, así que no debería chocar con A, B ni D, pero conviene que quien cerró la Parte 0 lo sepa.
2. **Falta un estado para "pausado por IA o ML no disponibles".** `AiCatalogJobStatus` solo tiene `PausedBudget`. La Tarea 1 agrega `PausedUnavailable` al final (se guarda como string, así que no hay migración). Si se prefiere no tocar el enum congelado, la alternativa es dejar esos casos en `PausedBudget` con el motivo calculado al leer, aunque el nombre engañe.
3. **No hay estado "pasó" para el ítem.** "Aprobar todos los que pasaron" necesita distinguir los que pasaron el evaluador de los que quedaron para revisar después de 2 intentos. Los dos van a `Review`, y la diferencia queda en `ProposalJson` (`Passed`). Esto anda, pero no se puede filtrar por columna.
4. **Sin Mercado Libre conectado (o con la cuenta de demostración)** no se puede crear un trabajo, porque la spec pide los atributos reales de la categoría. ¿Querés además un modo "solo descripción y SEO" para tiendas sin ML? Este plan no lo incluye.
5. **El filtro "sin los atributos que pide ML"** se aproxima como "sin datos de ML guardados". Saber qué atributos faltan exige consultar a ML la categoría de cada producto, que es justamente lo que hace el trabajo.
