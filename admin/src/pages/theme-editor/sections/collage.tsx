import { SECTION_REGISTRY, type CollageBlock } from '@tiendafy/types';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { LinkPicker } from '../../../components/LinkPicker';
import { Field, Select, TextInput } from '../../theme-editor-inputs';
import { ChoiceGroup, CollageIcon, LayoutIcon } from './choice-group';
import { ItemListEditor } from './ItemListEditor';
import { CategorySelect, SingleProductPicker } from './section-pickers';
import type { SectionEditorProps } from './types';

const MAX = SECTION_REGISTRY.collage.fields.blocks.max;

const KIND_LABEL: Record<CollageBlock['kind'], string> = {
  image: 'Imagen',
  product: 'Producto',
  category: 'Categoría',
};

function BlockFields({
  block,
  update,
}: {
  block: CollageBlock;
  update: (patch: Partial<CollageBlock>) => void;
}) {
  return (
    <>
      <Field label="Qué muestra">
        <Select
          value={block.kind}
          onChange={(v) => update({ kind: v as CollageBlock['kind'] })}
          options={[
            { value: 'image', label: 'Una imagen con link' },
            { value: 'product', label: 'Un producto' },
            { value: 'category', label: 'Una categoría' },
          ]}
        />
      </Field>
      {block.kind === 'product' && (
        <Field label="Producto">
          <SingleProductPicker value={block.productId} onChange={(productId) => update({ productId })} />
        </Field>
      )}
      {block.kind === 'category' && (
        <Field label="Categoría">
          <CategorySelect value={block.categoryId} onChange={(categoryId) => update({ categoryId })} />
        </Field>
      )}
      <Field
        label={block.kind === 'image' ? 'Imagen' : 'Imagen (opcional)'}
        hint={block.kind === 'product' ? 'Vacío = la foto del producto.' : undefined}
      >
        <MediaUpload kind="sectionImage" value={block.image} onChange={(image) => update({ image })} />
      </Field>
      <Field
        label="Texto"
        hint={block.kind === 'image' ? undefined : 'Vacío = el nombre del producto o la categoría.'}
      >
        <TextInput value={block.title} onChange={(title) => update({ title })} />
      </Field>
      {block.kind === 'image' && (
        <LinkPicker label="A dónde lleva" value={block.link} onChange={(link) => update({ link })} />
      )}
    </>
  );
}

export function CollageEditor({ data, set }: SectionEditorProps<'collage'>) {
  return (
    <>
      <Field label="Título (opcional)">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <ItemListEditor<CollageBlock>
        items={data.blocks}
        onChange={(blocks) => set({ blocks })}
        max={MAX}
        addLabel="Agregar bloque"
        listLabel="Bloques"
        createItem={() => ({ kind: 'image', image: '', title: '', link: '', productId: '', categoryId: '' })}
        itemTitle={(b) => b.title.trim() || KIND_LABEL[b.kind]}
        renderItem={(b, update) => <BlockFields block={b} update={update} />}
      />
      {data.blocks.length < 2 && (
        <p className="rounded-md bg-bg-muted p-2.5 text-xs text-fg-muted">
          El collage luce con dos o tres bloques: el primero va grande.
        </p>
      )}
      <ChoiceGroup
        label="El bloque grande va"
        value={data.layout}
        onChange={(layout) => set({ layout })}
        options={[
          {
            value: 'big-left',
            label: 'Izquierda',
            title: 'A la izquierda',
            icon: <CollageIcon big="left" />,
          },
          { value: 'big-right', label: 'Derecha', title: 'A la derecha', icon: <CollageIcon big="right" /> },
        ]}
      />
      <ChoiceGroup
        label="En celular"
        value={data.mobile}
        onChange={(mobile) => set({ mobile })}
        options={[
          {
            value: 'stack',
            label: 'Apilados',
            title: 'Uno debajo del otro',
            icon: <LayoutIcon layout="stack" />,
          },
          {
            value: 'swipe',
            label: 'Deslizando',
            title: 'Deslizando de costado',
            icon: <LayoutIcon layout="carousel" />,
          },
        ]}
      />
    </>
  );
}
