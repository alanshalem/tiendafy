import { MediaUploadList } from '../../../components/upload/MediaUpload';
import { Check, Field } from '../../theme-editor-inputs';
import type { SectionEditorProps } from './types';

/*
 * Las imágenes del carrusel son una lista de URLs (no ítems con nombre): la
 * grilla de MediaUploadList ya sube varias a la vez, reordena y quita. Cuando
 * pasen a ser diapositivas con título y link (una migración del esquema), van
 * con ItemListEditor como los banners.
 */
export function CarouselEditor({ data, set }: SectionEditorProps<'carousel'>) {
  return (
    <>
      <Field label="Imágenes del carrusel" hint="Podés cargar varias; se pasan solas.">
        <MediaUploadList kind="carousel" values={data.images} onChange={(images) => set({ images })} />
      </Field>
      <Check
        label="Extender al alto de la pantalla en celulares"
        checked={data.fullHeightMobile}
        onChange={(v) => set({ fullHeightMobile: v })}
      />
    </>
  );
}
