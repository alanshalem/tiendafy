import { useState, type ReactNode } from 'react';
import { GripVertical, ChevronUp, ChevronDown, ChevronRight, Eye, EyeOff, X, Plus } from 'lucide-react';
import { cn, useConfirm } from '@tiendafy/ui';
import { type ThemeConfig, type ThemeSection, type SectionType } from '@tiendafy/types';
import { useFlipList } from '../lib/useFlip';
import { Field, Check, TextInput, TextArea, Select, BackHeader } from './theme-editor-inputs';
import { ImageUploader, VideoUploader, MultiImageUploader } from './theme-editor-uploaders';
import { InfoBarEditor, ProductPicker, type InfoItem } from './theme-editor-pickers';
import { moveItem } from '../lib/arrays';

/** Cast defensivo: la data del theme puede venir sin el array (drafts viejos). */
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const sectionMeta: Record<string, string> = {
  'hero-video': 'Hero con video',
  carousel: 'Carrusel de imágenes',
  featured: 'Productos destacados',
  'promo-banners': 'Banners promocionales',
  institutional: 'Mensaje institucional',
  'category-banners': 'Banners de categorías',
  'new-products': 'Productos nuevos',
  'image-text': 'Módulo de imagen y texto',
  'sale-products': 'Productos en oferta',
  instagram: 'Instagram / Video',
  'info-bar': 'Información de envíos, pagos y compra',
  newsletter: 'Newsletter',
  testimonials: 'Testimonios de clientes',
  faq: 'Preguntas frecuentes',
  brands: 'Marcas que vendemos',
};

/** Data inicial sensata por tipo de sección (el merchant después la completa). */
function sectionData(type: SectionType): Record<string, unknown> {
  switch (type) {
    case 'carousel':
      return { images: [], fullHeightMobile: false };
    case 'featured':
      return { title: 'Destacados', carousel: true };
    case 'new-products':
      return { title: 'Recién llegados', carousel: true };
    case 'sale-products':
      return { title: 'Ofertas', carousel: true };
    case 'testimonials':
      return { title: 'Lo que dicen nuestros clientes', items: [{ quote: '', name: '' }] };
    case 'faq':
      return { title: 'Preguntas frecuentes', items: [{ question: '', answer: '' }] };
    case 'brands':
      return { title: 'Marcas que vendemos', images: [] };
    default:
      return {};
  }
}

/**
 * Plantillas curadas de página de inicio. Cada una es un arreglo ordenado de
 * tipos de sección; aplicarla reemplaza las secciones por esa estructura base
 * (el merchant la edita después). Misma idea que las combinaciones de fuentes/colores.
 */
const HOME_TEMPLATES: { name: string; description: string; sections: SectionType[] }[] = [
  {
    name: 'Lanzamiento',
    description: 'Hero con video, destacados y newsletter. Para presentar la marca con fuerza.',
    sections: ['hero-video', 'featured', 'info-bar', 'newsletter'],
  },
  {
    name: 'Catálogo grande',
    description: 'Carrusel, categorías y varias grillas. Ideal si tenés muchos productos.',
    sections: ['carousel', 'category-banners', 'featured', 'new-products', 'info-bar'],
  },
  {
    name: 'Marca / Editorial',
    description: 'Imagen + texto e institucional. Cuenta una historia antes de vender.',
    sections: ['carousel', 'image-text', 'institutional', 'featured', 'info-bar'],
  },
  {
    name: 'Minimal',
    description: 'Solo lo esencial: portada y destacados. Limpio y directo.',
    sections: ['carousel', 'featured'],
  },
  {
    name: 'Ofertas',
    description: 'Productos en oferta y banners promocionales al frente.',
    sections: ['carousel', 'sale-products', 'promo-banners', 'featured', 'info-bar'],
  },
];

/** Bloque-maqueta que representa visualmente una sección en el wireframe. */
function MiniBlock({ type }: { type: SectionType }) {
  const base = 'rounded-[3px] bg-fg/10';
  switch (type) {
    case 'hero-video':
    case 'carousel':
      return (
        <div className={`flex h-9 items-center justify-center ${base}`}>
          <span className="h-1.5 w-8 rounded bg-fg/25" />
        </div>
      );
    case 'featured':
    case 'new-products':
    case 'sale-products':
      return (
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-7 flex-1 ${base}`} />
          ))}
        </div>
      );
    case 'category-banners':
    case 'promo-banners':
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
    case 'institutional':
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
    case 'instagram':
      return <span className={`block h-8 ${base}`} />;
    case 'testimonials':
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
    case 'brands':
      return (
        <div className="flex h-5 items-center justify-around gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-2.5 w-8 rounded bg-fg/15" />
          ))}
        </div>
      );
    default:
      return <span className={`block h-5 ${base}`} />;
  }
}

/** Wireframe del layout de una plantilla: bloques apilados = preview sin aplicar. */
function TemplateWireframe({ sections }: { sections: SectionType[] }) {
  return (
    <div className="mt-2 space-y-1 rounded-md border border-border bg-bg-muted/50 p-2">
      {sections.map((s, i) => (
        <MiniBlock key={i} type={s} />
      ))}
    </div>
  );
}

/* ---- Panel "Página de inicio": lista de secciones (reordenar / ocultar / agregar / quitar) ---- */
export function HomePanel({
  theme,
  onBack,
  onOpenSection,
  updateTheme,
}: {
  theme: ThemeConfig;
  onBack: () => void;
  onOpenSection: (id: string) => void;
  updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void;
}) {
  const move = (id: string, dir: -1 | 1) =>
    updateTheme((t) => {
      const idx = t.sections.findIndex((s) => s.id === id);
      const target = idx + dir;
      if (target < 0 || target >= t.sections.length) return t;
      const next = [...t.sections];
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return { ...t, sections: next };
    });
  const toggle = (id: string) =>
    updateTheme((t) => ({
      ...t,
      sections: t.sections.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)),
    }));

  const reorder = (fromId: string, toId: string) =>
    updateTheme((t) => {
      const from = t.sections.findIndex((s) => s.id === fromId);
      const to = t.sections.findIndex((s) => s.id === toId);
      if (from < 0 || to < 0 || from === to) return t;
      return { ...t, sections: moveItem(t.sections, from, to) };
    });

  const remove = (id: string) =>
    updateTheme((t) => ({ ...t, sections: t.sections.filter((s) => s.id !== id) }));
  const addSection = (type: string) =>
    updateTheme((t) => ({
      ...t,
      sections: [
        ...t.sections,
        {
          id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
          type: type as ThemeSection['type'],
          visible: true,
          data: sectionData(type as SectionType),
        },
      ],
    }));

  const listRef = useFlipList<HTMLDivElement>(theme.sections.map((s) => s.id).join(','));
  const [dragId, setDragId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const confirm = useConfirm();

  const applyTemplate = async (tpl: (typeof HOME_TEMPLATES)[number]) => {
    if (theme.sections.length > 0) {
      const ok = await confirm({
        title: `Usar plantilla "${tpl.name}"`,
        message:
          'Reemplaza las secciones actuales del inicio por esta estructura. Podés editar cada una después.',
        confirmLabel: 'Usar plantilla',
      });
      if (!ok) return;
    }
    updateTheme((t) => ({
      ...t,
      sections: tpl.sections.map((type) => ({
        id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        visible: true,
        data: sectionData(type),
      })),
    }));
    setShowTemplates(false);
  };

  return (
    <div>
      <BackHeader title="Página de inicio" onBack={onBack} />

      {/* Plantillas curadas: arman una estructura base de secciones de un click. */}
      <div className="px-3 pt-3">
        {showTemplates ? (
          <div className="rounded-md border border-border bg-surface p-2">
            <div className="flex items-center justify-between px-1 py-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Elegí una plantilla
              </span>
              <button onClick={() => setShowTemplates(false)} aria-label="Cerrar">
                <X className="h-4 w-4 text-fg-subtle" />
              </button>
            </div>
            <div className="space-y-1.5">
              {HOME_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  onClick={() => applyTemplate(tpl)}
                  className="block w-full rounded-md border border-border p-2.5 text-left transition hover:border-primary/50 hover:bg-bg-muted"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-fg">{tpl.name}</span>
                    <span className="text-[0.7rem] text-fg-subtle">{tpl.sections.length} secciones</span>
                  </div>
                  <p className="mt-0.5 text-xs text-fg-muted">{tpl.description}</p>
                  <TemplateWireframe sections={tpl.sections} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowTemplates(true)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary/[0.08] py-2.5 text-sm font-semibold text-primary hover:bg-primary/[0.14]"
          >
            Usar una plantilla de inicio
          </button>
        )}
      </div>

      <p className="inline-flex flex-wrap items-center gap-1 px-4 pt-3 text-xs text-fg-muted">
        Arrastrá <GripVertical className="h-3.5 w-3.5" /> para reordenar. El ojo muestra/oculta cada sección.
      </p>
      <div className="p-3" ref={listRef}>
        {theme.sections.length === 0 && (
          <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-fg-muted">
            Tu página de inicio está vacía. Elegí una plantilla arriba o agregá secciones con el botón de
            abajo.
          </div>
        )}
        {theme.sections.map((s, i) => (
          <div
            key={s.id}
            data-flip-key={s.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', s.id);
              setDragId(s.id);
            }}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setDragId(null);
              reorder(e.dataTransfer.getData('text/plain'), s.id);
            }}
            className={cn(
              'mb-2 flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-2 transition-shadow',
              dragId === s.id ? 'opacity-50 shadow-lg' : 'shadow-none',
            )}
          >
            <span className="cursor-grab select-none text-fg-subtle active:cursor-grabbing" title="Arrastrar">
              <GripVertical className="h-4 w-4" />
            </span>
            <div className="flex flex-col text-fg-subtle">
              <button
                onClick={() => move(s.id, -1)}
                disabled={i === 0}
                aria-label="Subir"
                className="leading-none disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => move(s.id, 1)}
                disabled={i === theme.sections.length - 1}
                aria-label="Bajar"
                className="leading-none disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              onClick={() => onOpenSection(s.id)}
              className={cn('flex-1 text-left text-sm', !s.visible && 'text-fg-subtle line-through')}
            >
              {sectionMeta[s.type] ?? s.type}
            </button>
            <button onClick={() => toggle(s.id)} aria-label="Mostrar/ocultar">
              {s.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <button
              onClick={() => remove(s.id)}
              aria-label="Quitar sección"
              className="text-fg-subtle hover:text-danger"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={() => onOpenSection(s.id)}
              aria-label="Editar sección"
              className="text-fg-subtle"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="px-3 pb-4">
        {adding ? (
          <div className="rounded-md border border-border bg-surface p-1">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Elegí una sección
              </span>
              <button onClick={() => setAdding(false)} aria-label="Cerrar">
                <X className="h-4 w-4 text-fg-subtle" />
              </button>
            </div>
            {Object.entries(sectionMeta).map(([type, label]) => (
              <button
                key={type}
                onClick={() => {
                  addSection(type);
                  setAdding(false);
                }}
                className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-bg-muted"
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/40 py-2.5 text-sm font-medium text-primary hover:bg-primary/[0.05]"
          >
            <Plus className="h-4 w-4" /> Agregar sección
          </button>
        )}
      </div>
    </div>
  );
}

/* ---- Editores por tipo de sección (registry abajo): agregar un tipo = una entrada ---- */
interface SectionEditorProps {
  section: ThemeSection;
  d: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
  str: (k: string) => string;
}

function HeroVideoEditor({ set, str }: SectionEditorProps) {
  return (
    <>
      <p className="rounded-md bg-bg-muted p-2.5 text-xs text-fg-muted">
        Subí el mismo video en 2 formatos: <strong>WebM</strong> (más liviano, para Chrome/Android) y{' '}
        <strong>MP4</strong> (para iPhone/Safari). Ideal: 1920×1080, loop corto de 5–12s, sin audio, bien
        comprimido (&lt;5MB).
      </p>
      <Field label="Video WebM (recomendado)">
        <VideoUploader
          value={str('videoWebm')}
          onChange={(url) => set({ videoWebm: url })}
          accept="video/webm"
          label="Elegir video WebM"
        />
      </Field>
      <Field label="Video MP4 (compatibilidad)">
        <VideoUploader
          value={str('videoMp4')}
          onChange={(url) => set({ videoMp4: url })}
          accept="video/mp4"
          label="Elegir video MP4"
        />
      </Field>
      <Field
        label="Imagen de respaldo (poster)"
        hint="Se ve mientras carga el video y en conexiones lentas. Tamaño recomendado: 1920×1080px."
      >
        <ImageUploader value={str('poster')} onChange={(url) => set({ poster: url })} />
      </Field>
      <Field label="Título">
        <TextInput value={str('title')} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Subtítulo">
        <TextArea value={str('subtitle')} onChange={(v) => set({ subtitle: v })} />
      </Field>
      <Field label="Texto del botón">
        <TextInput
          value={str('buttonText')}
          onChange={(v) => set({ buttonText: v })}
          placeholder="Ver productos"
        />
      </Field>
      <Field label="Link del botón">
        <TextInput value={str('link')} onChange={(v) => set({ link: v })} placeholder="/productos" />
      </Field>
      <Field label="Alineación del texto">
        <Select
          value={str('align') || 'center'}
          onChange={(v) => set({ align: v })}
          options={[
            { value: 'left', label: 'Izquierda' },
            { value: 'center', label: 'Centro' },
          ]}
        />
      </Field>
      <Field label="Altura">
        <Select
          value={str('height') || 'large'}
          onChange={(v) => set({ height: v })}
          options={[
            { value: 'large', label: 'Grande' },
            { value: 'full', label: 'Pantalla completa' },
          ]}
        />
      </Field>
      <Field label="Oscurecer el fondo (para que se lea el texto)">
        <Select
          value={str('overlay') || 'medium'}
          onChange={(v) => set({ overlay: v })}
          options={[
            { value: 'none', label: 'Nada' },
            { value: 'light', label: 'Leve' },
            { value: 'medium', label: 'Medio' },
            { value: 'strong', label: 'Fuerte' },
          ]}
        />
      </Field>
    </>
  );
}

function CarouselEditor({ d, set }: SectionEditorProps) {
  return (
    <>
      <Field
        label="Imágenes del carrusel"
        hint="Tamaño recomendado: 1580×600px. Podés cargar varias; se pasan solas."
      >
        <MultiImageUploader images={arr<string>(d.images)} onChange={(images) => set({ images })} />
      </Field>
      <Check
        label="Extender al alto de la pantalla en celulares"
        checked={d.fullHeightMobile === true}
        onChange={(v) => set({ fullHeightMobile: v })}
      />
    </>
  );
}

function ProductsEditor({ section, d, set, str }: SectionEditorProps) {
  return (
    <>
      <Check
        label="Mostrar productos dentro de un carrusel"
        checked={d.carousel !== false}
        onChange={(v) => set({ carousel: v })}
      />
      <Field label="Título">
        <TextInput
          value={str('title')}
          onChange={(v) => set({ title: v })}
          placeholder={sectionMeta[section.type]}
        />
      </Field>
      <Field label="Productos a mostrar">
        <ProductPicker value={arr<string>(d.productIds)} onChange={(productIds) => set({ productIds })} />
      </Field>
    </>
  );
}

function InstitutionalEditor({ set, str }: SectionEditorProps) {
  return (
    <>
      <Field label="Título">
        <TextInput value={str('title')} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Descripción">
        <TextArea value={str('description')} onChange={(v) => set({ description: v })} />
      </Field>
    </>
  );
}

function ImageTextEditor({ set, str }: SectionEditorProps) {
  return (
    <>
      <Field label="Imagen" hint="Tamaño recomendado: 1270×300px">
        <ImageUploader value={str('image')} onChange={(url) => set({ image: url })} />
      </Field>
      <Field label="Título">
        <TextInput value={str('title')} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Descripción">
        <TextArea value={str('description')} onChange={(v) => set({ description: v })} />
      </Field>
      <Field label="Texto del botón">
        <TextInput value={str('buttonText')} onChange={(v) => set({ buttonText: v })} />
      </Field>
      <Field label="Link">
        <TextInput value={str('link')} onChange={(v) => set({ link: v })} />
      </Field>
      <Field label="Color del texto">
        <Select
          value={str('textColor') || 'dark'}
          onChange={(v) => set({ textColor: v })}
          options={[
            { value: 'dark', label: 'Oscuro' },
            { value: 'light', label: 'Claro' },
          ]}
        />
      </Field>
    </>
  );
}

function PromoBannersEditor({ d, set }: SectionEditorProps) {
  return (
    <>
      <Check
        label="Extender al ancho de la pantalla"
        checked={d.fullWidth === true}
        onChange={(v) => set({ fullWidth: v })}
      />
      <BannersEditor
        banners={arr<Banner>(d.banners)}
        onChange={(banners) => set({ banners })}
        withDescription
        imageHint="Tamaño recomendado: 620×235px"
        addLabel="Agregar promoción"
      />
    </>
  );
}

function CategoryBannersEditor({ d, set }: SectionEditorProps) {
  return (
    <>
      <Check
        label="Extender al ancho de la pantalla"
        checked={d.fullWidth === true}
        onChange={(v) => set({ fullWidth: v })}
      />
      <BannersEditor
        banners={arr<Banner>(d.banners)}
        onChange={(banners) => set({ banners })}
        imageHint="Tamaño recomendado: 620×620px"
        addLabel="Agregar categoría"
      />
    </>
  );
}

function NewsletterEditor({ set, str }: SectionEditorProps) {
  return (
    <>
      <Field label="Título">
        <TextInput value={str('title')} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Texto">
        <TextArea value={str('text')} onChange={(v) => set({ text: v })} />
      </Field>
      <Field label="Imagen (opcional)" hint="Tamaño recomendado: 280×320px">
        <ImageUploader value={str('image')} onChange={(url) => set({ image: url })} />
      </Field>
    </>
  );
}

function InstagramEditor({ set, str }: SectionEditorProps) {
  return (
    <Field
      label="Link de video o publicación"
      hint="YouTube, Vimeo, o un post/reel de Instagram (instagram.com/p/… o /reel/…). Si pegás una cuenta (instagram.com/usuario) se muestra un botón al perfil — Instagram no permite embeber el feed completo."
    >
      <TextInput
        value={str('video')}
        onChange={(v) => set({ video: v })}
        placeholder="https://instagram.com/p/…  ó  https://youtube.com/watch?v=…"
      />
    </Field>
  );
}

function InfoBarEditorPanel({ d, set }: SectionEditorProps) {
  return <InfoBarEditor items={arr<InfoItem>(d.items)} onChange={(items) => set({ items })} />;
}

interface TestimonialItem {
  quote?: string;
  name?: string;
  detail?: string;
  photo?: string;
}
function TestimonialsEditor({ d, set, str }: SectionEditorProps) {
  const items = arr<TestimonialItem>(d.items);
  const update = (i: number, patch: TestimonialItem) =>
    set({ items: items.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) });
  return (
    <>
      <Field label="Título">
        <TextInput
          value={str('title')}
          onChange={(v) => set({ title: v })}
          placeholder="Lo que dicen nuestros clientes"
        />
      </Field>
      {items.map((t, i) => (
        <div key={i} className="rounded-md border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Testimonio {i + 1}
            </span>
            <button
              onClick={() => set({ items: items.filter((_, idx) => idx !== i) })}
              className="text-xs text-danger hover:underline"
            >
              Quitar
            </button>
          </div>
          <div className="space-y-2">
            <TextArea value={t.quote ?? ''} onChange={(v) => update(i, { quote: v })} />
            <TextInput
              value={t.name ?? ''}
              onChange={(v) => update(i, { name: v })}
              placeholder="Nombre (ej. Laura G.)"
            />
            <TextInput
              value={t.detail ?? ''}
              onChange={(v) => update(i, { detail: v })}
              placeholder="Detalle (ej. Compró en CABA) — opcional"
            />
            <Field label="Foto (opcional)">
              <ImageUploader value={t.photo ?? ''} onChange={(url) => update(i, { photo: url })} />
            </Field>
          </div>
        </div>
      ))}
      <button
        onClick={() => set({ items: [...items, {}] })}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <Plus className="h-4 w-4" /> Agregar testimonio
      </button>
      <p className="text-xs text-fg-subtle">
        Consejo: usá opiniones reales (de WhatsApp o Instagram, con permiso). Cortas y concretas convencen
        más.
      </p>
    </>
  );
}

interface FaqItemData {
  question?: string;
  answer?: string;
}
function FaqEditor({ d, set, str }: SectionEditorProps) {
  const items = arr<FaqItemData>(d.items);
  const update = (i: number, patch: FaqItemData) =>
    set({ items: items.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });
  return (
    <>
      <Field label="Título">
        <TextInput
          value={str('title')}
          onChange={(v) => set({ title: v })}
          placeholder="Preguntas frecuentes"
        />
      </Field>
      {items.map((f, i) => (
        <div key={i} className="rounded-md border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Pregunta {i + 1}
            </span>
            <button
              onClick={() => set({ items: items.filter((_, idx) => idx !== i) })}
              className="text-xs text-danger hover:underline"
            >
              Quitar
            </button>
          </div>
          <div className="space-y-2">
            <TextInput
              value={f.question ?? ''}
              onChange={(v) => update(i, { question: v })}
              placeholder="¿Hacen envíos a todo el país?"
            />
            <TextArea value={f.answer ?? ''} onChange={(v) => update(i, { answer: v })} />
          </div>
        </div>
      ))}
      <button
        onClick={() => set({ items: [...items, {}] })}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <Plus className="h-4 w-4" /> Agregar pregunta
      </button>
      <p className="text-xs text-fg-subtle">
        Respondé acá lo que te preguntan siempre por WhatsApp: envíos, cambios, talles, medios de pago.
      </p>
    </>
  );
}

function BrandsEditor({ d, set, str }: SectionEditorProps) {
  return (
    <>
      <Field label="Título">
        <TextInput
          value={str('title')}
          onChange={(v) => set({ title: v })}
          placeholder="Marcas que vendemos"
        />
      </Field>
      <Field
        label="Logos de marcas"
        hint="PNG con fondo transparente, apaisados. Con 5 o más se deslizan solos en loop; con menos quedan fijos y centrados."
      >
        <MultiImageUploader images={arr<string>(d.images)} onChange={(images) => set({ images })} />
      </Field>
    </>
  );
}

/** Registro de editores por tipo de sección (OCP, espeja el del storefront). */
const SECTION_EDITORS: Record<SectionType, (p: SectionEditorProps) => ReactNode> = {
  'hero-video': HeroVideoEditor,
  carousel: CarouselEditor,
  featured: ProductsEditor,
  'new-products': ProductsEditor,
  'sale-products': ProductsEditor,
  institutional: InstitutionalEditor,
  'image-text': ImageTextEditor,
  'promo-banners': PromoBannersEditor,
  'category-banners': CategoryBannersEditor,
  newsletter: NewsletterEditor,
  instagram: InstagramEditor,
  'info-bar': InfoBarEditorPanel,
  testimonials: TestimonialsEditor,
  faq: FaqEditor,
  brands: BrandsEditor,
};

export function SectionPanel({
  section,
  onBack,
  onChange,
}: {
  section: ThemeSection;
  onBack: () => void;
  onChange: (data: Record<string, unknown>) => void;
}) {
  const d = section.data ?? {};
  const set = (patch: Record<string, unknown>) => onChange({ ...d, ...patch });
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const Editor = SECTION_EDITORS[section.type];

  return (
    <div>
      <BackHeader title={sectionMeta[section.type] ?? section.type} onBack={onBack} />
      <div className="space-y-4 p-4">{Editor && <Editor section={section} d={d} set={set} str={str} />}</div>
    </div>
  );
}

interface Banner {
  image?: string;
  title?: string;
  description?: string;
  link?: string;
  show?: boolean;
}
function BannersEditor({
  banners,
  onChange,
  withDescription,
  imageHint,
  addLabel = 'Agregar banner',
}: {
  banners: Banner[];
  onChange: (b: Banner[]) => void;
  withDescription?: boolean;
  imageHint?: string;
  addLabel?: string;
}) {
  const update = (i: number, patch: Banner) =>
    onChange(banners.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  return (
    <div className="space-y-4">
      {banners.map((b, i) => (
        <div key={i} className="rounded-md border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Banner {i + 1}
            </span>
            <button
              onClick={() => onChange(banners.filter((_, idx) => idx !== i))}
              className="text-xs text-danger hover:underline"
            >
              Quitar
            </button>
          </div>
          <Check label="Mostrar banner" checked={b.show !== false} onChange={(v) => update(i, { show: v })} />
          <div className="mt-2">
            <ImageUploader value={b.image ?? ''} onChange={(url) => update(i, { image: url })} />
          </div>
          {imageHint && <p className="mt-1 text-xs text-fg-subtle">{imageHint}</p>}
          <div className="mt-2 space-y-2">
            <TextInput value={b.title ?? ''} onChange={(v) => update(i, { title: v })} placeholder="Título" />
            {withDescription && (
              <TextInput
                value={b.description ?? ''}
                onChange={(v) => update(i, { description: v })}
                placeholder="Descripción"
              />
            )}
            <TextInput value={b.link ?? ''} onChange={(v) => update(i, { link: v })} placeholder="Link" />
          </div>
        </div>
      ))}
      <button
        onClick={() => onChange([...banners, { show: true }])}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <Plus className="h-4 w-4" /> {addLabel}
      </button>
    </div>
  );
}
