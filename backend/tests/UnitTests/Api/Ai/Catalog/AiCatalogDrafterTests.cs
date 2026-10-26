using System.Text.Json;
using Api.Ai;
using Api.Ai.Catalog;
using Api.Meli;
using Catalog.Core.Domain;
using SharedKernel.Common;

namespace UnitTests.Api.Ai.Catalog;

public sealed class AiCatalogDrafterTests
{
    private static readonly Guid TenantId = Guid.NewGuid();
    private static readonly Guid UserId = Guid.NewGuid();

    private static AiCatalogDraftInput Input()
    {
        var product = Product.Create(TestData.Tenant, "Taladro percutor Bosch GSB 13 RE", "Taladro de 600 W con maletín.").Value;
        product.SetBrand("Bosch");
        return new AiCatalogDraftInput(AiCatalogProductData.From(product, [], [], []), TenantId, UserId);
    }

    private static AiCatalogItemState Start() => AiCatalogItemState.Initial with
    {
        Step = AiCatalogStep.Write,
        Category = new MeliCategoryRef("MLA1", "Taladros"),
        Asked = [new("COLOR", "Color", MeliAttributeKind.List, [new("52049", "Negro")], [], null, null, true, true, false)],
    };

    private static string Description(int length = 400) => new string('a', length - 1) + ".";

    private static string Write(string? description = null) => JsonSerializer.Serialize(new
    {
        descripcion = description ?? Description(),
        seo_titulo = "Taladro Bosch 600 W",
        seo_descripcion = new string('s', 100),
        atributos = new[] { new { id = "COLOR", valor_id = "52049", valor = "Negro", unidad = "", falta_dato = false } },
    });

    private static string Judge(int score, bool invents = false, params string[] reasons) => JsonSerializer.Serialize(new
    {
        inventa_datos = invents,
        tono_y_voseo = 5,
        claridad = 5,
        atributos_ok = true,
        puntaje = score,
        motivos = reasons,
    });

    /// <summary>Modelos con guion: cada llamada saca la próxima respuesta y deja anotado qué recibió.</summary>
    private sealed class ScriptedModels(IEnumerable<Result<AiModelCall>> writes, IEnumerable<Result<AiModelCall>> judges) : IAiCatalogModels
    {
        private readonly Queue<Result<AiModelCall>> _writes = new(writes);
        private readonly Queue<Result<AiModelCall>> _judges = new(judges);

        public List<string> WriteUsers { get; } = [];
        public List<string> JudgeUsers { get; } = [];

        public Task<Result<AiModelCall>> WriteAsync(string user, Guid tenantId, Guid userId, CancellationToken ct)
        {
            WriteUsers.Add(user);
            Assert.Equal(TenantId, tenantId);
            Assert.Equal(UserId, userId);
            return Task.FromResult(_writes.Dequeue());
        }

        public Task<Result<AiModelCall>> JudgeAsync(string user, Guid tenantId, Guid userId, CancellationToken ct)
        {
            JudgeUsers.Add(user);
            return Task.FromResult(_judges.Dequeue());
        }
    }

    private static Result<AiModelCall> Ok(string text) => Result.Success(new AiModelCall(text, Guid.NewGuid()));

    /// <summary>Corre pasos hasta que el ítem queda en <c>Done</c>.</summary>
    private static async Task<AiCatalogStepResult> RunAsync(AiCatalogDrafter drafter, AiCatalogDraftInput input)
    {
        var step = new AiCatalogStepResult(Start(), 0);
        for (var i = 0; i < 20 && step.State.Step != AiCatalogStep.Done; i++)
        {
            var next = await drafter.StepAsync(step.State, step.Attempts, input, default);
            Assert.True(next.IsSuccess);
            step = next.Value;
        }
        return step;
    }

    [Fact]
    public async Task Pasa_al_primer_intento()
    {
        var models = new ScriptedModels([Ok(Write())], [Ok(Judge(5))]);
        var drafter = new AiCatalogDrafter(models);
        var input = Input();

        var afterWrite = (await drafter.StepAsync(Start(), 0, input, default)).Value;
        Assert.Equal(AiCatalogStep.Judge, afterWrite.State.Step);
        Assert.Equal(1, afterWrite.Attempts);
        Assert.NotNull(afterWrite.State.Proposal);
        Assert.Single(afterWrite.State.RunIds);

        var afterJudge = (await drafter.StepAsync(afterWrite.State, afterWrite.Attempts, input, default)).Value;

        Assert.Equal(AiCatalogStep.Done, afterJudge.State.Step);
        Assert.True(afterJudge.State.Passed);
        Assert.Equal(1, afterJudge.Attempts);
        Assert.Equal(2, afterJudge.State.RunIds.Count);
        Assert.Equal(5, afterJudge.State.Judge!.Puntaje);
    }

    [Fact]
    public async Task Reintenta_una_vez_con_las_criticas()
    {
        var models = new ScriptedModels(
            [Ok(Write()), Ok(Write())],
            [Ok(Judge(2, false, "inventa la potencia")), Ok(Judge(5))]);

        var result = await RunAsync(new AiCatalogDrafter(models), Input());

        Assert.Equal(2, models.WriteUsers.Count);
        Assert.DoesNotContain("inventa la potencia", models.WriteUsers[0]);
        Assert.Contains("inventa la potencia", models.WriteUsers[1]);
        Assert.True(result.State.Passed);
        Assert.Equal(2, result.Attempts);
        Assert.Equal(4, result.State.RunIds.Count);
    }

    [Fact]
    public async Task Despues_de_dos_intentos_queda_para_revisar()
    {
        var models = new ScriptedModels(
            [Ok(Write()), Ok(Write())],
            [Ok(Judge(2, false, "primero")), Ok(Judge(3, false, "segundo", "tercero"))]);

        var result = await RunAsync(new AiCatalogDrafter(models), Input());

        Assert.Equal(AiCatalogStep.Done, result.State.Step);
        Assert.False(result.State.Passed);
        Assert.Equal(2, result.Attempts);
        Assert.Equal(2, models.WriteUsers.Count);
        Assert.Equal(2, models.JudgeUsers.Count);
        Assert.Equal(["segundo", "tercero"], result.State.Judge!.Motivos);
        Assert.NotNull(result.State.Proposal);
        Assert.Null(result.State.FailureReason);
    }

    [Fact]
    public async Task Inventa_datos_no_aprueba_aunque_el_puntaje_sea_alto()
    {
        var models = new ScriptedModels(
            [Ok(Write()), Ok(Write())],
            [Ok(Judge(5, true, "inventa la garantía")), Ok(Judge(5, true, "sigue inventando"))]);

        var result = await RunAsync(new AiCatalogDrafter(models), Input());

        Assert.False(result.State.Passed);
        Assert.True(result.State.Judge!.InventaDatos);
    }

    [Fact]
    public async Task Gate_que_falla_no_llama_al_evaluador()
    {
        var models = new ScriptedModels([Ok(Write(Description(300) + " Llevalo a solo $ 15.000."))], []);
        var drafter = new AiCatalogDrafter(models);

        var step = (await drafter.StepAsync(Start(), 0, Input(), default)).Value;

        Assert.Equal(AiCatalogStep.Write, step.State.Step);
        Assert.Equal(1, step.Attempts);
        Assert.Contains(step.State.Critiques, c => c.Contains("precio"));
        Assert.Empty(models.JudgeUsers);
    }

    [Fact]
    public async Task Gate_que_falla_dos_veces_queda_para_revisar_con_las_violaciones_a_la_vista()
    {
        var bad = Write(Description(300) + " Llevalo a solo $ 15.000.");
        var models = new ScriptedModels([Ok(bad), Ok(bad)], []);

        var result = await RunAsync(new AiCatalogDrafter(models), Input());

        Assert.Equal(AiCatalogStep.Done, result.State.Step);
        Assert.False(result.State.Passed);
        Assert.Empty(models.JudgeUsers);
        Assert.Contains(result.State.GateNotes, n => n.Contains("precio"));
        Assert.NotNull(result.State.Proposal);
    }

    [Fact]
    public async Task Respuesta_sin_formato_cuenta_como_intento()
    {
        var models = new ScriptedModels([Ok("no es json"), Ok("tampoco")], []);
        var drafter = new AiCatalogDrafter(models);

        var first = (await drafter.StepAsync(Start(), 0, Input(), default)).Value;
        Assert.Equal(AiCatalogStep.Write, first.State.Step);
        Assert.Equal(1, first.Attempts);
        Assert.Equal([AiCatalogDrafter.BadFormat], first.State.Critiques);

        var second = (await drafter.StepAsync(first.State, first.Attempts, Input(), default)).Value;
        Assert.Equal(AiCatalogStep.Done, second.State.Step);
        Assert.Equal(2, second.Attempts);
        Assert.Equal(AiCatalogDrafter.NoProposal, second.State.FailureReason);
        Assert.Null(second.State.Proposal);
    }

    [Fact]
    public async Task Evaluador_que_no_contesta_algo_valido_no_aprueba()
    {
        var models = new ScriptedModels([Ok(Write()), Ok(Write())], [Ok("???"), Ok("???")]);

        var result = await RunAsync(new AiCatalogDrafter(models), Input());

        Assert.False(result.State.Passed);
        Assert.Equal([AiCatalogDrafter.BadJudgement], result.State.Judge!.Motivos);
    }

    [Fact]
    public async Task Error_del_gateway_no_avanza()
    {
        var models = new ScriptedModels([Result.Failure<AiModelCall>(AiErrors.Budget)], []);
        var state = Start();

        var result = await new AiCatalogDrafter(models).StepAsync(state, 1, Input(), default);

        Assert.True(result.IsFailure);
        Assert.Equal("Ai.BudgetExceeded", result.Error.Code);
    }

    [Fact]
    public async Task Error_del_gateway_en_el_evaluador_tampoco_avanza()
    {
        var models = new ScriptedModels([Ok(Write())], [Result.Failure<AiModelCall>(AiErrors.Unavailable)]);
        var drafter = new AiCatalogDrafter(models);
        var written = (await drafter.StepAsync(Start(), 0, Input(), default)).Value;

        var result = await drafter.StepAsync(written.State, written.Attempts, Input(), default);

        Assert.True(result.IsFailure);
        Assert.Equal("Ai.Unavailable", result.Error.Code);
    }

    [Fact]
    public async Task Los_pasos_que_no_llaman_a_un_modelo_se_rechazan()
    {
        var drafter = new AiCatalogDrafter(new ScriptedModels([], []));

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            drafter.StepAsync(AiCatalogItemState.Initial, 0, Input(), default));
    }
}
