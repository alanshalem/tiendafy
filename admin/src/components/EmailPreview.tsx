import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Vista previa de un email escalada para que los 600px del layout estándar
 * entren COMPLETOS a lo ancho del contenedor (sin corte a la derecha ni
 * scroll horizontal). El alto restante scrollea dentro del iframe: un solo
 * scroll, el del email.
 */
export function EmailPreview({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / 600));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="h-full w-full overflow-hidden bg-[#f4f4f5]">
      <iframe
        title="Vista previa del email"
        sandbox=""
        srcDoc={html}
        style={{
          width: 600,
          height: `${100 / scale}%`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          border: 0,
        }}
      />
    </div>
  );
}

/**
 * Columna "Vista previa" completa (header de asunto + email escalado +
 * caption). Antes copiada en CampaignModal y AutoEmails.
 */
export function EmailPreviewPanel({
  subject,
  preview,
  caption,
}: {
  subject: string;
  preview: { subject: string; html: string } | null;
  caption: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-1.5 text-sm font-medium text-fg">Vista previa</div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
        <div className="shrink-0 border-b border-border bg-bg-muted/50 px-4 py-2 text-xs text-fg-muted">
          Asunto: <span className="font-medium text-fg">{preview?.subject || subject || '(sin asunto)'}</span>
        </div>
        <div className="min-h-0 flex-1">
          {preview ? (
            <EmailPreview html={preview.html} />
          ) : (
            <div className="flex h-full items-center justify-center bg-bg-muted/30 text-sm text-fg-muted">
              Generando vista previa…
            </div>
          )}
        </div>
      </div>
      <p className="mt-1.5 shrink-0 text-xs text-fg-muted">{caption}</p>
    </div>
  );
}
