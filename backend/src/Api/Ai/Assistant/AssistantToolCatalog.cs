using Identity.Infrastructure;

namespace Api.Ai.Assistant;

/// <summary>Una herramienta que el asistente puede ofrecerle al modelo, con el permiso que hace falta para verla.</summary>
/// <param name="Name">Nombre que lee el modelo.</param>
/// <param name="Label">Lo que ve la persona en "Consulté: …".</param>
public sealed record AssistantToolDef(string Name, string Label, string Description, Permission Permission);

/// <summary>
/// Las ocho herramientas, en el orden de la spec (estable: el orden entra en la clave del caché de prompts).
/// Las descripciones son constantes: sin fechas ni ids.
/// </summary>
public static class AssistantToolCatalog
{
    private const string Amounts = " Los montos traen el valor crudo y un campo text ya formateado: usá text.";

    public static IReadOnlyList<AssistantToolDef> All { get; } =
    [
        new("resumen_ventas", "Resumen de ventas",
            "Ventas del período: cantidad de órdenes, facturación, ticket promedio, comparación con el período anterior, Mercado Libre, clientes nuevos, origen del tráfico y productos principales." + Amounts,
            Permission.StatsRead),
        new("productos_mas_vendidos", "Productos más vendidos",
            "Los productos más vendidos del período por unidades y por facturación, y cuántos productos publicados no vendieron nada." + Amounts,
            Permission.StatsRead),
        new("carritos_abandonados", "Carritos abandonados",
            "Carritos abandonados del período: cuántos son, cuántos se pueden recuperar (dejaron un mail) y cuánta plata representan. No trae datos de las personas." + Amounts,
            Permission.OrdersRead),
        new("rentabilidad", "Rentabilidad",
            "Ganancia real del período: facturación, costo de los productos, comisiones de Mercado Pago, descuentos, margen, comparación con el período anterior, productos con más ganancia y con menor margen." + Amounts,
            Permission.CostsRead),
        new("stock_bajo", "Stock bajo",
            "Variantes con stock bajo o por agotarse (por reposición o por el mínimo que puso la tienda), con cuántas están agotadas y las unidades totales en depósito.",
            Permission.InventoryRead),
        new("sugerencias_de_reposicion", "Sugerencias de reposición",
            "Qué conviene reponer: variantes que se agotan antes de que llegue el próximo pedido, con ventas por día, días de cobertura y cantidad sugerida.",
            Permission.PurchasingManage),
        new("ordenes_de_compra", "Órdenes de compra",
            "Órdenes de compra a proveedores por estado (abiertas, en tránsito, recibidas, canceladas, sin factura o todas), más cuántas hay abiertas y en tránsito y cuánto está comprometido." + Amounts,
            Permission.PurchasingManage),
        new("resumen_clientes", "Resumen de clientes",
            "Cuántos clientes hay y cómo se reparten: nuevos en el período, con compras, recurrentes, que nunca compraron e inactivos hace más de 90 días, y el gasto promedio. Solo cantidades." + Amounts,
            Permission.CustomersRead),
    ];

    /// <summary>Las que puede ver quien pregunta: las que su rol (y sus excepciones) permiten.</summary>
    public static IEnumerable<AssistantToolDef> Allowed(MemberAccess access) =>
        All.Where(t => access.Can(t.Permission));
}
