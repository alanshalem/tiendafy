namespace Api.Social;

/// <summary>Verifier PKCE (RFC 7636) para los conectores que lo exigen (X).</summary>
public static class SocialPkce
{
    public static string CreateVerifier() =>
        Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
