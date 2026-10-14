import { lazy, Suspense, type ComponentProps } from 'react';
import { Bone } from './Skeleton';

// Tiptap y sus extensiones pesan ~400 KB (130 KB comprimido): más que casi
// cualquier pantalla del panel. Importado de forma estática, viaja con la
// pantalla que lo usa aunque el editor esté dentro de un modal que nunca se
// abre. Así se baja recién cuando se dibuja.
const RichTextEditor = lazy(() => import('./RichTextEditor').then((m) => ({ default: m.RichTextEditor })));

/**
 * El editor de texto enriquecido, cargado a demanda. Mismas props que
 * RichTextEditor: alcanza con cambiar el import. Mientras llega, ocupa el
 * mismo lugar (sin saltos) y se anuncia como "Cargando el editor…".
 */
export function LazyRichTextEditor(props: ComponentProps<typeof RichTextEditor>) {
  return (
    <Suspense
      fallback={
        <div role="status" aria-label="Cargando el editor…" className="rounded-md border border-border p-3">
          <Bone className="mb-3 h-7 w-2/3" />
          <Bone className="h-40 w-full" />
        </div>
      }
    >
      <RichTextEditor {...props} />
    </Suspense>
  );
}
