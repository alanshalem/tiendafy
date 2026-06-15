import { useEffect, useState, type ReactNode } from 'react';
import { GripVertical, ChevronUp, ChevronDown, ChevronRight, Eye, EyeOff, X, Plus } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { type ThemeConfig, type ThemeSection, type SectionType } from '@tiendafy/types';
import { useFlipList } from '../lib/useFlip';
import { api } from '../lib/api';
import { Field, Check, TextInput, TextArea, Select, BackHeader, INPUT_BASE } from './theme-editor-inputs';
import { ImageUploader, VideoUploader, MultiImageUploader } from './theme-editor-uploaders';

export const sectionMeta: Record<string, string> = {
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
};

/* ---- Panel "Página de inicio": lista de secciones (reordenar / ocultar / agregar / quitar) ---- */
export function HomePanel({ theme, onBack, onOpenSection, updateTheme }: { theme: ThemeConfig; onBack: () => void; onOpenSection: (id: string) => void; updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void }) {
  const move = (id: string, dir: -1 | 1) =>
    updateTheme((t) => {
      const idx = t.sections.findIndex((s) => s.id === id);
      const target = idx + dir;
      if (target < 0 || target >= t.sections.length) return t;
      const next = [...t.sections];
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return { ...t, sections: next };
    });
  const toggle = (id: string) => updateTheme((t) => ({ ...t, sections: t.sections.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)) }));

  const reorder = (fromId: string, toId: string) =>
    updateTheme((t) => {
      const from = t.sections.findIndex((s) => s.id === fromId);
      const to = t.sections.findIndex((s) => s.id === toId);
      if (from < 0 || to < 0 || from === to) return t;
      const next = [...t.sections];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return { ...t, sections: next };
    });

  const remove = (id: string) => updateTheme((t) => ({ ...t, sections: t.sections.filter((s) => s.id !== id) }));
  const addSection = (type: string) =>
    updateTheme((t) => ({ ...t, sections: [...t.sections, { id: `${type}-${Math.random().toString(36).slice(2, 8)}`, type: type as ThemeSection['type'], visible: true, data: {} }] }));

  const listRef = useFlipList<HTMLDivElement>(theme.sections.map((s) => s.id).join(','));
  const [dragId, setDragId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <BackHeader title="Página de inicio" onBack={onBack} />
      <p className="inline-flex flex-wrap items-center gap-1 px-4 pt-3 text-xs text-fg-muted">Arrastrá <GripVertical className="h-3.5 w-3.5" /> para reordenar. El ojo muestra/oculta cada sección.</p>
      <div className="p-3" ref={listRef}>
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
            <span className="cursor-grab select-none text-fg-subtle active:cursor-grabbing" title="Arrastrar"><GripVertical className="h-4 w-4" /></span>
            <div className="flex flex-col text-fg-subtle">
              <button onClick={() => move(s.id, -1)} disabled={i === 0} aria-label="Subir" className="leading-none disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
              <button onClick={() => move(s.id, 1)} disabled={i === theme.sections.length - 1} aria-label="Bajar" className="leading-none disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
            </div>
            <button onClick={() => onOpenSection(s.id)} className={cn('flex-1 text-left text-sm', !s.visible && 'text-fg-subtle line-through')}>
              {sectionMeta[s.type] ?? s.type}
            </button>
            <button onClick={() => toggle(s.id)} aria-label="Mostrar/ocultar">
              {s.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <button onClick={() => remove(s.id)} aria-label="Quitar sección" className="text-fg-subtle hover:text-danger"><X className="h-4 w-4" /></button>
            <button onClick={() => onOpenSection(s.id)} className="text-fg-subtle"><ChevronRight className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      <div className="px-3 pb-4">
        {adding ? (
          <div className="rounded-md border border-border bg-surface p-1">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Elegí una sección</span>
              <button onClick={() => setAdding(false)} aria-label="Cerrar"><X className="h-4 w-4 text-fg-subtle" /></button>
            </div>
            {Object.entries(sectionMeta).map(([type, label]) => (
              <button key={type} onClick={() => { addSection(type); setAdding(false); }} className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-bg-muted">
                {label}
              </button>
            ))}
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/40 py-2.5 text-sm font-medium text-primary hover:bg-primary/[0.05]">
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
        Subí el mismo video en 2 formatos: <strong>WebM</strong> (más liviano, para Chrome/Android) y <strong>MP4</strong> (para iPhone/Safari). Ideal: 1920×1080, loop corto de 5–12s, sin audio, bien comprimido (&lt;5MB).
      </p>
      <Field label="Video WebM (recomendado)"><VideoUploader value={str('videoWebm')} onChange={(url) => set({ videoWebm: url })} accept="video/webm" label="Elegir video WebM" /></Field>
      <Field label="Video MP4 (compatibilidad)"><VideoUploader value={str('videoMp4')} onChange={(url) => set({ videoMp4: url })} accept="video/mp4" label="Elegir video MP4" /></Field>
      <Field label="Imagen de respaldo (poster)" hint="Se ve mientras carga el video y en conexiones lentas. Tamaño recomendado: 1920×1080px."><ImageUploader value={str('poster')} onChange={(url) => set({ poster: url })} /></Field>
      <Field label="Título"><TextInput value={str('title')} onChange={(v) => set({ title: v })} /></Field>
      <Field label="Subtítulo"><TextArea value={str('subtitle')} onChange={(v) => set({ subtitle: v })} /></Field>
      <Field label="Texto del botón"><TextInput value={str('buttonText')} onChange={(v) => set({ buttonText: v })} placeholder="Ver productos" /></Field>
      <Field label="Link del botón"><TextInput value={str('link')} onChange={(v) => set({ link: v })} placeholder="/productos" /></Field>
      <Field label="Alineación del texto">
        <Select value={str('align') || 'center'} onChange={(v) => set({ align: v })} options={[{ value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centro' }]} />
      </Field>
      <Field label="Altura">
        <Select value={str('height') || 'large'} onChange={(v) => set({ height: v })} options={[{ value: 'large', label: 'Grande' }, { value: 'full', label: 'Pantalla completa' }]} />
      </Field>
      <Field label="Oscurecer el fondo (para que se lea el texto)">
        <Select value={str('overlay') || 'medium'} onChange={(v) => set({ overlay: v })} options={[{ value: 'none', label: 'Nada' }, { value: 'light', label: 'Leve' }, { value: 'medium', label: 'Medio' }, { value: 'strong', label: 'Fuerte' }]} />
      </Field>
    </>
  );
}

function CarouselEditor({ d, set }: SectionEditorProps) {
  return (
    <>
      <Field label="Imágenes del carrusel" hint="Tamaño recomendado: 1580×600px. Podés cargar varias; se pasan solas.">
        <MultiImageUploader images={(Array.isArray(d.images) ? d.images : []) as string[]} onChange={(images) => set({ images })} />
      </Field>
      <Check label="Extender al alto de la pantalla en celulares" checked={d.fullHeightMobile === true} onChange={(v) => set({ fullHeightMobile: v })} />
    </>
  );
}

function ProductsEditor({ section, d, set, str }: SectionEditorProps) {
  return (
    <>
      <Check label="Mostrar productos dentro de un carrusel" checked={d.carousel !== false} onChange={(v) => set({ carousel: v })} />
      <Field label="Título"><TextInput value={str('title')} onChange={(v) => set({ title: v })} placeholder={sectionMeta[section.type]} /></Field>
      <Field label="Productos a mostrar">
        <ProductPicker value={(Array.isArray(d.productIds) ? d.productIds : []) as string[]} onChange={(productIds) => set({ productIds })} />
      </Field>
    </>
  );
}

function InstitutionalEditor({ set, str }: SectionEditorProps) {
  return (
    <>
      <Field label="Título"><TextInput value={str('title')} onChange={(v) => set({ title: v })} /></Field>
      <Field label="Descripción"><TextArea value={str('description')} onChange={(v) => set({ description: v })} /></Field>
    </>
  );
}

function ImageTextEditor({ set, str }: SectionEditorProps) {
  return (
    <>
      <Field label="Imagen" hint="Tamaño recomendado: 1270×300px"><ImageUploader value={str('image')} onChange={(url) => set({ image: url })} /></Field>
      <Field label="Título"><TextInput value={str('title')} onChange={(v) => set({ title: v })} /></Field>
      <Field label="Descripción"><TextArea value={str('description')} onChange={(v) => set({ description: v })} /></Field>
      <Field label="Texto del botón"><TextInput value={str('buttonText')} onChange={(v) => set({ buttonText: v })} /></Field>
      <Field label="Link"><TextInput value={str('link')} onChange={(v) => set({ link: v })} /></Field>
      <Field label="Color del texto">
        <Select value={str('textColor') || 'dark'} onChange={(v) => set({ textColor: v })} options={[{ value: 'dark', label: 'Oscuro' }, { value: 'light', label: 'Claro' }]} />
      </Field>
    </>
  );
}

function PromoBannersEditor({ d, set }: SectionEditorProps) {
  return (
    <>
      <Check label="Extender al ancho de la pantalla" checked={d.fullWidth === true} onChange={(v) => set({ fullWidth: v })} />
      <BannersEditor banners={(Array.isArray(d.banners) ? d.banners : []) as Banner[]} onChange={(banners) => set({ banners })} withDescription imageHint="Tamaño recomendado: 620×235px" addLabel="Agregar promoción" />
    </>
  );
}

function CategoryBannersEditor({ d, set }: SectionEditorProps) {
  return (
    <>
      <Check label="Extender al ancho de la pantalla" checked={d.fullWidth === true} onChange={(v) => set({ fullWidth: v })} />
      <BannersEditor banners={(Array.isArray(d.banners) ? d.banners : []) as Banner[]} onChange={(banners) => set({ banners })} imageHint="Tamaño recomendado: 620×620px" addLabel="Agregar categoría" />
    </>
  );
}

function NewsletterEditor({ set, str }: SectionEditorProps) {
  return (
    <>
      <Field label="Título"><TextInput value={str('title')} onChange={(v) => set({ title: v })} /></Field>
      <Field label="Texto"><TextArea value={str('text')} onChange={(v) => set({ text: v })} /></Field>
      <Field label="Imagen (opcional)" hint="Tamaño recomendado: 280×320px"><ImageUploader value={str('image')} onChange={(url) => set({ image: url })} /></Field>
    </>
  );
}

function InstagramEditor({ set, str }: SectionEditorProps) {
  return (
    <Field label="Link de video (YouTube o Vimeo)"><TextInput value={str('video')} onChange={(v) => set({ video: v })} placeholder="https://youtube.com/watch?v=..." /></Field>
  );
}

function InfoBarEditorPanel({ d, set }: SectionEditorProps) {
  return <InfoBarEditor items={(Array.isArray(d.items) ? d.items : []) as InfoItem[]} onChange={(items) => set({ items })} />;
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
};

export function SectionPanel({ section, onBack, onChange }: { section: ThemeSection; onBack: () => void; onChange: (data: Record<string, unknown>) => void }) {
  const d = section.data ?? {};
  const set = (patch: Record<string, unknown>) => onChange({ ...d, ...patch });
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const Editor = SECTION_EDITORS[section.type];

  return (
    <div>
      <BackHeader title={sectionMeta[section.type] ?? section.type} onBack={onBack} />
      <div className="space-y-4 p-4">
        {Editor && <Editor section={section} d={d} set={set} str={str} />}
      </div>
    </div>
  );
}

interface Banner { image?: string; title?: string; description?: string; link?: string; show?: boolean }
function BannersEditor({ banners, onChange, withDescription, imageHint, addLabel = 'Agregar banner' }: { banners: Banner[]; onChange: (b: Banner[]) => void; withDescription?: boolean; imageHint?: string; addLabel?: string }) {
  const update = (i: number, patch: Banner) => onChange(banners.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  return (
    <div className="space-y-4">
      {banners.map((b, i) => (
        <div key={i} className="rounded-md border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Banner {i + 1}</span>
            <button onClick={() => onChange(banners.filter((_, idx) => idx !== i))} className="text-xs text-danger hover:underline">Quitar</button>
          </div>
          <Check label="Mostrar banner" checked={b.show !== false} onChange={(v) => update(i, { show: v })} />
          <div className="mt-2"><ImageUploader value={b.image ?? ''} onChange={(url) => update(i, { image: url })} /></div>
          {imageHint && <p className="mt-1 text-xs text-fg-subtle">{imageHint}</p>}
          <div className="mt-2 space-y-2">
            <TextInput value={b.title ?? ''} onChange={(v) => update(i, { title: v })} placeholder="Título" />
            {withDescription && <TextInput value={b.description ?? ''} onChange={(v) => update(i, { description: v })} placeholder="Descripción" />}
            <TextInput value={b.link ?? ''} onChange={(v) => update(i, { link: v })} placeholder="Link" />
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...banners, { show: true }])} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><Plus className="h-4 w-4" /> {addLabel}</button>
    </div>
  );
}

interface PickProduct { id: string; name: string; image: string | null }
/**
 * Selector de productos para Destacados/Nuevos/Ofertas. Los resultados sólo
 * aparecen al buscar (no se listan todos). Los elegidos se reordenan por
 * drag-and-drop (el orden es el que se muestra en la tienda).
 */
function ProductPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [all, setAll] = useState<PickProduct[] | null>(null);
  const [q, setQ] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  useEffect(() => {
    api.get<{ items: { id: string; name: string; images: { url: string }[] }[] }>('/api/v1/products?limit=100')
      .then((r) => setAll(r.items.map((p) => ({ id: p.id, name: p.name, image: p.images[0]?.url ?? null }))))
      .catch(() => setAll([]));
  }, []);
  const byId = (id: string) => all?.find((p) => p.id === id);
  const add = (id: string) => { if (!value.includes(id)) onChange([...value, id]); };
  const removeId = (id: string) => onChange(value.filter((x) => x !== id));
  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const from = value.indexOf(fromId);
    const to = value.indexOf(toId);
    if (from < 0 || to < 0) return;
    const next = [...value];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange(next);
  };

  const query = q.trim().toLowerCase();
  const results = query
    ? (all ?? []).filter((p) => !value.includes(p.id) && p.name.toLowerCase().includes(query)).slice(0, 8)
    : [];

  return (
    <div>
      {/* Elegidos: reordenables por drag */}
      {value.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {value.map((id) => {
            const p = byId(id);
            return (
              <div
                key={id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', id); setDragId(id); }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); reorder(e.dataTransfer.getData('text/plain'), id); setDragId(null); }}
                className={cn('flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-sm', dragId === id && 'opacity-50')}
              >
                <span className="cursor-grab text-fg-subtle active:cursor-grabbing" title="Arrastrar"><GripVertical className="h-4 w-4" /></span>
                {p?.image ? <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" /> : <div className="h-8 w-8 rounded bg-black/5" />}
                <span className="flex-1 truncate">{p?.name ?? 'Producto'}</span>
                <button onClick={() => removeId(id)} aria-label="Quitar" className="text-fg-subtle hover:text-danger"><X className="h-4 w-4" /></button>
              </div>
            );
          })}
        </div>
      )}

      {/* Buscador: resultados sólo al escribir */}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar productos para agregar…" className={`h-9 w-full px-3 text-sm ${INPUT_BASE}`} />
      {query && (
        <div className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-1">
          {all === null && <p className="p-3 text-center text-xs text-fg-muted">Cargando…</p>}
          {all !== null && results.length === 0 && <p className="p-3 text-center text-xs text-fg-muted">Sin resultados.</p>}
          {results.map((p) => (
            <button key={p.id} onClick={() => { add(p.id); setQ(''); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-bg-muted">
              {p.image ? <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" /> : <div className="h-8 w-8 rounded bg-black/5" />}
              <span className="flex-1 truncate">{p.name}</span>
              <Plus className="h-4 w-4 text-primary" />
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-xs text-fg-subtle">{value.length > 0 ? 'Arrastrá para reordenar. ' : ''}Si no elegís ninguno, se muestran automáticamente.</p>
    </div>
  );
}

const INFO_ICONS = [
  { value: 'shipping', label: 'Envíos' },
  { value: 'card', label: 'Tarjetas de crédito' },
  { value: 'security', label: 'Seguridad' },
  { value: 'gift', label: 'Regalo / Promo' },
  { value: 'support', label: 'Atención' },
  { value: 'returns', label: 'Cambios' },
];
interface InfoItem { icon?: string; title?: string; description?: string; link?: string }
function InfoBarEditor({ items, onChange }: { items: InfoItem[]; onChange: (v: InfoItem[]) => void }) {
  const list = items.length > 0 ? items : [{ icon: 'shipping' }, { icon: 'card' }, { icon: 'security' }];
  const update = (i: number, patch: InfoItem) => onChange(list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  return (
    <div className="space-y-4">
      {list.map((it, i) => (
        <div key={i} className="rounded-md border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Banner {i + 1}</span>
            {list.length > 1 && <button onClick={() => onChange(list.filter((_, idx) => idx !== i))} className="text-xs text-danger hover:underline">Quitar</button>}
          </div>
          <div className="space-y-2">
            <Field label="Ícono"><Select value={it.icon ?? 'shipping'} onChange={(v) => update(i, { icon: v })} options={INFO_ICONS} /></Field>
            <TextInput value={it.title ?? ''} onChange={(v) => update(i, { title: v })} placeholder="Título" />
            <TextInput value={it.description ?? ''} onChange={(v) => update(i, { description: v })} placeholder="Descripción" />
            <TextInput value={it.link ?? ''} onChange={(v) => update(i, { link: v })} placeholder="Link (opcional)" />
          </div>
        </div>
      ))}
      {list.length < 4 && (
        <button onClick={() => onChange([...list, { icon: 'shipping' }])} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><Plus className="h-4 w-4" /> Agregar banner</button>
      )}
    </div>
  );
}
