using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Identity.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class BackfillMerchantEmailConfirmed : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // El login ahora exige email_confirmed. Las cuentas creadas ANTES de que
            // existiera la verificación quedan confirmadas (grandfathering) para no
            // dejar afuera a los merchants existentes.
            migrationBuilder.Sql("UPDATE users SET email_confirmed = TRUE WHERE email_confirmed = FALSE;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
