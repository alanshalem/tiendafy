namespace Api.Notifications;

/// <summary>Mini-layout HTML de las páginas públicas de campañas (baja / tracking).</summary>
public static class PublicPage
{
    public static string Render(string title, string bodyHtml) => $"""
        <!DOCTYPE html>
        <html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>{title}</title></head>
        <body style="margin:0;background:#fafafa;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
          <div style="max-width:440px;margin:80px auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;text-align:center">
            <h1 style="font-size:20px;margin:0 0 12px">{title}</h1>
            {bodyHtml}
          </div>
        </body></html>
        """;
}
