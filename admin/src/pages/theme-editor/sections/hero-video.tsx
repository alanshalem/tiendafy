import type { HeroVideoData, TextPosition } from '@tiendafy/types';
import { LinkPicker } from '../../../components/LinkPicker';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { Field, Select, TextArea, TextInput } from '../../theme-editor-inputs';
import { EditorWarning, OVERLAY_OPTIONS, PositionPicker } from './image-fields';
import type { SectionEditorProps } from './types';

type V = HeroVideoData['verticalAlign'];
type H = HeroVideoData['align'];

/** La grilla de posición guarda dos campos: vertical y horizontal. */
const toPosition = (v: V, h: H): TextPosition =>
  v === 'center' && h === 'center' ? 'center' : (`${v}-${h === 'center' ? 'center' : h}` as TextPosition);
const fromPosition = (p: TextPosition): { verticalAlign: V; align: H } => {
  if (p === 'center') return { verticalAlign: 'center', align: 'center' };
  const [v, h] = p.split('-') as [V, H];
  return { verticalAlign: v, align: h };
};

export function HeroVideoEditor({ data, set }: SectionEditorProps<'hero-video'>) {
  const hasMedia = !!(data.videoWebm || data.videoMp4 || data.videoMobile || data.poster);
  const darkText = data.textColor === 'dark';
  return (
    <>
      <p className="rounded-md bg-bg-muted p-2.5 text-xs text-fg-muted">
        Subí el mismo video en 2 formatos: <strong>WebM</strong> (más liviano, para Chrome/Android) y{' '}
        <strong>MP4</strong> (para iPhone/Safari). Quien tiene el ahorro de datos prendido o pidió menos
        movimiento ve la imagen de respaldo.
      </p>
      <Field label="Video WebM (recomendado)">
        <MediaUpload
          kind="heroVideoWebm"
          value={data.videoWebm}
          onChange={(url) => set({ videoWebm: url })}
        />
      </Field>
      <Field label="Video MP4 (compatibilidad)">
        <MediaUpload kind="heroVideoMp4" value={data.videoMp4} onChange={(url) => set({ videoMp4: url })} />
      </Field>
      <Field label="Video para celular (opcional)" hint="Vertical. Sin este, el celular usa el de arriba.">
        <MediaUpload
          kind="heroVideoMobile"
          value={data.videoMobile}
          onChange={(url) => set({ videoMobile: url })}
        />
      </Field>
      <Field label="Imagen de respaldo (poster)" hint="Se ve mientras carga el video y en conexiones lentas.">
        <MediaUpload kind="heroPoster" value={data.poster} onChange={(url) => set({ poster: url })} />
      </Field>
      <Field label="Imagen de respaldo para celular (opcional)">
        <MediaUpload
          kind="heroPosterMobile"
          value={data.posterMobile}
          onChange={(url) => set({ posterMobile: url })}
        />
      </Field>

      <Field label="Título">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Subtítulo">
        <TextArea value={data.subtitle} onChange={(v) => set({ subtitle: v })} />
      </Field>
      <Field label="Texto del botón">
        <TextInput value={data.buttonText} onChange={(v) => set({ buttonText: v })} />
      </Field>
      {data.buttonText && (
        <LinkPicker
          label="Link del botón"
          hint="Sin link, lleva a todos los productos."
          value={data.link}
          onChange={(link) => set({ link })}
          newTab={data.newTab}
          onNewTabChange={(newTab) => set({ newTab })}
        />
      )}
      <Field label="Texto del segundo botón (opcional)">
        <TextInput value={data.secondButtonText} onChange={(v) => set({ secondButtonText: v })} />
      </Field>
      {data.secondButtonText && (
        <>
          <LinkPicker
            label="Link del segundo botón"
            value={data.secondLink}
            onChange={(secondLink) => set({ secondLink })}
            newTab={data.secondNewTab}
            onNewTabChange={(secondNewTab) => set({ secondNewTab })}
          />
          {!data.secondLink && (
            <EditorWarning>El segundo botón aparece cuando le elegís un link.</EditorWarning>
          )}
        </>
      )}

      <PositionPicker
        value={toPosition(data.verticalAlign, data.align)}
        onChange={(p) => set(fromPosition(p))}
      />
      <Field label="Color del texto">
        <Select
          value={data.textColor}
          onChange={(v) => set({ textColor: v as HeroVideoData['textColor'] })}
          options={[
            { value: 'light', label: 'Claro (para fotos oscuras)' },
            { value: 'dark', label: 'Oscuro (para fotos claras)' },
          ]}
        />
      </Field>
      <Field
        label={
          darkText
            ? 'Aclarar el fondo (para que se lea el texto)'
            : 'Oscurecer el fondo (para que se lea el texto)'
        }
      >
        <Select
          value={data.overlay}
          onChange={(v) => set({ overlay: v as HeroVideoData['overlay'] })}
          options={OVERLAY_OPTIONS}
        />
      </Field>
      {hasMedia && data.overlay === 'none' && (data.title || data.subtitle) && (
        <EditorWarning>
          Sin {darkText ? 'aclarar' : 'oscurecer'} el fondo, el texto {darkText ? 'oscuro' : 'blanco'} no se
          lee sobre las partes {darkText ? 'oscuras' : 'claras'} del video. Probá con «Leve» o «Medio» y
          miralo en un celular.
        </EditorWarning>
      )}
      <Field label="Altura">
        <Select
          value={data.height}
          onChange={(v) => set({ height: v as HeroVideoData['height'] })}
          options={[
            { value: 'small', label: 'Baja (media pantalla)' },
            { value: 'medium', label: 'Media' },
            { value: 'large', label: 'Grande' },
            { value: 'full', label: 'Pantalla completa' },
          ]}
        />
      </Field>
    </>
  );
}
