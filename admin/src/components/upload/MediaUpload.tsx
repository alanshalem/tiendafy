import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ImagePlus,
  Film,
  RefreshCw,
  X,
} from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { UPLOADS, type IdealSize, type UploadKind, type UploadSpec } from '../../lib/uploads';
import {
  LoadingImg,
  UploadBar,
  UploadNotes,
  UploadSpecHint,
  uploadMedia,
  useDropTarget,
  useFilePicker,
  useUploadQueue,
  type PendingUpload,
} from './primitives';

/*
 * Imágenes y videos de la tienda (editor de diseño): uno solo (logo, banner)
 * o varios en orden (carrusel, marcas). Mientras sube, el lugar muestra la
 * vista previa con el brillo de carga y el avance real; después, la imagen
 * tal como la va a recortar la tienda.
 */

const isVideo = (spec: UploadSpec) => spec.formats.every((f) => f === 'mp4' || f === 'webm');

/** Alto máximo de la vista previa: el panel del editor es angosto. */
const PREVIEW_MAX_HEIGHT = 128;

/** Cuadriculado de transparencia: un logo blanco no se pierde sobre el fondo. */
const CHECKERBOARD: CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage:
    'linear-gradient(45deg,#dfe1e5 25%,transparent 25%),linear-gradient(-45deg,#dfe1e5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#dfe1e5 75%),linear-gradient(-45deg,transparent 75%,#dfe1e5 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
};

const ratioOf = (spec: UploadSpec) => (spec.ideal ? spec.ideal.width / spec.ideal.height : 16 / 9);

/**
 * El recuadro con la proporción del lugar real: una foto `cover` se ve
 * recortada como la va a recortar la tienda, y no hay sorpresas al publicar.
 */
function Frame({
  spec,
  highlight = false,
  className,
  children,
  ...rest
}: { spec: UploadSpec; highlight?: boolean; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const ratio = ratioOf(spec);
  return (
    <div
      {...rest}
      className={cn(
        'relative mx-auto overflow-hidden rounded-md border',
        highlight ? 'border-primary ring-2 ring-primary/40' : 'border-border',
        className,
      )}
      style={{
        aspectRatio: String(ratio),
        width: `min(100%, ${Math.round(PREVIEW_MAX_HEIGHT * ratio)}px)`,
        ...(spec.fit === 'contain' ? CHECKERBOARD : { backgroundColor: 'rgb(var(--color-bg-muted))' }),
      }}
    >
      {children}
    </div>
  );
}

function mediaClass(spec: UploadSpec) {
  return cn('h-full w-full', spec.fit === 'contain' ? 'object-contain p-2' : 'object-cover');
}

/** Lo que está subiendo: su vista previa, el brillo de carga y el avance. */
function PendingFrame({
  spec,
  item,
  onCancel,
}: {
  spec: UploadSpec;
  item: PendingUpload;
  onCancel: () => void;
}) {
  return (
    <Frame spec={spec} aria-busy="true">
      {item.preview &&
        (isVideo(spec) ? (
          <video src={item.preview} muted playsInline className={cn(mediaClass(spec), 'opacity-60')} />
        ) : (
          <img src={item.preview} alt="" className={cn(mediaClass(spec), 'opacity-60')} />
        ))}
      <span aria-hidden className="upload-shimmer" />
      <div className="absolute inset-x-0 bottom-0 bg-surface/90 px-2 py-1.5">
        {item.started ? (
          <UploadBar name={item.file.name} fraction={item.progress} onCancel={onCancel} />
        ) : (
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
            <span>En espera…</span>
            <button
              type="button"
              onClick={onCancel}
              aria-label={`Cancelar subida de ${item.file.name}`}
              className="rounded p-0.5 hover:bg-bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </Frame>
  );
}

/** El recuadro vacío: elegir o arrastrar. */
function EmptyDrop({
  spec,
  label,
  onClick,
  drop,
  className,
}: {
  spec: UploadSpec;
  label: string;
  onClick: () => void;
  drop: ReturnType<typeof useDropTarget>;
  className?: string;
}) {
  const Icon = isVideo(spec) ? Film : ImagePlus;
  return (
    <button
      type="button"
      onClick={onClick}
      {...drop.handlers}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-2 py-5 text-primary transition-colors',
        drop.over ? 'border-primary bg-primary/[0.08]' : 'border-primary/40 hover:bg-primary/[0.05]',
        className,
      )}
    >
      <Icon className="h-6 w-6" aria-hidden />
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-[11px] text-fg-subtle">o arrastralo acá</span>
    </button>
  );
}

const iconButton =
  'flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75 disabled:opacity-30';

/** Una imagen o un video (logo, favicon, banner, poster…). */
export function MediaUpload({
  kind,
  value,
  onChange,
  ideal,
  label,
}: {
  kind: UploadKind;
  value: string;
  onChange: (url: string) => void;
  /**
   * La medida a la que se muestra, si depende de lo que eligió el comercio
   * (la proporción de un banner, el alto del carrusel). Cambia el recuadro de
   * la vista previa, la medida recomendada y los avisos de recorte.
   */
  ideal?: IdealSize;
  /** Qué se elige ("Elegir imagen para celular"); por defecto, imagen o video. */
  label?: string;
}) {
  const base: UploadSpec = UPLOADS[kind];
  const spec: UploadSpec = ideal ? { ...base, ideal } : base;
  const video = isVideo(spec);
  const noun = video ? 'video' : 'imagen';
  const queue = useUploadQueue(kind, uploadMedia, spec);
  const take = (files: File[]) => void queue.run(files.slice(0, 1), (url) => onChange(url));
  const picker = useFilePicker({ kind, onFiles: take, disabled: queue.busy });
  const drop = useDropTarget(take, queue.busy);
  const [size, setSize] = useState<string | null>(null);
  const current = queue.pending[0];

  return (
    <div className="space-y-2">
      {picker.input}
      {current ? (
        <PendingFrame spec={spec} item={current} onCancel={() => queue.cancel(current.id)} />
      ) : value ? (
        <div>
          <Frame spec={spec} highlight={drop.over} {...drop.handlers}>
            {video ? (
              <video
                src={value}
                className={mediaClass(spec)}
                muted
                playsInline
                loop
                autoPlay
                onLoadedMetadata={(e) =>
                  setSize(`${e.currentTarget.videoWidth}×${e.currentTarget.videoHeight} px`)
                }
              />
            ) : (
              <LoadingImg
                src={value}
                className={mediaClass(spec)}
                onLoad={(e) => setSize(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight} px`)}
              />
            )}
          </Frame>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[11px] tabular-nums text-fg-subtle">{size}</span>
            <button
              type="button"
              onClick={picker.open}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-fg hover:bg-bg-muted"
            >
              <RefreshCw className="h-3 w-3" aria-hidden /> Reemplazar
            </button>
            <button
              type="button"
              onClick={() => {
                onChange('');
                setSize(null);
              }}
              aria-label={`Quitar ${noun}`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-danger hover:bg-danger/[0.06]"
            >
              <X className="h-3 w-3" aria-hidden /> Quitar
            </button>
          </div>
        </div>
      ) : (
        <EmptyDrop
          spec={spec}
          label={label ?? (video ? 'Elegir video' : 'Elegir imagen')}
          onClick={picker.open}
          drop={drop}
        />
      )}
      <UploadSpecHint kind={kind} spec={spec} />
      <UploadNotes notes={queue.notes} onDismiss={queue.dismissNotes} showFile={false} />
    </div>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const next = [...arr];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Varias imágenes en orden (carrusel, logos de marcas): subir de a muchas, ordenar, quitar. */
export function MediaUploadList({
  kind,
  values,
  onChange,
}: {
  kind: UploadKind;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const spec: UploadSpec = UPLOADS[kind];
  // Las subidas terminan de a una: cada una se suma a lo último que se
  // informó, no a la lista de cuando se eligieron los archivos.
  const latest = useRef(values);
  useLayoutEffect(() => {
    latest.current = values;
  });
  const queue = useUploadQueue(kind, uploadMedia);
  const add = (files: File[]) =>
    void queue.run(files, (url) => {
      latest.current = [...latest.current, url];
      onChange(latest.current);
    });
  const picker = useFilePicker({ kind, multiple: true, onFiles: add });
  const drop = useDropTarget(add);
  // Las apaisadas (carrusel 1580×600) se ven mejor una por fila.
  const wide = ratioOf(spec) > 1.6;
  const [Before, After] = wide ? [ChevronUp, ChevronDown] : [ChevronLeft, ChevronRight];

  return (
    <div className="space-y-2">
      {picker.input}
      <ul className={cn('grid gap-2', wide ? 'grid-cols-1' : 'grid-cols-2')}>
        {values.map((src, i) => (
          <li key={`${src}-${i}`}>
            <Frame spec={spec}>
              <LoadingImg src={src} className={mediaClass(spec)} />
              <div className="absolute right-1 top-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => onChange(swap(values, i, i - 1))}
                  disabled={i === 0}
                  aria-label="Mover antes"
                  className={iconButton}
                >
                  <Before className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(swap(values, i, i + 1))}
                  disabled={i === values.length - 1}
                  aria-label="Mover después"
                  className={iconButton}
                >
                  <After className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                  aria-label="Quitar imagen"
                  className={cn(iconButton, 'bg-danger text-status-fg hover:bg-danger')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </Frame>
          </li>
        ))}
        {queue.pending.map((item) => (
          <li key={item.id}>
            <PendingFrame spec={spec} item={item} onCancel={() => queue.cancel(item.id)} />
          </li>
        ))}
        <li>
          <EmptyDrop
            spec={spec}
            label={values.length ? 'Agregar más imágenes' : 'Elegir imágenes'}
            onClick={picker.open}
            drop={drop}
            className="h-full min-h-24"
          />
        </li>
      </ul>
      <UploadSpecHint kind={kind} />
      <UploadNotes notes={queue.notes} onDismiss={queue.dismissNotes} />
    </div>
  );
}
