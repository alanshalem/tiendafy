import { ChevronLeft, ChevronRight, ImagePlus, Undo2, X } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { ProgressTrack, useDropTarget, useFilePicker } from '../../components/upload/primitives';

/**
 * Las piezas de la grilla de fotos de un producto: la miniatura con sus
 * botones de quitar y ordenar, la que está subiendo y el recuadro punteado
 * para agregar. Las comparten "Nuevo producto" (archivos todavía locales) y
 * "Editar producto" (imágenes ya subidas), para que las dos pantallas se vean
 * igual.
 */

/**
 * La cruz de quitar. Se ve chica para no tapar la foto, pero el área que
 * recibe el toque es de 40 px: la de 20 px se erraba con el dedo y, al lado
 * del asa de arrastre, se tocaba sin querer.
 */
function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Quitar imagen"
      title="Quitar imagen"
      className="group/x absolute -right-3 -top-3 flex h-10 w-10 items-center justify-center rounded-full focus-visible:outline-none"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-danger text-status-fg shadow-sm group-hover/x:brightness-110 group-focus-visible/x:ring-2 group-focus-visible/x:ring-primary">
        <X className="h-3.5 w-3.5" aria-hidden />
      </span>
    </button>
  );
}

/**
 * Una foto de la grilla con lo necesario para ordenarla sin arrastrar: el
 * arrastre no anda con el teclado ni en el teléfono, y era la única forma de
 * elegir la portada. La primera foto es la portada y se marca como tal.
 *
 * `removed` la muestra apagada con "Restaurar" en vez de la cruz: en
 * "Editar producto" quitar una foto espera a "Guardar cambios" como todo lo
 * demás, así que hasta entonces se puede volver atrás.
 */
export function PhotoTile({
  src,
  cover,
  removed = false,
  onRemove,
  onRestore,
  onMoveLeft,
  onMoveRight,
  children,
}: {
  src: string;
  /** Es la primera foto (la que se ve en el listado y en la tienda). */
  cover: boolean;
  removed?: boolean;
  onRemove: () => void;
  onRestore?: () => void;
  /** Sin la función, la flecha queda deshabilitada (está en una punta). */
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  /** Adornos extra de la miniatura (por ejemplo, el asa para arrastrar). */
  children?: React.ReactNode;
}) {
  const arrow =
    'flex h-9 w-9 items-center justify-center rounded-md border border-border text-fg-muted hover:bg-bg-muted disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="w-24">
      <div className="relative">
        <img
          src={src}
          alt=""
          className={cn(
            'h-24 w-24 rounded-md border border-border bg-bg-muted object-cover',
            removed && 'opacity-40 grayscale',
          )}
        />
        {children}
        {removed ? (
          <span className="absolute inset-x-1 bottom-1 rounded bg-surface/90 px-1 py-0.5 text-center text-[10px] font-medium text-danger">
            Se quita al guardar
          </span>
        ) : (
          <>
            {cover && (
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Portada
              </span>
            )}
            <RemoveButton onClick={onRemove} />
          </>
        )}
      </div>
      {removed ? (
        <button
          type="button"
          onClick={onRestore}
          className="mt-1.5 flex h-9 w-full items-center justify-center gap-1 rounded-md border border-border text-xs font-medium text-primary hover:bg-bg-muted"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden /> Restaurar
        </button>
      ) : (
        <div className="mt-1.5 flex justify-between">
          <button
            type="button"
            onClick={onMoveLeft}
            disabled={!onMoveLeft}
            aria-label="Mover a la izquierda"
            title="Mover a la izquierda"
            className={arrow}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onMoveRight}
            disabled={!onMoveRight}
            aria-label="Mover a la derecha"
            title="Mover a la derecha"
            className={arrow}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

/** El arreglo con el elemento `from` cambiado de lugar con su vecino (-1 izquierda, +1 derecha). */
export function moveItem<T>(list: T[], from: number, step: -1 | 1): T[] {
  const to = from + step;
  if (from < 0 || to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** Una foto que está subiendo: su vista previa con el brillo de carga y el avance. */
export function UploadingThumb({
  src,
  name,
  progress,
  started,
  onCancel,
}: {
  src: string | null;
  name: string;
  progress: number;
  /** Ya empezó a viajar; si no, espera su turno. */
  started: boolean;
  onCancel?: () => void;
}) {
  return (
    <div
      aria-busy="true"
      title={name}
      className="relative h-24 w-24 overflow-hidden rounded-md border border-border bg-bg-muted"
    >
      {src && <img src={src} alt="" className="h-full w-full object-cover opacity-60" />}
      <span aria-hidden className="upload-shimmer" />
      <div className="absolute inset-x-0 bottom-0 bg-surface/90 px-1.5 py-1">
        <div className="text-center text-[10px] font-medium tabular-nums text-fg-muted">
          {!started ? 'En espera' : progress >= 1 ? 'Guardando…' : `${Math.round(progress * 100)} %`}
        </div>
        <ProgressTrack fraction={started ? progress : 0} label={`Subiendo ${name}`} className="mt-0.5 h-1" />
      </div>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          aria-label={`Cancelar subida de ${name}`}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function AddImagesTile({
  onFiles,
  disabled = false,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const picker = useFilePicker({ kind: 'productImage', multiple: true, disabled, onFiles });
  const drop = useDropTarget(onFiles, disabled);
  return (
    <>
      {picker.input}
      <button
        type="button"
        onClick={picker.open}
        disabled={disabled}
        {...drop.handlers}
        className={cn(
          'flex h-24 w-24 flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          drop.over ? 'border-primary bg-primary/[0.08]' : 'border-primary/40 hover:bg-primary/[0.05]',
        )}
      >
        <ImagePlus className="h-5 w-5" aria-hidden />
        <span className="text-[0.7rem] font-semibold">Agregar</span>
        <span className="text-[0.6rem] text-fg-subtle">o arrastrá</span>
      </button>
    </>
  );
}
