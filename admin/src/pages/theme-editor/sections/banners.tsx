import { SECTION_REGISTRY, type BannerItem } from '@tiendafy/types';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import type { UploadKind } from '../../../lib/uploads';
import { Check, TextInput } from '../../theme-editor-inputs';
import { ItemListEditor } from './ItemListEditor';
import type { SectionEditorProps } from './types';

const MAX_BANNERS = SECTION_REGISTRY['promo-banners'].fields.banners.max;

/** Lo común a los banners de promo y de categorías: ancho y la lista de banners. */
export function BannersEditor({
  data,
  set,
  withDescription,
  imageKind,
  addLabel,
}: SectionEditorProps<'promo-banners' | 'category-banners'> & {
  withDescription?: boolean;
  imageKind: UploadKind;
  addLabel: string;
}) {
  return (
    <>
      <Check
        label="Extender al ancho de la pantalla"
        checked={data.fullWidth}
        onChange={(v) => set({ fullWidth: v })}
      />
      <ItemListEditor<BannerItem>
        items={data.banners}
        onChange={(banners) => set({ banners })}
        max={MAX_BANNERS}
        addLabel={addLabel}
        listLabel="Banners"
        createItem={() => ({ image: '', title: '', description: '', link: '', show: true })}
        renderItem={(b, update) => (
          <>
            <Check label="Mostrar banner" checked={b.show} onChange={(v) => update({ show: v })} />
            <MediaUpload kind={imageKind} value={b.image} onChange={(url) => update({ image: url })} />
            <TextInput value={b.title} onChange={(v) => update({ title: v })} placeholder="Título" />
            {withDescription && (
              <TextInput
                value={b.description}
                onChange={(v) => update({ description: v })}
                placeholder="Descripción"
              />
            )}
            <TextInput value={b.link} onChange={(v) => update({ link: v })} placeholder="Link" />
          </>
        )}
      />
    </>
  );
}
