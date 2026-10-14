import { BANNER_RATIOS, SECTION_REGISTRY, type PromoBannerItem } from '@tiendafy/types';
import { LinkPicker } from '../../../components/LinkPicker';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { bannerIdeal, bannerMobileIdeal } from '../../../lib/uploads';
import { Field, TextArea, TextInput } from '../../theme-editor-inputs';
import { BannerGridFields } from './banners';
import { CheckRow, EditorWarning } from './image-fields';
import { ItemListEditor } from './ItemListEditor';
import type { SectionEditorProps } from './types';

const MAX_BANNERS = SECTION_REGISTRY['promo-banners'].fields.banners.max;

export function PromoBannersEditor({ data, set }: SectionEditorProps<'promo-banners'>) {
  const columns = Number(data.columns);
  const columnsMobile = Number(data.columnsMobile);
  return (
    <>
      <BannerGridFields
        data={data}
        set={set}
        columns={['1', '2', '3', '4']}
        ratios={BANNER_RATIOS}
        mobileRatio={{
          value: data.ratioMobile,
          onChange: (v) => set({ ratioMobile: v as typeof data.ratioMobile }),
        }}
      />
      <ItemListEditor<PromoBannerItem>
        items={data.banners}
        onChange={(banners) => set({ banners })}
        max={MAX_BANNERS}
        addLabel="Agregar promoción"
        listLabel="Banners"
        createItem={() => ({
          image: '',
          mobileImage: '',
          alt: '',
          title: '',
          description: '',
          buttonText: '',
          link: '',
          newTab: false,
          show: true,
        })}
        renderItem={(b, update) => (
          <>
            <CheckRow label="Mostrar banner" checked={b.show} onChange={(v) => update({ show: v })} />
            <Field label="Foto">
              <MediaUpload
                kind="promoBanner"
                ideal={bannerIdeal({
                  ratio: data.ratio,
                  columns,
                  columnsMobile,
                  fullWidth: data.fullWidth,
                  hasMobileImage: !!b.mobileImage,
                })}
                value={b.image}
                onChange={(url) => update({ image: url })}
              />
            </Field>
            <Field label="Foto para celular (opcional)">
              <MediaUpload
                kind="promoBannerMobile"
                ideal={bannerMobileIdeal(
                  data.ratioMobile === 'same' ? data.ratio : data.ratioMobile,
                  columnsMobile,
                )}
                value={b.mobileImage}
                onChange={(url) => update({ mobileImage: url })}
              />
            </Field>
            <Field
              label="Texto alternativo"
              hint="Solo si la foto dice algo que no está en el título (un precio, una fecha)."
            >
              <TextInput value={b.alt} onChange={(v) => update({ alt: v })} />
            </Field>
            <Field label="Título">
              <TextInput value={b.title} onChange={(v) => update({ title: v })} />
            </Field>
            <Field label="Descripción">
              <TextArea value={b.description} onChange={(v) => update({ description: v })} />
            </Field>
            {b.description.length > 90 && (
              <EditorWarning>Es largo para un banner: se corta a las dos líneas.</EditorWarning>
            )}
            <Field label="Texto del botón (opcional)">
              <TextInput value={b.buttonText} onChange={(v) => update({ buttonText: v })} />
            </Field>
            <LinkPicker
              label="A dónde lleva"
              value={b.link}
              onChange={(link) => update({ link })}
              newTab={b.newTab}
              onNewTabChange={(newTab) => update({ newTab })}
            />
            {b.link && !b.title && !b.alt && !b.buttonText && (
              <EditorWarning>
                Poné un título o un texto alternativo: sin eso, quien usa lector de pantalla no sabe a dónde
                lleva.
              </EditorWarning>
            )}
          </>
        )}
      />
    </>
  );
}
