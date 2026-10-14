import { parsePlayableVideo, VIDEO_RATIOS, type PlayableVideo } from '@tiendafy/types';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { LinkPicker } from '../../../components/LinkPicker';
import { Check, Field, Select, TextArea, TextInput } from '../../theme-editor-inputs';
import { ChoiceGroup, RatioIcon } from './choice-group';
import type { SectionEditorProps } from './types';

const RATIO_LABELS: Record<(typeof VIDEO_RATIOS)[number], string> = {
  '16:9': 'Horizontal (16:9)',
  '4:3': 'Clásico (4:3)',
  '1:1': 'Cuadrado (1:1)',
  '9:16': 'Vertical, tipo reel (9:16)',
};

/** Qué entendió el editor del link pegado (con lo mismo que usa la tienda). */
function linkHint(url: string, parsed: PlayableVideo | null, ratio: string): string {
  if (!url.trim())
    return 'Sirven el link de compartir, el de la barra, un Short o un video privado de Vimeo.';
  if (!parsed) return 'Ese link no es de un video de YouTube o Vimeo.';
  const what =
    parsed.kind === 'vimeo' ? 'Video de Vimeo' : parsed.short ? 'Short de YouTube' : 'Video de YouTube';
  // Un Short en un recuadro horizontal queda con franjas negras a los costados.
  const vertical =
    parsed.kind === 'youtube' && parsed.short && ratio !== '9:16'
      ? ' Es vertical: elegí la proporción "Vertical, tipo reel" para que no quede con franjas.'
      : '';
  return `${what} reconocido. Se carga recién cuando alguien lo reproduce.${vertical}`;
}

export function VideoEditor({ data, set }: SectionEditorProps<'video'>) {
  const parsed = data.url.trim() ? parsePlayableVideo(data.url) : null;
  const urlHint = linkHint(data.url, parsed, data.ratio);
  return (
    <>
      <Field label="De dónde sale el video">
        <Select
          value={data.source}
          onChange={(v) => set({ source: v as typeof data.source })}
          options={[
            { value: 'link', label: 'Un link de YouTube o Vimeo' },
            { value: 'file', label: 'Un video que subo (MP4)' },
          ]}
        />
      </Field>
      {data.source === 'link' ? (
        <Field label="Link del video" hint={urlHint}>
          <TextInput
            value={data.url}
            onChange={(url) => set({ url: url.trim() })}
            placeholder="https://youtu.be/…"
          />
        </Field>
      ) : (
        <>
          <Field label="Video">
            <MediaUpload kind="sectionVideo" value={data.file} onChange={(file) => set({ file })} />
          </Field>
          <Check
            label="Reproducir solo, sin sonido y en loop"
            checked={data.autoplay}
            onChange={(autoplay) => set({ autoplay })}
          />
        </>
      )}
      <Field label="Imagen de portada (opcional)">
        <MediaUpload kind="sectionImage" value={data.poster} onChange={(poster) => set({ poster })} />
      </Field>
      <ChoiceGroup
        label="Proporción"
        value={data.ratio}
        onChange={(ratio) => set({ ratio })}
        options={VIDEO_RATIOS.map((r) => ({
          value: r,
          label: r,
          title: RATIO_LABELS[r],
          icon: <RatioIcon ratio={r} />,
        }))}
      />
      <Field label="Título">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Texto">
        <TextArea value={data.text} onChange={(v) => set({ text: v })} />
      </Field>
      <Field label="Texto del botón (opcional)">
        <TextInput value={data.buttonText} onChange={(v) => set({ buttonText: v })} />
      </Field>
      {data.buttonText.trim() && (
        <LinkPicker label="A dónde lleva el botón" value={data.link} onChange={(link) => set({ link })} />
      )}
    </>
  );
}
