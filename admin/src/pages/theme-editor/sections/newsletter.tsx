import { MediaUpload } from '../../../components/upload/MediaUpload';
import { Field, TextArea, TextInput } from '../../theme-editor-inputs';
import type { SectionEditorProps } from './types';

export function NewsletterEditor({ data, set }: SectionEditorProps<'newsletter'>) {
  return (
    <>
      <Field label="Título">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Texto">
        <TextArea value={data.text} onChange={(v) => set({ text: v })} />
      </Field>
      <Field label="Imagen (opcional)">
        <MediaUpload kind="newsletterImage" value={data.image} onChange={(url) => set({ image: url })} />
      </Field>
    </>
  );
}
