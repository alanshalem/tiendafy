import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Copy, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn, useConfirm } from '@tiendafy/ui';
import { LABEL_MAX, type ItemBase } from '@tiendafy/types';
import { moveItem } from '../../../lib/arrays';
import { DragHandle, SortableList } from '../../../components/SortableList';
import { INPUT_BASE } from '../../theme-editor-inputs';

/**
 * Editor genérico de una lista de ítems dentro de una sección (banners,
 * preguntas, testimonios…). Cada ítem es una tarjeta plegable con:
 *   - título: el nombre que le puso el comercio, o el que se deriva del
 *     contenido (título, nombre, pregunta), o "Ítem N";
 *   - renombrar en el lugar (solo cambia cómo se ve en el editor);
 *   - reordenar arrastrando (mouse, dedo o teclado) y con flechas;
 *   - duplicar, y eliminar con confirmación;
 *   - agregar, respetando el máximo del registro.
 * Todos los botones miden 40 px: se usan con el dedo.
 *
 * El formulario de cada ítem lo pone quien lo usa (`renderItem`):
 *
 *   <ItemListEditor
 *     items={data.items}
 *     onChange={(items) => set({ items })}
 *     max={40}
 *     addLabel="Agregar pregunta"
 *     createItem={() => ({ question: '', answer: '' })}
 *     renderItem={(item, update) => (
 *       <TextInput value={item.question} onChange={(v) => update({ question: v })} />
 *     )}
 *   />
 */
export interface ItemListEditorProps<T extends ItemBase> {
  items: T[];
  onChange: (items: T[]) => void;
  renderItem: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  createItem: () => T;
  addLabel: string;
  /** Tope de ítems (el del registro de secciones). Sin valor = sin tope. */
  max?: number;
  /** Título derivado del contenido. Por defecto: title, name o question. */
  itemTitle?: (item: T) => string;
  /** Nombre de la lista para los lectores de pantalla ("Preguntas"). */
  listLabel?: string;
}

const derivedTitle = (item: ItemBase): string => {
  const it = item as Record<string, unknown>;
  for (const key of ['title', 'name', 'question']) {
    const v = it[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
};

/** El título que se muestra de un ítem: su nombre, el derivado, o "Ítem N". */
export function itemDisplayTitle<T extends ItemBase>(
  item: T,
  index: number,
  derive: (item: T) => string = derivedTitle,
): string {
  return item.label?.trim() || derive(item) || `Ítem ${index + 1}`;
}

let keySeq = 0;
/** Clave nueva para un ítem (solo en handlers: no es pura). */
const newKey = () => `item-${++keySeq}`;
/** Claves de una lista que llegó de afuera: deterministas, para poder calcularlas al dibujar. */
const freshKeys = (gen: number, n: number) => Array.from({ length: n }, (_, i) => `g${gen}-${i}`);

const ICON_BUTTON =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg disabled:pointer-events-none disabled:opacity-30';

export function ItemListEditor<T extends ItemBase>({
  items,
  onChange,
  renderItem,
  createItem,
  addLabel,
  max,
  itemTitle = derivedTitle,
  listLabel,
}: ItemListEditorProps<T>) {
  const confirm = useConfirm();
  // Los ítems no tienen id propio: se les da una clave estable mientras dura
  // la edición, que acompaña al ítem cuando se mueve, se duplica o se borra.
  // Si la lista cambia desde afuera (deshacer, otra versión), se rehace.
  const [state, setState] = useState(() => ({ gen: 0, keys: freshKeys(0, items.length) }));
  let keys = state.keys;
  if (keys.length !== items.length) {
    keys = freshKeys(state.gen + 1, items.length);
    setState({ gen: state.gen + 1, keys });
  }
  const [open, setOpen] = useState<Set<string>>(() => new Set(items.length === 1 ? keys : []));
  const [renaming, setRenaming] = useState<string | null>(null);

  const full = max !== undefined && items.length >= max;
  const titleOf = (item: T, i: number) => itemDisplayTitle(item, i, itemTitle);

  const commit = (next: T[], nextKeys: string[]) => {
    setState((s) => ({ ...s, keys: nextKeys }));
    onChange(next);
  };
  const update = (i: number) => (patch: Partial<T>) =>
    commit(
      items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
      keys,
    );
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    commit(moveItem(items, from, to), moveItem(keys, from, to));
  };
  const duplicate = (i: number) => {
    if (full) return;
    const src = items[i]!;
    const copy = JSON.parse(JSON.stringify(src)) as T;
    if (copy.label) copy.label = `${copy.label} (copia)`.slice(0, LABEL_MAX);
    const key = newKey();
    commit(
      [...items.slice(0, i + 1), copy, ...items.slice(i + 1)],
      [...keys.slice(0, i + 1), key, ...keys.slice(i + 1)],
    );
    setOpen((s) => new Set(s).add(key));
  };
  const remove = async (i: number) => {
    const ok = await confirm({
      title: 'Eliminar',
      message: `¿Eliminar «${titleOf(items[i]!, i)}»? Lo podés recuperar con Ctrl+Z.`,
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    commit(
      items.filter((_, idx) => idx !== i),
      keys.filter((_, idx) => idx !== i),
    );
  };
  const add = () => {
    if (full) return;
    const key = newKey();
    commit([...items, createItem()], [...keys, key]);
    setOpen((s) => new Set(s).add(key));
  };
  const rename = (i: number, label: string) => {
    const clean = label.trim().slice(0, LABEL_MAX);
    const next = { ...items[i]! };
    if (clean) next.label = clean;
    else delete next.label;
    commit(
      items.map((it, idx) => (idx === i ? next : it)),
      keys,
    );
  };
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-2" role="group" aria-label={listLabel}>
      <SortableList
        items={items}
        getId={(_, i) => keys[i]!}
        onReorder={move}
        itemName={(item, i) => `«${titleOf(item, i)}»`}
        className="space-y-2"
        renderItem={(item, { handle, index, isDragging }) => {
          const key = keys[index]!;
          const expanded = open.has(key);
          const title = titleOf(item, index);
          const bodyId = `${key}-body`;
          return (
            <div
              className={cn(
                'rounded-md border border-border bg-surface',
                isDragging && 'shadow-lg ring-2 ring-primary/30',
              )}
            >
              <div className="flex items-center gap-0.5 pr-1">
                <DragHandle handle={handle} label={`Mover «${title}»`}>
                  <GripVertical className="h-4 w-4" />
                </DragHandle>
                {renaming === key ? (
                  <RenameInput
                    initial={item.label ?? ''}
                    placeholder={titleOf({ ...item, label: '' }, index)}
                    onDone={(value) => {
                      if (value !== null) rename(index, value);
                      setRenaming(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    aria-expanded={expanded}
                    aria-controls={bodyId}
                    className="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left text-sm font-medium text-fg hover:bg-bg-muted"
                  >
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-fg-subtle transition-transform',
                        !expanded && '-rotate-90',
                      )}
                      aria-hidden
                    />
                    <span className="truncate">{title}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Subir «${title}»`}
                  className={ICON_BUTTON}
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === items.length - 1}
                  aria-label={`Bajar «${title}»`}
                  className={ICON_BUTTON}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              {expanded && (
                <div id={bodyId} className="space-y-3 border-t border-border p-3">
                  {renderItem(item, update(index), index)}
                  <div className="flex flex-wrap gap-1 border-t border-border pt-2">
                    <ActionButton onClick={() => setRenaming(key)} icon={Pencil}>
                      Renombrar
                    </ActionButton>
                    <ActionButton onClick={() => duplicate(index)} icon={Copy} disabled={full}>
                      Duplicar
                    </ActionButton>
                    <ActionButton onClick={() => void remove(index)} icon={Trash2} danger>
                      Eliminar
                    </ActionButton>
                  </div>
                </div>
              )}
            </div>
          );
        }}
      />
      <button
        type="button"
        onClick={add}
        disabled={full}
        className="inline-flex h-10 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="h-4 w-4" /> {addLabel}
      </button>
      {full && <p className="text-xs text-fg-subtle">Llegaste al máximo de {max}.</p>}
    </div>
  );
}

function ActionButton({
  onClick,
  icon: Icon,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  icon: typeof Pencil;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium hover:bg-bg-muted disabled:pointer-events-none disabled:opacity-40',
        danger ? 'text-danger' : 'text-fg-muted hover:text-fg',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden /> {children}
    </button>
  );
}

/**
 * Campo para renombrar en el lugar: Enter o salir del campo guarda, Escape
 * cancela. Lo usan los ítems de una lista y las filas de secciones del inicio.
 */
export function RenameInput({
  initial,
  placeholder,
  onDone,
  label = 'Nombre del ítem',
  className,
}: {
  initial: string;
  placeholder: string;
  onDone: (value: string | null) => void;
  label?: string;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <input
      autoFocus
      value={value}
      maxLength={LABEL_MAX}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(null);
        }
      }}
      onBlur={() => finish(value)}
      className={cn(`h-10 min-w-0 flex-1 px-2 text-sm ${INPUT_BASE}`, className)}
    />
  );
}
