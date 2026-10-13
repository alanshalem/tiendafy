import { ImagePlus, X } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { ProgressTrack, useDropTarget, useFilePicker } from '../../components/upload/primitives';

/**
 * Las piezas de la grilla de fotos de un producto: la miniatura con su
 * botón de quitar, la que está subiendo y el recuadro punteado para agregar.
 * Las comparten "Nuevo producto" (archivos todavía locales) y "Editar
 * producto" (imágenes ya subidas), para que las dos pantallas se vean igual.
 */
export function RemovableThumb({
  src,
  onRemove,
  children,
}: {
  src: string;
  onRemove: () => void;
  /** Adornos extra de la miniatura (por ejemplo, el asa para arrastrar). */
  children?: React.ReactNode;
}) {
  return (
    <>
      <img src={src} alt="" className="h-24 w-24 rounded-md border border-border bg-bg-muted object-cover" />
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Quitar imagen"
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-status-fg"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </>
  );
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
