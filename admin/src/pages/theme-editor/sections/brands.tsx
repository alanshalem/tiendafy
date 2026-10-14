import { MediaUploadList } from '../../../components/upload/MediaUpload';
import { Field, TextInput } from '../../theme-editor-inputs';
import type { SectionEditorProps } from './types';

// Los logos son una lista de URLs, como las imágenes del carrusel: ver la
// nota en carousel.tsx sobre cuándo pasan a ItemListEditor.
export function BrandsEditor({ data, set }: SectionEditorProps<'brands'>) {
  return (
    <>
      <Field label="Título">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} placeholder="Marcas que vendemos" />
      </Field>
      <Field
        label="Logos de marcas"
        hint="Con 5 o más se deslizan solos en loop; con menos quedan fijos y centrados."
      >
        <MediaUploadList kind="brandLogo" values={data.images} onChange={(images) => set({ images })} />
      </Field>
    </>
  );
}
