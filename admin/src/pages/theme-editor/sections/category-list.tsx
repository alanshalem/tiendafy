import { SECTION_REGISTRY, type CategoryListItem } from '@tiendafy/types';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { Check, Field, Select, TextInput } from '../../theme-editor-inputs';
import { ItemListEditor } from './ItemListEditor';
import { CategorySelect, NumberField, useStoreCategories } from './section-pickers';
import type { SectionEditorProps } from './types';

const FIELDS = SECTION_REGISTRY['category-list'].fields;

function CategoryItem({
  item,
  update,
}: {
  item: CategoryListItem;
  update: (patch: Partial<CategoryListItem>) => void;
}) {
  return (
    <>
      <Field label="Categoría">
        <CategorySelect value={item.categoryId} onChange={(categoryId) => update({ categoryId })} />
      </Field>
      <Field label="Nombre a mostrar (opcional)" hint="Vacío = el nombre de la categoría.">
        <TextInput value={item.title} onChange={(title) => update({ title })} />
      </Field>
      <Field label="Foto (opcional)">
        <MediaUpload kind="sectionImage" value={item.image} onChange={(image) => update({ image })} />
      </Field>
    </>
  );
}

export function CategoryListEditor({ data, set }: SectionEditorProps<'category-list'>) {
  const categories = useStoreCategories();
  const names = new Map((categories.data?.items ?? []).map((c) => [c.id, c.name]));
  return (
    <>
      <Field label="Título">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Qué categorías">
        <Select
          value={data.mode}
          onChange={(v) => set({ mode: v as typeof data.mode })}
          options={[
            { value: 'auto', label: 'Las principales, automáticamente' },
            { value: 'manual', label: 'Las que elija yo' },
          ]}
        />
      </Field>
      {data.mode === 'auto' ? (
        <NumberField
          label="Cuántas mostrar"
          value={data.count}
          min={FIELDS.count.min}
          max={FIELDS.count.max}
          hint="Las de primer nivel, en el orden de Productos → Categorías. Sin foto propia, se muestra la inicial."
          onChange={(count) => set({ count })}
        />
      ) : (
        <ItemListEditor<CategoryListItem>
          items={data.items}
          onChange={(items) => set({ items })}
          max={FIELDS.items.max}
          addLabel="Agregar categoría"
          listLabel="Categorías"
          createItem={() => ({ categoryId: '', title: '', image: '' })}
          itemTitle={(it) => it.title.trim() || names.get(it.categoryId) || ''}
          renderItem={(it, update) => <CategoryItem item={it} update={update} />}
        />
      )}
      <Field label="Cómo se muestran">
        <Select
          value={data.layout}
          onChange={(v) => set({ layout: v as typeof data.layout })}
          options={[
            { value: 'grid', label: 'Grilla' },
            { value: 'carousel', label: 'Carrusel (se deslizan)' },
          ]}
        />
      </Field>
      <Field label="Forma de la foto">
        <Select
          value={data.shape}
          onChange={(v) => set({ shape: v as typeof data.shape })}
          options={[
            { value: 'circle', label: 'Círculo' },
            { value: 'square', label: 'Cuadrada' },
            { value: 'portrait', label: 'Vertical' },
          ]}
        />
      </Field>
      <NumberField
        label="Por fila en computadora"
        value={data.columnsDesktop}
        min={FIELDS.columnsDesktop.min}
        max={FIELDS.columnsDesktop.max}
        onChange={(columnsDesktop) => set({ columnsDesktop })}
      />
      <Field label="Por fila en celular">
        <Select
          value={String(data.columnsMobile)}
          onChange={(v) => set({ columnsMobile: Number(v) })}
          options={[
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
          ]}
        />
      </Field>
      <Check label="Botón «Ver todas»" checked={data.showAll} onChange={(v) => set({ showAll: v })} />
      {data.showAll && (
        <Field label="Texto del botón">
          <TextInput value={data.showAllText} onChange={(v) => set({ showAllText: v })} />
        </Field>
      )}
    </>
  );
}
