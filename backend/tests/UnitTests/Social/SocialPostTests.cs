using Social.Infrastructure;

namespace UnitTests.Social;

public class SocialPostTests
{
    private static SocialPost NewPost(string? content = "Hola redes", string media = "[]") =>
        SocialPost.Create(Guid.NewGuid(), content, media).Value;

    [Fact]
    public void Create_SinTextoNiImagen_Falla()
    {
        var result = SocialPost.Create(Guid.NewGuid(), "   ", "[]");
        Assert.True(result.IsFailure);
        Assert.Equal("Social.Empty", result.Error.Code);
    }

    [Fact]
    public void Create_SoloImagen_Alcanza()
    {
        var result = SocialPost.Create(Guid.NewGuid(), null, "[\"https://x/img.jpg\"]");
        Assert.True(result.IsSuccess);
        Assert.Equal(SocialPostStatus.Draft, result.Value.Status);
        Assert.Equal(SocialScheduleStatus.Pending, result.Value.ScheduleStatus);
    }

    [Fact]
    public void Create_TextoGigante_Falla()
    {
        var result = SocialPost.Create(Guid.NewGuid(), new string('a', 10_001), "[]");
        Assert.True(result.IsFailure);
    }

    [Fact]
    public void Schedule_SinTargets_Falla()
    {
        var post = NewPost();
        var result = post.Schedule(DateTime.UtcNow.AddHours(1));
        Assert.True(result.IsFailure);
        Assert.Equal("Social.NoTargets", result.Error.Code);
    }

    [Fact]
    public void Schedule_ConTargets_QuedaScheduledPending()
    {
        var post = NewPost();
        Assert.True(post.SetTargets([(Guid.NewGuid(), null)]).IsSuccess);
        var when = DateTime.UtcNow.AddHours(2);

        Assert.True(post.Schedule(when).IsSuccess);
        Assert.Equal(SocialPostStatus.Scheduled, post.Status);
        Assert.Equal(SocialScheduleStatus.Pending, post.ScheduleStatus);
        Assert.Equal(when, post.ScheduledAtUtc);
    }

    [Fact]
    public void Schedule_SinFecha_EsPublicarAhora()
    {
        var post = NewPost();
        post.SetTargets([(Guid.NewGuid(), null)]);
        Assert.True(post.Schedule(null).IsSuccess);
        Assert.NotNull(post.ScheduledAtUtc);
        Assert.True(post.ScheduledAtUtc <= DateTime.UtcNow.AddSeconds(5));
    }

    [Fact]
    public void Schedule_FechaPasada_Falla()
    {
        var post = NewPost();
        post.SetTargets([(Guid.NewGuid(), null)]);
        var result = post.Schedule(DateTime.UtcNow.AddHours(-1));
        Assert.True(result.IsFailure);
        Assert.Equal("Social.PastDate", result.Error.Code);
    }

    [Fact]
    public void SetTargets_CuentaDuplicada_Falla()
    {
        var post = NewPost();
        var account = Guid.NewGuid();
        var result = post.SetTargets([(account, null), (account, "otro texto")]);
        Assert.True(result.IsFailure);
        Assert.Equal("Social.DuplicateTarget", result.Error.Code);
    }

    [Fact]
    public void MarkProcessing_BloqueaEdicion()
    {
        var post = NewPost();
        post.SetTargets([(Guid.NewGuid(), null)]);
        post.Schedule(null);

        post.MarkProcessing();

        Assert.False(post.IsEditable);
        Assert.True(post.UpdateContent("nuevo", "[]").IsFailure);
        Assert.True(post.Unschedule().IsFailure);
    }

    [Fact]
    public void FinishProcessing_TodoOk_QuedaPublished()
    {
        var post = NewPost();
        post.SetTargets([(Guid.NewGuid(), null), (Guid.NewGuid(), null)]);
        post.Schedule(null);
        post.MarkProcessing();
        foreach (var target in post.Targets)
            target.MarkPublished("id-123", "https://red/post/123");

        post.FinishProcessing();

        Assert.Equal(SocialPostStatus.Published, post.Status);
        Assert.Equal(SocialScheduleStatus.Processed, post.ScheduleStatus);
        Assert.NotNull(post.PublishedAtUtc);
    }

    [Fact]
    public void FinishProcessing_UnTargetFallado_QuedaFailed()
    {
        var post = NewPost();
        post.SetTargets([(Guid.NewGuid(), null), (Guid.NewGuid(), null)]);
        post.Schedule(null);
        post.MarkProcessing();
        post.Targets[0].MarkPublished("ok-1", null);
        post.Targets[1].MarkFailed("Token vencido");

        post.FinishProcessing();

        Assert.Equal(SocialPostStatus.Failed, post.Status);
        Assert.Equal(SocialScheduleStatus.Processed, post.ScheduleStatus);
        Assert.Null(post.Targets[0].Error);
        Assert.Equal("Token vencido", post.Targets[1].Error);
    }

    [Fact]
    public void ContentFor_UsaOverridePorCuenta()
    {
        var post = NewPost("texto base");
        post.SetTargets([(Guid.NewGuid(), "texto corto para X"), (Guid.NewGuid(), null)]);

        Assert.Equal("texto corto para X", post.ContentFor(post.Targets[0]));
        Assert.Equal("texto base", post.ContentFor(post.Targets[1]));
    }

    [Fact]
    public void MarkFailed_RecortaA500()
    {
        var post = NewPost();
        post.SetTargets([(Guid.NewGuid(), null)]);
        post.Targets[0].MarkFailed(new string('e', 900));
        Assert.Equal(500, post.Targets[0].Error!.Length);
    }
}

public class SocialAccountTests
{
    [Fact]
    public void Reauthorize_ReparaTokenYVuelveAutorizada()
    {
        var account = SocialAccount.Create(
            Guid.NewGuid(), "meta_facebook", "page-1", "Mi Página", null, null, "enc-v1");
        account.MarkUnauthorized();
        Assert.False(account.Authorized);

        account.Reauthorize("enc-v2", "Mi Página", "mipagina", "https://a/av.png", "{\"page_id\":\"page-1\"}");

        Assert.True(account.Authorized);
        Assert.Equal("enc-v2", account.AccessTokenEncrypted);
        Assert.Equal("mipagina", account.Username);
    }
}
