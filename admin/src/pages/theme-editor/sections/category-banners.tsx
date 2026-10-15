import { useId, useState } from 'react';
import { categoryLink, SECTION_REGISTRY, type CategoryBannerItem } from '@tiendafy/types';
import { LinkPicker } from '../../../components/LinkPicker';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { api } from '../../../lib/api';
import { useCategories } from '../../../lib/useCategories';
import { bannerIdeal } from '../../../lib/uploads';
import { Field, TextInput } from '../../theme-editor-inputs';
import { BannerGridFields } from './banners';
import { CheckRow, EditorWarning } from './image-fields';
import { ItemListEditor } from './ItemListEditor';
import type { SectionEditorProps } from './types';

const MAX_BANNERS = SECTION_REGISTRY['category-banners'].fields.banners.max;

interface ProductDto {
  images?: { url: string }[];
}

/** La foto del primer producto activo de la categoría que tenga foto (las categorías no tienen imagen propia). */
async function categoryImage(categoryId: string): Promise<string> {
  try {
    const params = new URLSearchParams({ categoryId, limit: '12', status: 'ACTIVE' });
    const res = await api.get<{ items: ProductDto[] }>(`/api/v1/products?${params}`);
    return res.items.find((p) => p.images?.[0]?.url)?.images?.[0]?.url ?? '';
  } catch {
    return '';
  }
}

/**
 * Elegir la categoría completa el banner: el nombre, el link y una foto (la
 * de un producto de la categoría, si no tiene una). Todo se puede cambiar
 * después; elegir otra categoría no pisa una foto que ya subiste.
 */
function CategoryPicker({
  banner,
  onPick,
}: {
  banner: CategoryBannerItem;
  onPick: (patch: Partial<CategoryBannerItem>) => void;
}) {
  const id = useId();
  const categories = useCategories();
  const [busy, setBusy] = useState(false);
  const items = categories.data?.items ?? [];
  if (categories.isSuccess && items.length === 0) return null;
  const current = items.find((c) => categoryLink(c.path || c.id) === banner.link)?.id ?? '';
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        Categoría
      </label>
      <select
        id={id}
        value={current}
        disabled={busy || !categories.data}
        onChange={async (e) => {
          const cat = items.find((c) => c.id === e.target.value);
          if (!cat) return;
          const patch: Partial<CategoryBannerItem> = {
            title: cat.name,
            link: categoryLink(cat.path || cat.id),
          };
          if (!banner.image) {
            setBusy(true);
            patch.image = await categoryImage(cat.id);
            setBusy(false);
          }
          onPick(patch);
        }}
        className="h-10 w-full appearance-none rounded-md border border-border-strong bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">{categories.data ? 'Elegí una categoría…' : 'Cargando…'}</option>
        {items.map((c) => (
          <option key={c.id} value={c.id}>
            {'  '.repeat(Math.max(0, (c.depth ?? 1) - 1))}
            {c.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-fg-muted">
        {busy
          ? 'Buscando una foto de la categoría…'
          : 'Completa el nombre, el link y una foto; después podés cambiarlos.'}
      </p>
    </div>
  );
}

export function CategoryBannersEditor({ data, set }: SectionEditorProps<'category-banners'>) {
  const ideal = bannerIdeal({
    ratio: data.ratio,
    columns: Number(data.columns),
    columnsMobile: Number(data.columnsMobile),
    fullWidth: data.fullWidth,
  });
  return (
    <>
      <BannerGridFields
        data={data}
        set={set}
        columns={['2', '3', '4', '5', '6']}
        ratios={['1x1', '4x5', '3x4', '4x3', '16x9']}
      />
      <ItemListEditor<CategoryBannerItem>
        items={data.banners}
        onChange={(banners) => set({ banners })}
        max={MAX_BANNERS}
        addLabel="Agregar categoría"
        listLabel="Categorías"
        createItem={() => ({ image: '', alt: '', title: '', link: '', newTab: false, show: true })}
        renderItem={(b, update) => (
          <>
            <CategoryPicker banner={b} onPick={update} />
            <CheckRow label="Mostrar" checked={b.show} onChange={(v) => update({ show: v })} />
            <Field label="Foto">
              <MediaUpload
                kind="categoryBanner"
                ideal={ideal}
                value={b.image}
                onChange={(url) => update({ image: url })}
              />
            </Field>
            <Field label="Nombre que se ve">
              <TextInput value={b.title} onChange={(v) => update({ title: v })} />
            </Field>
            {b.title.length > 24 && (
              <EditorWarning>Es largo: en celular, con 2 por fila, se corta en varias líneas.</EditorWarning>
            )}
            <Field
              label="Texto alternativo (opcional)"
              hint="Solo si la foto muestra algo que el nombre no dice."
            >
              <TextInput value={b.alt} onChange={(v) => update({ alt: v })} />
            </Field>
            <LinkPicker
              label="A dónde lleva"
              value={b.link}
              onChange={(link) => update({ link })}
              newTab={b.newTab}
              onNewTabChange={(newTab) => update({ newTab })}
            />
          </>
        )}
      />
    </>
  );
}
