import type { ReactNode } from 'react';

/** Ítem mínimo que la grilla necesita mostrar. */
interface TemplateGridItem {
  type: string;
  group: string;
  label: string;
  description: string;
}

/**
 * Grilla de plantillas automáticas agrupadas (misma UI en E-mails automáticos
 * y WhatsApp automático): card con título, descripción, link de edición y el
 * toggle que aporta cada página.
 */
export function TemplateGrid<T extends TemplateGridItem>({
  groups,
  items,
  editLabel,
  onEdit,
  renderToggle,
}: {
  groups: readonly string[];
  items: T[];
  editLabel: string;
  onEdit: (t: T) => void;
  renderToggle: (t: T) => ReactNode;
}) {
  return (
    <>
      {groups.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group}>
            <h2 className="mb-3 text-base font-semibold text-fg">{group}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {groupItems.map((t) => (
                <div key={t.type} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-fg">{t.label}</div>
                      <p className="mt-0.5 text-xs text-fg-muted">{t.description}</p>
                      <button
                        onClick={() => onEdit(t)}
                        className="mt-2 text-xs font-medium text-primary hover:underline"
                      >
                        {editLabel}
                      </button>
                    </div>
                    {renderToggle(t)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
