import { useId } from 'react';
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { sectionDisplayName, type SectionHideOn, type ThemeSection } from '@tiendafy/types';
import { ActionMenu, type ActionMenuEntry } from '../../../components/ActionMenu';
import { DragHandle, type SortableHandle } from '../../../components/SortableList';
import { RenameInput } from './ItemListEditor';
import { sectionSummary } from './sectionSummary';

export interface SectionRowActions {
  onOpen: () => void;
  onToggleVisible: () => void;
  onStartRename: () => void;
  onRename: (name: string | null) => void;
  onDuplicate: () => void;
  onHideOn: (hideOn: SectionHideOn | undefined) => void;
  onMove: (dir: -1 | 1) => void;
  onInsert: (where: 'before' | 'after') => void;
  onRemove: () => void;
}

/** Atributo con el que se encuentra el botón principal de una fila (para devolverle el foco). */
export const ROW_MAIN_ATTR = 'data-section-row';

/**
 * Una fila de la lista de secciones del inicio.
 *
 *   [manija] Nombre propio ……………………… [ojo] [⋯]
 *            qué tiene adentro (resumen)
 *
 * Tocar la fila abre su panel. El ojo la oculta sin borrarla. El resto
 * (renombrar, duplicar, en qué dispositivo se ve, mover, agregar arriba o
 * abajo, eliminar) va en el menú ⋯: antes la X de borrar estaba pegada al
 * ojo, en 16 px, y borraba sin preguntar. Todo mide 40 px o más.
 */
export function SectionRow({
  section,
  index,
  total,
  handle,
  isDragging,
  renaming,
  duplicateBlocked,
  addBlocked,
  actions,
}: {
  section: ThemeSection;
  index: number;
  total: number;
  handle: SortableHandle;
  isDragging: boolean;
  renaming: boolean;
  /** Por qué no se puede duplicar (uno por página, tope), o null. */
  duplicateBlocked: string | null;
  /** Por qué no se puede agregar otra sección (tope), o null. */
  addBlocked: string | null;
  actions: SectionRowActions;
}) {
  const name = sectionDisplayName(section);
  const summary = sectionSummary(section);
  const summaryId = useId();
  const device = section.hideOn ?? 'all';

  const entries: ActionMenuEntry[] = [
    { label: 'Cambiar nombre', icon: Pencil, onSelect: actions.onStartRename },
    {
      label: 'Duplicar',
      icon: Copy,
      onSelect: actions.onDuplicate,
      disabled: !!duplicateBlocked,
      hint: duplicateBlocked ?? undefined,
    },
    {
      label: 'Agregar sección arriba',
      icon: Plus,
      onSelect: () => actions.onInsert('before'),
      disabled: !!addBlocked,
    },
    {
      label: 'Agregar sección abajo',
      icon: Plus,
      onSelect: () => actions.onInsert('after'),
      disabled: !!addBlocked,
    },
    { type: 'label', label: 'Mostrar en' },
    {
      label: 'Celulares y computadoras',
      checked: device === 'all',
      onSelect: () => actions.onHideOn(undefined),
    },
    // hideOn dice dónde NO se ve: "solo en celulares" es ocultarla en la computadora.
    {
      label: 'Solo en celulares',
      checked: device === 'desktop',
      onSelect: () => actions.onHideOn('desktop'),
    },
    {
      label: 'Solo en computadoras',
      checked: device === 'mobile',
      onSelect: () => actions.onHideOn('mobile'),
    },
    { type: 'separator' },
    { label: 'Mover arriba', icon: ArrowUp, onSelect: () => actions.onMove(-1), disabled: index === 0 },
    {
      label: 'Mover abajo',
      icon: ArrowDown,
      onSelect: () => actions.onMove(1),
      disabled: index === total - 1,
    },
    { type: 'separator' },
    { label: 'Eliminar', icon: Trash2, onSelect: actions.onRemove, danger: true },
  ];

  return (
    <div
      className={cn(
        'flex min-h-14 items-center gap-0.5 rounded-lg border border-border bg-surface pr-1 transition-shadow',
        isDragging && 'shadow-lg ring-2 ring-primary/30',
        !section.visible && 'bg-bg-subtle',
      )}
    >
      <DragHandle handle={handle} label={`Mover «${name}»`}>
        <GripVertical className="h-4 w-4" aria-hidden />
      </DragHandle>
      {renaming ? (
        <RenameInput
          initial={section.name ?? ''}
          placeholder={sectionDisplayName({ type: section.type })}
          label="Nombre de la sección"
          onDone={actions.onRename}
          className="mr-1"
        />
      ) : (
        <button
          type="button"
          onClick={actions.onOpen}
          {...{ [ROW_MAIN_ATTR]: section.id }}
          aria-label={`Editar «${name}»`}
          aria-describedby={summary ? summaryId : undefined}
          className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-md px-1.5 py-1 text-left hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span
            className={cn(
              // Hasta dos renglones: "Información de envíos, pagos y compra" se cortaba en "Información de envío…".
              'line-clamp-2 w-full text-sm font-medium leading-snug break-words',
              section.visible ? 'text-fg' : 'text-fg-muted',
            )}
          >
            {name}
          </span>
          {summary && (
            <span id={summaryId} className="w-full truncate text-xs text-fg-muted">
              {summary}
            </span>
          )}
        </button>
      )}
      <button
        type="button"
        onClick={actions.onToggleVisible}
        aria-pressed={section.visible}
        aria-label={`Mostrar «${name}» en la tienda`}
        title={section.visible ? 'Visible. Tocá para ocultarla.' : 'Oculta. Tocá para mostrarla.'}
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-bg-muted',
          section.visible ? 'text-fg-muted hover:text-fg' : 'text-fg-subtle',
        )}
      >
        {section.visible ? (
          <Eye className="h-[1.125rem] w-[1.125rem]" aria-hidden />
        ) : (
          <EyeOff className="h-[1.125rem] w-[1.125rem]" aria-hidden />
        )}
      </button>
      <ActionMenu label={`Más acciones de «${name}»`} entries={entries} />
    </div>
  );
}
