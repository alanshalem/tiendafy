import { SECTION_REGISTRY, type BrandLogo, type BrandsData } from '@tiendafy/types';
import { LinkPicker } from '../../../components/LinkPicker';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { Field, Select, TextInput } from '../../theme-editor-inputs';
import { BulkImageAdd, CheckRow, EditorWarning } from './image-fields';
import { ItemListEditor } from './ItemListEditor';
import type { SectionEditorProps } from './types';

const MAX_LOGOS = SECTION_REGISTRY.brands.fields.logos.max;

const newLogo = (image = ''): BrandLogo => ({ image, name: '', link: '', newTab: false });

export function BrandsEditor({ data, set }: SectionEditorProps<'brands'>) {
  const unnamed = data.logos.filter((l) => l.image && !l.name.trim()).length;
  return (
    <>
      <Field label="Título">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <ItemListEditor<BrandLogo>
        items={data.logos}
        onChange={(logos) => set({ logos })}
        max={MAX_LOGOS}
        addLabel="Agregar marca"
        listLabel="Marcas"
        createItem={() => newLogo()}
        renderItem={(logo, update) => (
          <>
            <Field label="Logo">
              <MediaUpload kind="brandLogo" value={logo.image} onChange={(url) => update({ image: url })} />
            </Field>
            <Field
              label="Nombre de la marca"
              hint="Lo leen los lectores de pantalla y Google en lugar del logo."
            >
              <TextInput value={logo.name} onChange={(v) => update({ name: v })} />
            </Field>
            <LinkPicker
              label="A dónde lleva (opcional)"
              hint="Por ejemplo, la búsqueda de esa marca en tu tienda."
              value={logo.link}
              onChange={(link) => update({ link })}
              newTab={logo.newTab}
              onNewTabChange={(newTab) => update({ newTab })}
            />
          </>
        )}
      />
      {unnamed > 0 && (
        <EditorWarning>
          {unnamed === 1 ? 'Un logo no tiene' : `${unnamed} logos no tienen`} nombre: abrilo en la lista y
          completalo.
        </EditorWarning>
      )}
      <BulkImageAdd
        kind="brandLogo"
        label="Subir varios logos de una vez"
        items={data.logos}
        max={MAX_LOGOS}
        onChange={(logos) => set({ logos })}
        create={newLogo}
      />
      <Field label="Cómo se muestran">
        <Select
          value={data.layout}
          onChange={(v) => set({ layout: v as BrandsData['layout'] })}
          options={[
            { value: 'auto', label: 'Automático (con 5 o más, se deslizan)' },
            { value: 'marquee', label: 'Siempre deslizándose' },
            { value: 'grid', label: 'Fijos, centrados' },
          ]}
        />
      </Field>
      {data.layout !== 'grid' && (
        <Field label="Velocidad" hint="Se frenan al pasar el mouse y tienen botón de pausa.">
          <Select
            value={data.speed}
            onChange={(v) => set({ speed: v as BrandsData['speed'] })}
            options={[
              { value: 'slow', label: 'Lenta' },
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: 'Rápida' },
            ]}
          />
        </Field>
      )}
      <CheckRow
        label="En gris (se colorean al pasar el mouse)"
        checked={data.grayscale}
        onChange={(v) => set({ grayscale: v })}
      />
    </>
  );
}
