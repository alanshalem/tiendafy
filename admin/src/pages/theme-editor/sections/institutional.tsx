import { LinkPicker } from '../../../components/LinkPicker';
import { Field, TextArea, TextInput } from '../../theme-editor-inputs';
import type { SectionEditorProps } from './types';

/** Título, texto y un botón opcional. Alineación y fondo: "Diseño de la sección", abajo. */
export function InstitutionalEditor({ data, set }: SectionEditorProps<'institutional'>) {
  const halfButton = !!data.buttonText.trim() !== !!data.link.trim();
  return (
    <>
      <Field label="Título" hint="Dejalo vacío para no mostrar título.">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <Field label="Texto" hint="Los saltos de línea se respetan en la tienda.">
        <TextArea value={data.description} onChange={(v) => set({ description: v })} />
      </Field>
      <Field label="Texto del botón (opcional)">
        <TextInput value={data.buttonText} onChange={(v) => set({ buttonText: v })} placeholder="Conocenos" />
      </Field>
      <LinkPicker label="Link del botón" value={data.link} onChange={(href) => set({ link: href })} />
      {halfButton && <p className="text-xs text-warning">El botón se muestra cuando tiene texto y link.</p>}
    </>
  );
}
