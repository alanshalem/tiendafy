import { SECTION_REGISTRY, type CategoryListItem } from '@tiendafy/types';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { Check, Field, Select, TextInput } from '../../theme-editor-inputs';
import { ChoiceGroup, ColumnsIcon, LayoutIcon, ShapeIcon } from './choice-group';
import { ItemListEditor } from './ItemListEditor';
import { CategorySelect, NumberField, useStoreCategories } from './section-pickers';
import type { SectionEditorProps } from './types';

const FIELDS = SECTION_REGISTRY['category-list'].fields;
const perRow = (n: number | string) => `${n} por fila`;

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

/** De 2 a 8 por fila (los topes del registro). */
const DESKTOP_COLUMNS = Array.from(
  { length: FIELDS.columnsDesktop.max - FIELDS.columnsDesktop.min + 1 },
  (_, i) => FIELDS.columnsDesktop.min + i,
);

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
      <ChoiceGroup
        label="Cómo se muestran"
        value={data.layout}
        onChange={(layout) => set({ layout })}
        options={[
          { value: 'grid', label: 'Grilla', icon: <LayoutIcon layout="grid" /> },
          {
            value: 'carousel',
            label: 'Carrusel',
            title: 'Carrusel (se deslizan)',
            icon: <LayoutIcon layout="carousel" />,
          },
        ]}
      />
      <ChoiceGroup
        label="Forma de la foto"
        value={data.shape}
        onChange={(shape) => set({ shape })}
        options={[
          { value: 'circle', label: 'Círculo', icon: <ShapeIcon shape="circle" /> },
          { value: 'square', label: 'Cuadrada', icon: <ShapeIcon shape="square" /> },
          { value: 'portrait', label: 'Vertical', icon: <ShapeIcon shape="portrait" /> },
        ]}
      />
      <ChoiceGroup
        label="Por fila en computadora"
        hint={
          data.layout === 'carousel' ? 'En carrusel se asoma además un pedazo de la siguiente.' : undefined
        }
        value={String(data.columnsDesktop)}
        onChange={(v) => set({ columnsDesktop: Number(v) })}
        options={DESKTOP_COLUMNS.map((n) => ({ value: String(n), label: String(n), title: perRow(n) }))}
        columns={DESKTOP_COLUMNS.length}
      />
      <ChoiceGroup
        label="Por fila en celular"
        value={String(data.columnsMobile)}
        onChange={(v) => set({ columnsMobile: Number(v) })}
        options={['1', '2', '3'].map((n) => ({
          value: n,
          label: n,
          title: perRow(n),
          icon: <ColumnsIcon n={Number(n)} />,
        }))}
      />
      <Check label="Botón «Ver todas»" checked={data.showAll} onChange={(v) => set({ showAll: v })} />
      {data.showAll && (
        <Field label="Texto del botón">
          <TextInput value={data.showAllText} onChange={(v) => set({ showAllText: v })} />
        </Field>
      )}
    </>
  );
}
