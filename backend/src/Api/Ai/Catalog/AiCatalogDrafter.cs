using SharedKernel.Common;

namespace Api.Ai.Catalog;

public sealed record AiCatalogDraftInput(AiCatalogProductData Data, Guid TenantId, Guid UserId);

/// <summary>El estado siguiente y cuántas redacciones lleva el ítem (los intentos del máximo de dos).</summary>
public sealed record AiCatalogStepResult(AiCatalogItemState State, int Attempts);

/// <summary>
/// El bucle redactar → filtrar → evaluar, de a UN paso por llamada: cada <see cref="StepAsync"/> hace como mucho una
/// llamada a un modelo y devuelve el estado siguiente, así quien lo corre puede guardarlo después de cada una (si la
/// API se reinicia, retoma sin repetir una llamada ya pagada). Un gate que falla no gasta evaluador.
/// </summary>
public sealed class AiCatalogDrafter(IAiCatalogModels models)
{
    public const int MaxAttempts = 2;

    public const string BadFormat = "La respuesta no tenía el formato pedido.";
    public const string BadJudgement = "El evaluador no devolvió una respuesta válida.";
    public const string NoProposal = "La IA no devolvió una ficha con el formato pedido.";
    private const string GenericCritique = "El evaluador no la aprobó: revisá que cada dato figure en los datos del producto.";

    /// <summary>Si el gateway falla devuelve su error tal cual y el estado queda como estaba.</summary>
    public Task<Result<AiCatalogStepResult>> StepAsync(
        AiCatalogItemState state, int attempts, AiCatalogDraftInput input, CancellationToken ct) => state.Step switch
        {
            AiCatalogStep.Write => WriteAsync(state, attempts, input, ct),
            AiCatalogStep.Judge => JudgeAsync(state, attempts, input, ct),
            _ => throw new InvalidOperationException($"El paso {state.Step} no llama a ningún modelo."),
        };

    private async Task<Result<AiCatalogStepResult>> WriteAsync(
        AiCatalogItemState state, int attempts, AiCatalogDraftInput input, CancellationToken ct)
    {
        if (state.Category is null)
            throw new InvalidOperationException("No se puede redactar sin la categoría de Mercado Libre.");

        var user = AiCatalogPrompts.WriteUser(input.Data, state.Category, state.Asked, state.Critiques);
        var call = await models.WriteAsync(user, input.TenantId, input.UserId, ct);
        if (call.IsFailure) return Result.Failure<AiCatalogStepResult>(call.Error);

        var used = attempts + 1;
        var withRun = state with { RunIds = [.. state.RunIds, call.Value.RunId] };
        var retry = used < MaxAttempts;

        var proposal = AiCatalogJson.ParseProposal(call.Value.Text);
        if (proposal is null)
        {
            return retry
                ? Next(withRun with { Step = AiCatalogStep.Write, Critiques = [BadFormat] }, used)
                : Next(withRun with { Step = AiCatalogStep.Done, Passed = false, Critiques = [], FailureReason = state.Proposal is null ? NoProposal : null }, used);
        }

        var gate = AiCatalogGate.Check(proposal, state.Asked, input.Data.SourceText);
        if (!gate.Ok)
        {
            return retry
                ? Next(withRun with { Step = AiCatalogStep.Write, Proposal = gate.Cleaned, GateNotes = gate.Notes, Critiques = gate.Violations }, used)
                // Sin más intentos queda para revisar con lo que no cumplió a la vista: la persona decide.
                : Next(withRun with
                {
                    Step = AiCatalogStep.Done,
                    Proposal = gate.Cleaned,
                    Passed = false,
                    Critiques = [],
                    GateNotes = [.. gate.Notes, .. gate.Violations],
                }, used);
        }

        return Next(withRun with { Step = AiCatalogStep.Judge, Proposal = gate.Cleaned, GateNotes = gate.Notes, Critiques = [] }, used);
    }

    private async Task<Result<AiCatalogStepResult>> JudgeAsync(
        AiCatalogItemState state, int attempts, AiCatalogDraftInput input, CancellationToken ct)
    {
        if (state.Proposal is null)
            throw new InvalidOperationException("No se puede evaluar sin una propuesta.");

        var user = AiCatalogPrompts.JudgeUser(input.Data, state.Asked, state.Proposal);
        var call = await models.JudgeAsync(user, input.TenantId, input.UserId, ct);
        if (call.IsFailure) return Result.Failure<AiCatalogStepResult>(call.Error);

        var withRun = state with { RunIds = [.. state.RunIds, call.Value.RunId] };
        // Puntaje 0 = el evaluador no contestó algo válido: no pasa, y el motivo lo dice.
        var judge = AiCatalogJson.ParseJudge(call.Value.Text)
            ?? new AiCatalogJudgeResult(false, 0, 0, false, 0, [BadJudgement]);

        if (judge.Passes)
            return Next(withRun with { Step = AiCatalogStep.Done, Judge = judge, Passed = true, Critiques = [] }, attempts);

        return attempts < MaxAttempts
            ? Next(withRun with
            {
                Step = AiCatalogStep.Write,
                Judge = judge,
                Passed = false,
                Critiques = judge.Motivos.Count > 0 ? judge.Motivos : [GenericCritique],
            }, attempts)
            : Next(withRun with { Step = AiCatalogStep.Done, Judge = judge, Passed = false, Critiques = [] }, attempts);
    }

    private static Result<AiCatalogStepResult> Next(AiCatalogItemState state, int attempts) =>
        Result.Success(new AiCatalogStepResult(state, attempts));
}
