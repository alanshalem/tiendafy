using Ai.Infrastructure;

namespace UnitTests.Ai;

public class AiEntitiesTests
{
    [Fact]
    public void Credential_Create_guarda_last4_y_rechaza_vacio()
    {
        var tenant = Guid.NewGuid();

        var credential = AiProviderCredential.Create(tenant, AiProvider.Groq, "enc", "a1b2");

        Assert.Equal("a1b2", credential.Last4);
        Assert.Throws<ArgumentException>(() => AiProviderCredential.Create(tenant, AiProvider.Groq, "", ""));
    }

    [Fact]
    public void Settings_por_defecto_apagada_con_umbral_80()
    {
        var settings = AiSettings.CreateDefault(Guid.NewGuid());

        Assert.False(settings.Enabled);
        Assert.Equal(0, settings.MonthlyBudgetMicroUsd);
        Assert.Equal(80, settings.AlertThresholdPct);
    }
}
