import { X } from 'lucide-react';
import { HOME_TEMPLATES, type HomeTemplate } from '@tiendafy/types';
import { TemplateWireframe } from './wireframes';

/**
 * Las plantillas de inicio (definidas en el registro compartido). Aplicar una
 * reemplaza las secciones por esa estructura, cada una con contenido de
 * ejemplo para que se vea enseguida en la vista previa.
 */
export function TemplatePicker({
  onPick,
  onClose,
}: {
  onPick: (template: HomeTemplate) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-2">
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Elegí una plantilla
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-bg-muted"
        >
          <X className="h-4 w-4 text-fg-subtle" />
        </button>
      </div>
      <div className="space-y-1.5">
        {HOME_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onPick(tpl)}
            className="block w-full rounded-md border border-border p-2.5 text-left transition hover:border-primary/50 hover:bg-bg-muted"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-fg">{tpl.name}</span>
              <span className="text-[0.7rem] text-fg-subtle">{tpl.sections.length} secciones</span>
            </div>
            <p className="mt-0.5 text-xs text-fg-muted">{tpl.description}</p>
            <TemplateWireframe sections={tpl.sections} />
          </button>
        ))}
      </div>
    </div>
  );
}
