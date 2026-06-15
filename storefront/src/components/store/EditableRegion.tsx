'use client';

import { useContext, useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { PreviewContext } from './preview';

/**
 * En el preview del editor, resalta la región al pasar el mouse y muestra
 * "Editar"; al hacer click avisa al editor (postMessage) para que abra el
 * panel correspondiente. Fuera del preview es un passthrough (no agrega DOM).
 *
 * `onClickCapture` intercepta el click ANTES de los hijos → abre el editor y
 * evita que links/botones internos naveguen mientras se está diseñando.
 */
export function EditableRegion({
  target,
  id,
  label,
  children,
}: {
  target: 'section' | 'footer';
  id?: string;
  label?: string;
  children: ReactNode;
}) {
  const preview = useContext(PreviewContext);
  const [hover, setHover] = useState(false);
  if (!preview) return <>{children}</>;

  const open = () => window.parent?.postMessage({ type: 'tiendafy:edit-section', target, sectionId: id }, '*');

  return (
    <div
      className="relative cursor-pointer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); open(); }}
    >
      {children}
      {hover && (
        <div className="pointer-events-none absolute inset-0 z-40 ring-2 ring-inset ring-[rgb(var(--color-primary))]">
          <span
            className="absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-primary-fg shadow-lg"
            style={{ background: 'rgb(var(--color-primary))' }}
          >
            <Pencil className="h-3.5 w-3.5" /> Editar{label ? ` ${label}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
