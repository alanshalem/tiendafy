import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Vista previa de un email escalada para que los 600px del layout estándar
 * entren COMPLETOS a lo ancho del contenedor (sin corte a la derecha ni
 * scroll horizontal). El alto restante scrollea dentro del iframe: un solo
 * scroll, el del email.
 */
export function EmailPreview({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / 600));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="h-full w-full overflow-hidden bg-[#f4f4f5]">
      <iframe
        title="Vista previa del email"
        sandbox=""
        srcDoc={html}
        style={{
          width: 600,
          height: `${100 / scale}%`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          border: 0,
        }}
      />
    </div>
  );
}
