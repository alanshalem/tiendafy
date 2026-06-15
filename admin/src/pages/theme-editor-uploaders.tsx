import { useState } from 'react';
import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react';
import { useToast } from '@tiendafy/ui';
import { api, ApiRequestError } from '../lib/api';

/* Uploaders del editor de diseño (imagen / video / multi-imagen del carrusel). */

export function ImageUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  return (
    <div>
      {value ? (
        <div className="relative">
          <img src={value} alt="" className="h-32 w-full rounded-md border border-border object-cover" />
          <button onClick={() => onChange('')} aria-label="Quitar imagen" className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <label className="flex h-24 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-primary/40 text-primary hover:bg-primary/[0.05]">
          <span className="text-xl">{uploading ? '…' : <Plus className="h-6 w-6" />}</span>
          <span className="text-xs font-semibold">Elegir imagen</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" disabled={uploading} onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
              const { url } = await api.upload<{ url: string }>('/api/v1/media', file);
              onChange(url);
            } catch (err) {
              toast(err instanceof ApiRequestError ? err.message : 'Error subiendo imagen. Usá JPG, PNG, WebP o AVIF (hasta 5MB).', { variant: 'error' });
            } finally {
              setUploading(false);
              e.target.value = '';
            }
          }} />
        </label>
      )}
    </div>
  );
}

export function VideoUploader({ value, onChange, accept, label }: { value: string; onChange: (url: string) => void; accept: string; label: string }) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  return (
    <div>
      {value ? (
        <div className="relative">
          <video src={value} className="h-32 w-full rounded-md border border-border object-cover" muted playsInline loop autoPlay />
          <button onClick={() => onChange('')} aria-label="Quitar video" className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <label className="flex h-24 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-primary/40 text-primary hover:bg-primary/[0.05]">
          <span className="text-xl">{uploading ? '…' : <Plus className="h-6 w-6" />}</span>
          <span className="text-xs font-semibold">{label}</span>
          <input type="file" accept={accept} className="hidden" disabled={uploading} onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
              const { url } = await api.upload<{ url: string }>('/api/v1/media', file);
              onChange(url);
            } catch (err) {
              toast(err instanceof ApiRequestError ? err.message : 'Error subiendo el video. Usá MP4 o WebM (hasta 20MB).', { variant: 'error' });
            } finally {
              setUploading(false);
              e.target.value = '';
            }
          }} />
        </label>
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
export function MultiImageUploader({ images, onChange }: { images: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-3">
      {images.map((img, i) => (
        <div key={i} className="relative">
          <img src={img} alt="" className="h-28 w-full rounded-md border border-border object-cover" />
          <div className="absolute right-1.5 top-1.5 flex gap-1">
            <button onClick={() => i > 0 && onChange(swap(images, i, i - 1))} disabled={i === 0} aria-label="Subir" className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
            <button onClick={() => i < images.length - 1 && onChange(swap(images, i, i + 1))} disabled={i === images.length - 1} aria-label="Bajar" className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
            <button onClick={() => onChange(images.filter((_, idx) => idx !== i))} aria-label="Quitar" className="flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      ))}
      <ImageUploader value="" onChange={(url) => url && onChange([...images, url])} />
    </div>
  );
}
