namespace Api.Ai;

/// <summary>Costo de una llamada en micro-dólares (<c>long</c>, nunca <c>double</c>).</summary>
public static class AiCost
{
    private const long PerMillion = 1_000_000;

    /// <summary>
    /// Los tokens en caché se cobran al precio de caché y NO se suman a la entrada:
    /// <paramref name="inputTokens"/> ya los excluye. Redondea hacia arriba al micro-dólar.
    /// </summary>
    public static long MicroUsd(AiModelInfo m, long inputTokens, long cachedInputTokens, long outputTokens) =>
        CeilPerMillion(
            inputTokens * m.InputMicroUsdPerMTok
            + cachedInputTokens * m.CachedInputMicroUsdPerMTok
            + outputTokens * m.OutputMicroUsdPerMTok);

    /// <summary>
    /// Peor caso de una ejecución, lo que se reserva antes de empezar: vueltas máx. ×
    /// (entrada estimada + salida máx.), sin descuento de caché.
    /// </summary>
    public static long WorstCaseMicroUsd(AiModelInfo m, AiTaskSpec spec, int estimatedInputTokens) =>
        CeilPerMillion(
            spec.MaxIterations
            * (estimatedInputTokens * m.InputMicroUsdPerMTok + (long)spec.MaxOutputTokens * m.OutputMicroUsdPerMTok));

    private static long CeilPerMillion(long microUsdTimesTokens) =>
        (microUsdTimesTokens + PerMillion - 1) / PerMillion;
}
