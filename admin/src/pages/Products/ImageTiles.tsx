import { Plus, X } from 'lucide-react';

/**
 * Las dos piezas de la grilla de fotos de un producto: la miniatura con su
 * botón de quitar y el recuadro punteado para agregar. Estaban copiadas entre
 * "Nuevo producto" (archivos todavía locales) y "Editar producto" (imágenes ya
 * subidas): mismas clases, mismos tamaños, y cada retoque visual había que
 * hacerlo dos veces para que las dos pantallas no se vieran distintas.
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
      <img src={src} alt="" className="h-24 w-24 rounded-md border border-border object-cover" />
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Quitar imagen"
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

export function AddImagesTile({
  onFiles,
  busy = false,
}: {
  onFiles: (files: File[]) => void;
  busy?: boolean;
}) {
  return (
    <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-primary/40 text-primary hover:bg-primary/[0.05]">
      <Plus className="h-5 w-5" />
      <span className="text-[0.65rem] font-semibold">{busy ? 'Subiendo…' : 'Agregar'}</span>
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
        }}
      />
    </label>
  );
}
