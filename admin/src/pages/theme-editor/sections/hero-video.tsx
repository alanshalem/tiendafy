import { MediaUpload } from '../../../components/upload/MediaUpload';
import { Field, Select, TextArea, TextInput } from '../../theme-editor-inputs';
import type { SectionEditorProps } from './types';

export function HeroVideoEditor({ data, set }: SectionEditorProps<'hero-video'>) {
  return (
    <>
      <p className="rounded-md bg-bg-muted p-2.5 text-xs text-fg-muted">
        Subí el mismo video en 2 formatos: <strong>WebM</strong> (más liviano, para Chrome/Android) y{' '}
        <strong>MP4</strong> (para iPhone/Safari).
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
      <Field label="Imagen de respaldo (poster)" hint="Se ve mientras carga el video y en conexiones lentas.">
        <MediaUpload kind="heroPoster" value={data.poster} onChange={(url) => set({ poster: url })} />
      </Field>
      <Field label="Título">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Subtítulo">
        <TextArea value={data.subtitle} onChange={(v) => set({ subtitle: v })} />
      </Field>
      <Field label="Texto del botón">
        <TextInput
          value={data.buttonText}
          onChange={(v) => set({ buttonText: v })}
          placeholder="Ver productos"
        />
      </Field>
      <Field label="Link del botón">
        <TextInput value={data.link} onChange={(v) => set({ link: v })} placeholder="/productos" />
      </Field>
      <Field label="Alineación del texto">
        <Select
          value={data.align}
          onChange={(v) => set({ align: v as typeof data.align })}
          options={[
            { value: 'left', label: 'Izquierda' },
            { value: 'center', label: 'Centro' },
          ]}
        />
      </Field>
      <Field label="Altura">
        <Select
          value={data.height}
          onChange={(v) => set({ height: v as typeof data.height })}
          options={[
            { value: 'large', label: 'Grande' },
            { value: 'full', label: 'Pantalla completa' },
          ]}
        />
      </Field>
      <Field label="Oscurecer el fondo (para que se lea el texto)">
        <Select
          value={data.overlay}
          onChange={(v) => set({ overlay: v as typeof data.overlay })}
          options={[
            { value: 'none', label: 'Nada' },
            { value: 'light', label: 'Leve' },
            { value: 'medium', label: 'Medio' },
            { value: 'strong', label: 'Fuerte' },
          ]}
        />
      </Field>
    </>
  );
}
