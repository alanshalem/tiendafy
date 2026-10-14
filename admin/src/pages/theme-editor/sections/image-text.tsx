import { MediaUpload } from '../../../components/upload/MediaUpload';
import { Field, Select, TextArea, TextInput } from '../../theme-editor-inputs';
import type { SectionEditorProps } from './types';

export function ImageTextEditor({ data, set }: SectionEditorProps<'image-text'>) {
  return (
    <>
      <Field label="Imagen">
        <MediaUpload kind="imageText" value={data.image} onChange={(url) => set({ image: url })} />
      </Field>
      <Field label="Título">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Descripción">
        <TextArea value={data.description} onChange={(v) => set({ description: v })} />
      </Field>
      <Field label="Texto del botón">
        <TextInput value={data.buttonText} onChange={(v) => set({ buttonText: v })} />
      </Field>
      <Field label="Link">
        <TextInput value={data.link} onChange={(v) => set({ link: v })} />
      </Field>
      <Field label="Color del texto">
        <Select
          value={data.textColor}
          onChange={(v) => set({ textColor: v as typeof data.textColor })}
          options={[
            { value: 'dark', label: 'Oscuro' },
            { value: 'light', label: 'Claro' },
          ]}
        />
      </Field>
    </>
  );
}
