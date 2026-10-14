import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { CircleAlert, CloudUpload, TriangleAlert, X } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { api, errMsg, UploadAbortedError, type UploadProgress } from '../../lib/api';
import {
  UPLOADS,
  acceptOf,
  adviceFor,
  describe,
  readDimensions,
  rejectReason,
  type UploadKind,
  type UploadSpec,
} from '../../lib/uploads';

/*
 * Las piezas de toda subida del panel. Acá vive el ÚNICO <input type="file">
 * (un test lo vigila): así ningún lugar nuevo se saltea la revisión previa,
 * los formatos aceptados ni el avance.
 */

/** Sube una imagen o un video de la tienda y devuelve su URL pública. */
export async function uploadMedia(file: File, progress?: UploadProgress): Promise<string> {
  return (await api.upload<{ url: string }>('/api/v1/media', file, progress)).url;
}

/* ------------------------------------------------------------ elegir y soltar */

/**
 * El diálogo de "elegir archivo" de una ficha. Devuelve el input (va en el
 * árbol, oculto) y cómo abrirlo desde un botón propio.
 */
export function useFilePicker({
  kind,
  multiple = false,
  disabled = false,
  onFiles,
}: {
  kind: UploadKind;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept={acceptOf(UPLOADS[kind])}
      multiple={multiple}
      disabled={disabled}
      className="hidden"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        // Sin esto, volver a elegir el mismo archivo (tras corregirlo) no dispara nada.
        e.target.value = '';
        if (files.length) onFiles(files);
      }}
    />
  );
  return { input, open: () => ref.current?.click() };
}

/** Arrastrar y soltar sobre un recuadro. */
export function useDropTarget(onFiles: (files: File[]) => void, disabled = false) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (!disabled && files.length) onFiles(files);
      },
    },
  };
}

/**
 * El recuadro punteado de "elegí o arrastrá". Muestra qué formatos sirven
 * antes de elegir, no después del rechazo.
 */
export function FileDropzone({
  kind,
  label,
  multiple = false,
  disabled = false,
  onFiles,
  className,
  compact = false,
  icon,
}: {
  kind: UploadKind;
  label: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
  /** Sin la ficha adentro: la muestra la pantalla aparte (recuadros chicos). */
  compact?: boolean;
  icon?: ReactNode;
}) {
  const picker = useFilePicker({ kind, multiple, disabled, onFiles });
  const drop = useDropTarget(onFiles, disabled);
  return (
    <div
      {...drop.handlers}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-3 py-4 text-center transition-colors',
        disabled
          ? 'cursor-not-allowed border-border bg-bg-subtle text-fg-subtle'
          : drop.over
            ? 'border-primary bg-primary/[0.08] text-primary'
            : 'border-primary/40 bg-primary/[0.03] text-primary hover:bg-primary/[0.06]',
        className,
      )}
    >
      {picker.input}
      <button
        type="button"
        onClick={picker.open}
        disabled={disabled}
        className="flex flex-col items-center gap-1 rounded-md font-semibold disabled:cursor-not-allowed"
      >
        {icon ?? <CloudUpload className="h-6 w-6" aria-hidden />}
        <span className="text-xs sm:text-sm">{label}</span>
      </button>
      {!compact && (
        <>
          <span className="hidden text-[11px] font-normal text-fg-subtle sm:block">o arrastralo acá</span>
          <UploadSpecHint kind={kind} centered />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ la ficha a la vista */

/** Formatos, peso máximo y tamaño ideal, en etiquetas; y el consejo, si hay. */
export function UploadSpecHint({
  kind,
  centered = false,
  spec: override,
}: {
  kind: UploadKind;
  centered?: boolean;
  /** La ficha con otra medida ideal (la que sale de cómo se muestra, ver MediaUpload). */
  spec?: UploadSpec;
}) {
  const spec: UploadSpec = override ?? UPLOADS[kind];
  const d = describe(spec);
  return (
    <div className={cn('text-[11px] leading-snug', centered && 'text-center')}>
      <div className={cn('flex flex-wrap gap-1', centered && 'justify-center')}>
        {[d.formats, d.weight, d.ideal, d.count]
          .filter((t): t is string => !!t)
          .map((t) => (
            <span key={t} className="rounded bg-bg-muted px-1.5 py-0.5 font-medium text-fg-muted">
              {t}
            </span>
          ))}
      </div>
      {spec.tip && <p className="mt-1 text-fg-subtle">{spec.tip}</p>}
    </div>
  );
}

export interface UploadNote {
  tone: 'error' | 'advice';
  file: string;
  text: string;
}

/** Por qué no se subió un archivo, o qué conviene saber del que se subió. */
export function UploadNotes({
  notes,
  onDismiss,
  showFile = true,
}: {
  notes: UploadNote[];
  onDismiss?: () => void;
  showFile?: boolean;
}) {
  if (notes.length === 0) return null;
  const hasErrors = notes.some((n) => n.tone === 'error');
  return (
    <div
      role={hasErrors ? 'alert' : 'status'}
      className={cn(
        'relative space-y-1 rounded-md border px-2.5 py-2 text-xs',
        hasErrors ? 'border-danger/30 bg-danger/[0.06]' : 'border-warning/30 bg-warning/[0.07]',
      )}
    >
      {notes.map((n, i) => (
        <p key={i} className={cn('flex gap-1.5 pr-5', n.tone === 'error' ? 'text-danger' : 'text-fg')}>
          {n.tone === 'error' ? (
            <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
          )}
          <span>
            {showFile && <span className="font-semibold">{n.file}: </span>}
            {n.text}
          </span>
        </p>
      ))}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar aviso"
          className="absolute right-1.5 top-1.5 rounded p-0.5 text-fg-muted hover:bg-bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ el avance */

/** Barra de avance de una subida, con porcentaje real y botón para cancelar. */
export function UploadBar({
  name,
  fraction,
  onCancel,
  doneLabel,
  className,
}: {
  name: string;
  fraction: number;
  onCancel?: () => void;
  /** Lo que dice cuando ya subió y falta que el servidor responda (por ejemplo, "Leyendo la factura…"). */
  doneLabel?: string;
  className?: string;
}) {
  const pct = Math.round(fraction * 100);
  const sent = fraction >= 1;
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate font-medium text-fg">{name}</span>
        <span className="shrink-0 tabular-nums text-fg-muted">
          {sent ? (doneLabel ?? 'Procesando…') : `Subiendo… ${pct} %`}
        </span>
        {onCancel && !sent && (
          <button
            type="button"
            onClick={onCancel}
            aria-label={`Cancelar subida de ${name}`}
            className="shrink-0 rounded p-0.5 text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <ProgressTrack fraction={fraction} label={`Subiendo ${name}`} className="mt-1" />
    </div>
  );
}

export function ProgressTrack({
  fraction,
  label,
  className,
}: {
  fraction: number;
  label: string;
  className?: string;
}) {
  const pct = Math.round(fraction * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('h-1.5 overflow-hidden rounded-full bg-black/10', className)}
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary transition-[width] duration-200',
          fraction >= 1 && 'animate-pulse',
        )}
        style={{ width: `${Math.max(pct, 3)}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ la cola */

export interface PendingUpload {
  id: number;
  file: File;
  /** Vista previa local (blob:) mientras sube; null si no es imagen ni video. */
  preview: string | null;
  /** 0 a 1. */
  progress: number;
  /** Ya empezó a viajar (las demás esperan su turno). */
  started: boolean;
}

let nextId = 1;

const previewable = (file: File) => file.type.startsWith('image/') || file.type.startsWith('video/');

/**
 * Revisar y subir archivos de una ficha, de a uno y en orden (el orden de las
 * fotos importa). Lo que no sirve queda afuera con su motivo, sin frenar al
 * resto; lo que sirve sube con vista previa y avance.
 */
export function useUploadQueue<T>(
  kind: UploadKind,
  send: (file: File, progress: UploadProgress) => Promise<T>,
  /** La ficha con otra medida ideal: los avisos ("se va a recortar") usan esa. */
  override?: UploadSpec,
) {
  const spec: UploadSpec = override ?? UPLOADS[kind];
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [notes, setNotes] = useState<UploadNote[]>([]);
  const controllers = useRef(new Map<number, AbortController>());
  // Una elección nueva descarta los avisos de la anterior, aunque lleguen tarde.
  const generation = useRef(0);
  // El envío más reciente: lee el texto o la conversación de ese momento.
  const sendRef = useRef(send);
  useLayoutEffect(() => {
    sendRef.current = send;
  });

  useEffect(() => {
    const live = controllers.current;
    return () => live.forEach((c) => c.abort());
  }, []);

  const addNotes = (gen: number, added: UploadNote[]) => {
    if (added.length && gen === generation.current) setNotes((n) => [...n, ...added]);
  };

  /**
   * Revisa sin subir: devuelve los que sirven y anota el resto. `existing` es
   * cuántos hay ya, para el máximo de la ficha (un producto lleva hasta 10 fotos).
   */
  const screen = (files: File[], existing = 0): File[] => {
    const room = (spec.maxFiles ?? Number.POSITIVE_INFINITY) - existing;
    const gen = ++generation.current;
    const rejected: UploadNote[] = [];
    const accepted: File[] = [];
    for (const file of files) {
      const reason = rejectReason(spec, file);
      if (reason) rejected.push({ tone: 'error', file: file.name, text: reason });
      else if (accepted.length >= room)
        rejected.push({ tone: 'error', file: file.name, text: `No entra: el máximo es ${spec.maxFiles}.` });
      else accepted.push(file);
    }
    setNotes(rejected);
    for (const file of accepted)
      void readDimensions(file).then((dims) =>
        addNotes(
          gen,
          adviceFor(spec, file, dims).map((text) => ({ tone: 'advice' as const, file: file.name, text })),
        ),
      );
    return accepted;
  };

  /** Revisa y sube. `onDone` corre por cada archivo apenas termina el suyo. Devuelve cuántos subieron. */
  const run = async (
    files: File[],
    onDone: (result: T, file: File) => void,
    existing = 0,
  ): Promise<number> => {
    const gen = generation.current + 1;
    const items: PendingUpload[] = screen(files, existing + pending.length).map((file) => ({
      id: nextId++,
      file,
      preview: previewable(file) ? URL.createObjectURL(file) : null,
      progress: 0,
      started: false,
    }));
    if (items.length === 0) return 0;
    setPending((p) => [...p, ...items]);
    for (const item of items) controllers.current.set(item.id, new AbortController());

    let ok = 0;
    for (const item of items) {
      const controller = controllers.current.get(item.id)!;
      const update = (patch: Partial<PendingUpload>) =>
        setPending((p) => p.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
      try {
        if (controller.signal.aborted) continue; // se canceló mientras esperaba su turno
        update({ started: true });
        const result = await sendRef.current(item.file, {
          signal: controller.signal,
          onProgress: (fraction) => update({ progress: fraction }),
        });
        ok++;
        onDone(result, item.file);
      } catch (err) {
        if (!(err instanceof UploadAbortedError))
          addNotes(gen, [
            {
              tone: 'error',
              file: item.file.name,
              text: errMsg(err, 'No se pudo subir. Probá de nuevo en un rato.'),
            },
          ]);
      } finally {
        controllers.current.delete(item.id);
        setPending((p) => p.filter((x) => x.id !== item.id));
        if (item.preview) URL.revokeObjectURL(item.preview);
      }
    }
    return ok;
  };

  return {
    spec,
    pending,
    notes,
    busy: pending.length > 0,
    screen,
    run,
    cancel: (id: number) => controllers.current.get(id)?.abort(),
    dismissNotes: () => setNotes([]),
  };
}

/* ------------------------------------------------------------ imágenes que cargan */

/**
 * Una imagen con brillo de carga encima hasta que termina de bajar: la
 * recién subida, que el navegador todavía no tiene, no deja un hueco blanco.
 */
export function LoadingImg({ className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  // Cuál terminó de bajar: si cambia la imagen, vuelve el brillo hasta que llegue la nueva.
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const loaded = loadedSrc !== undefined && loadedSrc === props.src;
  return (
    <>
      <img
        {...props}
        alt={props.alt ?? ''}
        className={className}
        onLoad={(e) => {
          setLoadedSrc(props.src);
          props.onLoad?.(e);
        }}
      />
      {!loaded && <span aria-hidden className="upload-shimmer" />}
    </>
  );
}
