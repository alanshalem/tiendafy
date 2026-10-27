using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Customers.Infrastructure.Migrations;

/// <summary>
/// Las sesiones del comprador y los tokens de reset y verificación se guardan
/// hasheados (SHA-256 en hex, ver <see cref="ShopperTokenHash"/>). Los que ya
/// había se convierten en el lugar con la misma cuenta, así nadie queda
/// deslogueado ni pierde un link que todavía no tocó.
/// </summary>
public partial class HashShopperTokens : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.RenameColumn(
            name: "token",
            table: "customer_tokens",
            newName: "token_hash");

        migrationBuilder.RenameIndex(
            name: "ix_customer_tokens_token",
            table: "customer_tokens",
            newName: "ix_customer_tokens_token_hash");

        migrationBuilder.RenameColumn(
            name: "token",
            table: "customer_sessions",
            newName: "token_hash");

        migrationBuilder.RenameIndex(
            name: "ix_customer_sessions_token",
            table: "customer_sessions",
            newName: "ix_customer_sessions_token_hash");

        // Igual que ShopperTokenHash.Of: SHA-256 de los bytes UTF-8, en hex minúscula.
        migrationBuilder.Sql("UPDATE customer_sessions SET token_hash = encode(sha256(convert_to(token_hash, 'UTF8')), 'hex');");
        migrationBuilder.Sql("UPDATE customer_tokens SET token_hash = encode(sha256(convert_to(token_hash, 'UTF8')), 'hex');");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Un hash no se puede volver token: las sesiones y los links que había
        // dejan de servir (los compradores vuelven a entrar o piden otro link).
        migrationBuilder.Sql("DELETE FROM customer_sessions;");
        migrationBuilder.Sql("DELETE FROM customer_tokens;");

        migrationBuilder.RenameColumn(
            name: "token_hash",
            table: "customer_tokens",
            newName: "token");

        migrationBuilder.RenameIndex(
            name: "ix_customer_tokens_token_hash",
            table: "customer_tokens",
            newName: "ix_customer_tokens_token");

        migrationBuilder.RenameColumn(
            name: "token_hash",
            table: "customer_sessions",
            newName: "token");

        migrationBuilder.RenameIndex(
            name: "ix_customer_sessions_token_hash",
            table: "customer_sessions",
            newName: "ix_customer_sessions_token");
    }
}
