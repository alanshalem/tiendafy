import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/** Las listas son verticales: el ítem que se arrastra no se va de costado. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/**
 * Lista reordenable arrastrando, con mouse, dedo o teclado.
 *
 * El arrastre nativo de HTML (draggable) no anda con el dedo y no tiene
 * teclado: en un celular las listas del editor no se podían ordenar más que
 * con las flechitas. Esto usa dnd-kit:
 *   - mouse: se arrastra desde la manija apenas se mueve 4 px;
 *   - dedo: manteniendo apretado 200 ms (así deslizar la pantalla sigue
 *     scrolleando);
 *   - teclado: Tab hasta la manija, Espacio para levantar, flechas para
 *     mover, Espacio para soltar, Escape para cancelar. Un lector de
 *     pantalla anuncia cada paso en castellano.
 *
 * Uso:
 *   <SortableList
 *     items={secciones}
 *     getId={(s) => s.id}
 *     onReorder={(from, to) => mover(from, to)}
 *     renderItem={(s, { handle, index }) => (
 *       <div>
 *         <DragHandle {...handle} label={`Mover ${s.nombre}`} />
 *         …
 *       </div>
 *     )}
 *   />
 *
 * `handle` va en la manija (un <button>, ver DragHandle): solo desde ahí se
 * arrastra, así los campos de adentro del ítem siguen funcionando normal.
 */
export interface SortableHandle {
  /** Atributos y eventos para la manija de arrastre. */
  attributes: HTMLAttributes<HTMLElement>;
  listeners: Record<string, (event: never) => void> | undefined;
  /** Callback ref de la manija (dnd-kit la usa para devolverle el foco al soltar). */
  setActivator: (el: HTMLElement | null) => void;
}

export interface SortableItemState {
  handle: SortableHandle;
  index: number;
  isDragging: boolean;
}

export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  itemName = (_item, index) => `el ítem ${index + 1}`,
  className,
}: {
  items: readonly T[];
  getId: (item: T, index: number) => string;
  /** Mover de la posición `from` a la `to` (índices de `items`). */
  onReorder: (from: number, to: number) => void;
  renderItem: (item: T, state: SortableItemState) => ReactNode;
  /** Cómo se nombra un ítem en los anuncios del lector de pantalla. */
  itemName?: (item: T, index: number) => string;
  className?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((item, i) => getId(item, i));
  const indexOf = (id: string | number) => ids.indexOf(String(id));
  const nameOf = (id: string | number) => {
    const i = indexOf(id);
    return i >= 0 ? itemName(items[i]!, i) : 'el ítem';
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Levantaste ${nameOf(active.id)}, en la posición ${indexOf(active.id) + 1} de ${ids.length}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)} pasa a la posición ${indexOf(over.id) + 1} de ${ids.length}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Soltaste ${nameOf(active.id)} en la posición ${indexOf(over.id) + 1} de ${ids.length}.`
        : `Soltaste ${nameOf(active.id)}.`,
    onDragCancel: ({ active }) => `Cancelado: ${nameOf(active.id)} quedó donde estaba.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = indexOf(active.id);
    const to = indexOf(over.id);
    if (from >= 0 && to >= 0) onReorder(from, to);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Para mover este ítem, apretá Espacio. Con las flechas lo llevás arriba o abajo; Espacio lo suelta y Escape cancela.',
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item, index) => (
            <SortableRow key={ids[index]} id={ids[index]!}>
              {(handle, isDragging) => renderItem(item, { handle, index, isDragging })}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (handle: SortableHandle, isDragging: boolean) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} data-sortable-id={id}>
      {children(
        {
          attributes: attributes as HTMLAttributes<HTMLElement>,
          listeners: listeners as SortableHandle['listeners'],
          setActivator: setActivatorNodeRef,
        },
        isDragging,
      )}
    </div>
  );
}

/** La manija de arrastre: un botón de 40 px (se acierta con el dedo) que también se usa con teclado. */
export function DragHandle({
  handle: { setActivator, attributes, listeners },
  label,
  className,
  children,
}: {
  handle: SortableHandle;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      ref={setActivator}
      {...attributes}
      {...(listeners as Record<string, unknown>)}
      aria-label={label}
      title="Arrastrar para reordenar"
      className={
        className ??
        'flex h-10 w-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-fg-subtle hover:bg-bg-muted active:cursor-grabbing'
      }
    >
      {children}
    </button>
  );
}
