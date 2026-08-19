import { useState } from 'react';
import { Plus, X, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { useToast, cn } from '@tiendafy/ui';
import { api, errMsg } from '../lib/api';

/* Uploaders del editor de diseño (imagen / video / multi-imagen del carrusel). */

/**
 * Zona de "elegir archivo" con su subida: el trámite (spinner, POST a /media,
 * error legible, reset del input) es idéntico para imagen y para video, y
 * estaba escrito dos veces. Cada uploader pone su preview y sus textos.
 */
function UploadDropzone({
  accept,
  idleLabel,
  busyLabel,
  errorMsg,
  onUploaded,
}: {
  accept: string;
  idleLabel: string;
  busyLabel: string;
  errorMsg: string;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  return (
    <label
      className={cn(
        'flex h-24 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-primary/40 text-primary',
        uploading ? 'cursor-wait opacity-70' : 'cursor-pointer hover:bg-primary/[0.05]',
      )}
    >
      {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Plus className="h-6 w-6" />}
      <span className="text-xs font-semibold">{uploading ? busyLabel : idleLabel}</span>
      <input
        type="file"
        accept={accept}
        className="hidden"
        disabled={uploading}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setUploading(true);
          try {
            const { url } = await api.upload<{ url: string }>('/api/v1/media', file);
            onUploaded(url);
          } catch (err) {
            toast(errMsg(err, errorMsg), { variant: 'error' });
          } finally {
            setUploading(false);
            e.target.value = '';
          }
        }}
      />
    </label>
  );
}

export function ImageUploader({
  value,
  onChange,
  allowSvg,
}: {
  value: string;
  onChange: (url: string) => void;
  allowSvg?: boolean;
}) {
  // SVG solo para logo/favicon (vectorial, nítido). NO para og:image — las redes
  // sociales no renderizan SVG al compartir.
  const accept = allowSvg
    ? 'image/jpeg,image/png,image/webp,image/avif,image/svg+xml'
    : 'image/jpeg,image/png,image/webp,image/avif';
  const errorMsg = allowSvg
    ? 'Error subiendo imagen. Usá JPG, PNG, WebP, AVIF o SVG (hasta 5MB).'
    : 'Error subiendo imagen. Usá JPG, PNG, WebP o AVIF (hasta 5MB).';
  return (
    <div>
      {value ? (
        <div
          className="relative rounded-md border border-border p-2"
          // Checkerboard de transparencia: logos blancos o con alpha se ven igual
          // en light y dark (no se "pierden" sobre fondo blanco).
          style={{
            backgroundColor: '#ffffff',
            backgroundImage:
              'linear-gradient(45deg,#dfe1e5 25%,transparent 25%),linear-gradient(-45deg,#dfe1e5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#dfe1e5 75%),linear-gradient(-45deg,transparent 75%,#dfe1e5 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
          }}
        >
          <img src={value} alt="" className="h-28 w-full rounded object-contain" />
          <button
            onClick={() => onChange('')}
            aria-label="Quitar imagen"
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <UploadDropzone
          accept={accept}
          idleLabel="Elegir imagen"
          busyLabel="Subiendo imagen…"
          errorMsg={errorMsg}
          onUploaded={onChange}
        />
      )}
    </div>
  );
}

export function VideoUploader({
  value,
  onChange,
  accept,
  label,
}: {
  value: string;
  onChange: (url: string) => void;
  accept: string;
  label: string;
}) {
  return (
    <div>
      {value ? (
        <div className="relative">
          <video
            src={value}
            className="h-32 w-full rounded-md border border-border object-cover"
            muted
            playsInline
            loop
            autoPlay
          />
          <button
            onClick={() => onChange('')}
            aria-label="Quitar video"
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <UploadDropzone
          accept={accept}
          idleLabel={label}
          busyLabel="Subiendo video…"
          errorMsg="Error subiendo el video. Usá MP4 o WebM (hasta 20MB)."
          onUploaded={onChange}
        />
      )}
    </div>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const next = [...arr];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Sube/ordena/quita varias imágenes (carrusel). */
export function MultiImageUploader({
  images,
  onChange,
}: {
  images: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="space-y-3">
      {images.map((img, i) => (
        <div key={i} className="relative">
          <img src={img} alt="" className="h-28 w-full rounded-md border border-border object-cover" />
          <div className="absolute right-1.5 top-1.5 flex gap-1">
            <button
              onClick={() => i > 0 && onChange(swap(images, i, i - 1))}
              disabled={i === 0}
              aria-label="Subir"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => i < images.length - 1 && onChange(swap(images, i, i + 1))}
              disabled={i === images.length - 1}
              aria-label="Bajar"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onChange(images.filter((_, idx) => idx !== i))}
              aria-label="Quitar"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      <ImageUploader value="" onChange={(url) => url && onChange([...images, url])} />
    </div>
  );
}
