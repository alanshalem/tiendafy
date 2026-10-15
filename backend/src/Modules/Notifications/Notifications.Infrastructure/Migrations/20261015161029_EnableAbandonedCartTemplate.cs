using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Notifications.Infrastructure.Migrations;

/// <inheritdoc />
public partial class EnableAbandonedCartTemplate : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Hasta acá el email de carrito abandonado salía SIEMPRE, con un texto
        // fijo: el interruptor de la plantilla "carritos-abandonados" no hacía
        // nada. Ahora el interruptor manda, y la plantilla viene prendida de
        // fábrica. Las tiendas que la habían guardado apagada (editando el
        // texto con el interruptor en su default, que era apagado) igual
        // recibían el email: se prenden para que nadie deje de mandarlo con
        // el deploy. Desde ahora, apagarla la apaga de verdad.
        migrationBuilder.Sql("UPDATE email_templates SET enabled = TRUE WHERE type = 'carritos-abandonados' AND enabled = FALSE;");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Sin vuelta atrás: no se sabe cuáles estaban apagadas antes.
    }
}
