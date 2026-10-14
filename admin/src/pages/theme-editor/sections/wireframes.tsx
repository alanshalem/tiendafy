import { SECTION_REGISTRY, type SectionType, type SectionWireframe } from '@tiendafy/types';

/**
 * Maqueta mínima de una sección (bloques grises): la usan las plantillas y el
 * menú de agregar. Qué maqueta lleva cada tipo lo dice el registro
 * compartido (`wireframe`); una maqueta nueva = un caso acá.
 */
export function MiniBlock({ wireframe }: { wireframe: SectionWireframe }) {
  const base = 'rounded-[3px] bg-fg/10';
  switch (wireframe) {
    case 'hero':
      return (
        <div className={`flex h-9 items-center justify-center ${base}`}>
          <span className="h-1.5 w-8 rounded bg-fg/25" />
        </div>
      );
    case 'products':
      return (
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-7 flex-1 ${base}`} />
          ))}
        </div>
      );
    case 'banners':
      return (
        <div className="flex gap-1">
          {[0, 1].map((i) => (
            <span key={i} className={`h-6 flex-1 ${base}`} />
          ))}
        </div>
      );
    case 'image-text':
      return (
        <div className="flex gap-1">
          <span className={`h-8 w-1/2 ${base}`} />
          <div className="flex w-1/2 flex-col justify-center gap-1">
            <span className="h-1.5 w-full rounded bg-fg/20" />
            <span className="h-1.5 w-2/3 rounded bg-fg/15" />
          </div>
        </div>
      );
    case 'text':
      return (
        <div className="flex h-7 flex-col items-center justify-center gap-1">
          <span className="h-1.5 w-12 rounded bg-fg/20" />
          <span className="h-1.5 w-20 rounded bg-fg/15" />
        </div>
      );
    case 'info-bar':
      return (
        <div className={`flex h-3.5 items-center justify-around ${base}`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-fg/30" />
          ))}
        </div>
      );
    case 'newsletter':
      return (
        <div className={`flex h-7 items-center justify-center gap-1.5 ${base}`}>
          <span className="h-1.5 w-10 rounded bg-fg/20" />
          <span className="h-3 w-6 rounded bg-primary/40" />
        </div>
      );
    case 'video':
      return <span className={`block h-8 ${base}`} />;
    case 'cards':
      return (
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`flex h-8 flex-1 flex-col justify-center gap-1 px-1 ${base}`}>
              <span className="h-1 w-full rounded bg-fg/20" />
              <span className="h-1 w-2/3 rounded bg-fg/15" />
            </div>
          ))}
        </div>
      );
    case 'faq':
      return (
        <div className="space-y-1">
          {[0, 1].map((i) => (
            <div key={i} className={`flex h-3.5 items-center justify-between px-1.5 ${base}`}>
              <span className="h-1 w-16 rounded bg-fg/25" />
              <span className="h-1 w-1.5 rounded bg-fg/25" />
            </div>
          ))}
        </div>
      );
    case 'logos':
      return (
        <div className="flex h-5 items-center justify-around gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-2.5 w-8 rounded bg-fg/15" />
          ))}
        </div>
      );
    case 'product-feature':
      return (
        <div className="flex gap-1.5">
          <span className={`h-9 w-9 shrink-0 ${base}`} />
          <div className="flex flex-1 flex-col justify-center gap-1">
            <span className="h-1.5 w-full rounded bg-fg/20" />
            <span className="h-1.5 w-1/2 rounded bg-fg/15" />
            <span className="h-2.5 w-8 rounded bg-primary/40" />
          </div>
        </div>
      );
    case 'categories':
      return (
        <div className="flex justify-around gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <span className="h-5 w-5 rounded-full bg-fg/10" />
              <span className="h-1 w-4 rounded bg-fg/20" />
            </div>
          ))}
        </div>
      );
    case 'popup':
      return (
        <div className={`flex h-9 items-center justify-center ${base}`}>
          <div className="flex h-7 w-12 flex-col items-center justify-center gap-1 rounded-[3px] bg-bg shadow-sm">
            <span className="h-1 w-7 rounded bg-fg/25" />
            <span className="h-2 w-5 rounded bg-primary/40" />
          </div>
        </div>
      );
    case 'countdown':
      return (
        <div className="space-y-1">
          <div className="flex justify-center gap-0.5">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-2.5 w-3 rounded-sm bg-primary/40" />
            ))}
          </div>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-5 flex-1 ${base}`} />
            ))}
          </div>
        </div>
      );
  }
}

/** Wireframe del layout de una plantilla: bloques apilados = preview sin aplicar. */
export function TemplateWireframe({ sections }: { sections: readonly SectionType[] }) {
  return (
    <div className="mt-2 space-y-1 rounded-md border border-border bg-bg-muted/50 p-2" aria-hidden>
      {sections.map((s, i) => (
        <MiniBlock key={i} wireframe={SECTION_REGISTRY[s].wireframe} />
      ))}
    </div>
  );
}
