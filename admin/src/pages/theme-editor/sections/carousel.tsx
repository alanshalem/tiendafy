import { SECTION_REGISTRY, type CarouselData, type CarouselSlide } from '@tiendafy/types';
import { LinkPicker } from '../../../components/LinkPicker';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { carouselIdeal, carouselMobileIdeal } from '../../../lib/uploads';
import { Field, Select, TextArea, TextInput } from '../../theme-editor-inputs';
import { BulkImageAdd, CheckRow, EditorWarning, OverlayField, PositionPicker } from './image-fields';
import { ItemListEditor } from './ItemListEditor';
import type { SectionEditorProps } from './types';

const MAX_SLIDES = SECTION_REGISTRY.carousel.fields.slides.max;

const newSlide = (image = ''): CarouselSlide => ({
  image,
  mobileImage: '',
  alt: '',
  link: '',
  newTab: false,
  title: '',
  subtitle: '',
  buttonText: '',
  textPosition: 'center',
  overlay: 'none',
});

const HEIGHTS = [
  { value: 'adapt', label: 'Según la foto (sin recortes)' },
  { value: 'small', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'large', label: 'Alta' },
  { value: 'full', label: 'Pantalla completa' },
];

/** Cómo se llama una diapositiva en la lista: su título, su texto alternativo o "Diapositiva N". */
const slideTitle = (s: CarouselSlide) => s.title.trim() || s.alt.trim();

export function CarouselEditor({ data, set }: SectionEditorProps<'carousel'>) {
  const ideal = carouselIdeal(data.height);
  const mobileIdeal = carouselMobileIdeal(data.heightMobile, data.height);
  return (
    <>
      <ItemListEditor<CarouselSlide>
        items={data.slides}
        onChange={(slides) => set({ slides })}
        max={MAX_SLIDES}
        addLabel="Agregar diapositiva"
        listLabel="Diapositivas"
        itemTitle={slideTitle}
        createItem={() => newSlide()}
        renderItem={(s, update, i) => (
          <>
            <Field label="Foto">
              <MediaUpload
                kind="carousel"
                ideal={ideal}
                value={s.image}
                onChange={(url) => update({ image: url })}
              />
            </Field>
            <Field
              label="Foto para celular (opcional)"
              hint="Sin esta, el celular recorta los bordes de la de arriba."
            >
              <MediaUpload
                kind="carouselMobile"
                ideal={mobileIdeal}
                value={s.mobileImage}
                onChange={(url) => update({ mobileImage: url })}
              />
            </Field>
            <Field
              label="Texto alternativo"
              hint="Qué muestra la foto, en pocas palabras. Lo leen los lectores de pantalla y Google."
            >
              <TextInput value={s.alt} onChange={(v) => update({ alt: v })} />
            </Field>
            {s.image && !s.alt.trim() && !s.title.trim() && (
              <EditorWarning>
                Sin texto alternativo ni título, la diapositiva {i + 1} no se puede describir.
              </EditorWarning>
            )}
            <Field label="Título (opcional)">
              <TextInput value={s.title} onChange={(v) => update({ title: v })} />
            </Field>
            <Field label="Subtítulo (opcional)">
              <TextArea value={s.subtitle} onChange={(v) => update({ subtitle: v })} />
            </Field>
            <Field label="Texto del botón (opcional)">
              <TextInput value={s.buttonText} onChange={(v) => update({ buttonText: v })} />
            </Field>
            <LinkPicker
              label="A dónde lleva"
              hint={s.buttonText ? 'Lo abre el botón (y tocar la foto).' : 'Lo abre tocar la foto.'}
              value={s.link}
              onChange={(link) => update({ link })}
              newTab={s.newTab}
              onNewTabChange={(newTab) => update({ newTab })}
            />
            {(s.title || s.subtitle || s.buttonText) && (
              <>
                <PositionPicker
                  value={s.textPosition}
                  onChange={(textPosition) => update({ textPosition })}
                />
                <OverlayField value={s.overlay} onChange={(overlay) => update({ overlay })} />
                {s.overlay === 'none' && (
                  <EditorWarning>
                    Sin oscurecer, el texto blanco puede no leerse sobre una foto clara. Probá con «Leve».
                  </EditorWarning>
                )}
              </>
            )}
          </>
        )}
      />
      <BulkImageAdd
        kind="carousel"
        label="Subir varias fotos de una vez"
        items={data.slides}
        max={MAX_SLIDES}
        onChange={(slides) => set({ slides })}
        create={newSlide}
      />

      <CheckRow label="Pasar solas" checked={data.autoplay} onChange={(v) => set({ autoplay: v })} />
      {data.autoplay && (
        <Field
          label="Tiempo de cada diapositiva"
          hint="Se frena sola cuando alguien la toca o pasa el mouse, y siempre tiene botón de pausa."
        >
          <Select
            value={data.speed}
            onChange={(v) => set({ speed: v as CarouselData['speed'] })}
            options={['3', '4', '5', '6', '7', '8', '9'].map((n) => ({ value: n, label: `${n} segundos` }))}
          />
        </Field>
      )}
      <Field label="Alto en computadora">
        <Select
          value={data.height}
          onChange={(v) => set({ height: v as CarouselData['height'] })}
          options={HEIGHTS}
        />
      </Field>
      <Field label="Alto en celular">
        <Select
          value={data.heightMobile}
          onChange={(v) => set({ heightMobile: v as CarouselData['heightMobile'] })}
          options={[{ value: 'auto', label: 'Igual que en computadora' }, ...HEIGHTS]}
        />
      </Field>
      <CheckRow label="Flechas (en computadora)" checked={data.arrows} onChange={(v) => set({ arrows: v })} />
      <CheckRow
        label="Puntos para pasar"
        checked={data.indicators}
        onChange={(v) => set({ indicators: v })}
      />
    </>
  );
}
