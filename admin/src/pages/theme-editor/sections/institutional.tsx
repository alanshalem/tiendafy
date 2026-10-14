import { Field, TextArea, TextInput } from '../../theme-editor-inputs';
import type { SectionEditorProps } from './types';

export function InstitutionalEditor({ data, set }: SectionEditorProps<'institutional'>) {
  return (
    <>
      <Field label="Título">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Descripción">
        <TextArea value={data.description} onChange={(v) => set({ description: v })} />
      </Field>
    </>
  );
}
