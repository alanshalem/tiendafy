import type { NewsletterData } from '@tiendafy/types';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { Field, Select, TextArea, TextInput } from '../../theme-editor-inputs';
import type { SectionEditorProps } from './types';

const LAYOUTS: { value: NewsletterData['layout']; label: string }[] = [
  { value: 'stacked', label: 'Todo centrado' },
  { value: 'split', label: 'Imagen al costado (con imagen)' },
];

export function NewsletterEditor({ data, set, theme }: SectionEditorProps<'newsletter'>) {
  return (
    <>
      {theme?.footer.showNewsletter && (
        <p role="note" className="rounded-md bg-warning/10 p-2.5 text-xs text-fg">
          El pie de página ya tiene su formulario de novedades: con esta sección, quien baje hasta el final ve
          dos iguales. Podés sacar el del pie en Diseño → Pie de página.
        </p>
      )}
      <Field label="Título" hint="Dejalo vacío para no mostrar título.">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} placeholder="Recibí novedades" />
      </Field>
      <Field label="Texto">
        <TextArea value={data.text} onChange={(v) => set({ text: v })} />
      </Field>
      <Field label="Imagen (opcional)">
        <MediaUpload kind="newsletterImage" value={data.image} onChange={(url) => set({ image: url })} />
      </Field>
      <Field label="Cómo se acomoda">
        <Select
          value={data.layout}
          onChange={(v) => set({ layout: v as NewsletterData['layout'] })}
          options={LAYOUTS}
        />
      </Field>
      <Field label="Mensaje al suscribirse">
        <TextInput
          value={data.successMessage}
          onChange={(v) => set({ successMessage: v })}
          placeholder="¡Listo! Te vamos a escribir cuando haya novedades."
        />
      </Field>
      <Field
        label="Letra chica (opcional)"
        hint="Por ejemplo: cada cuánto escribís y que se pueden dar de baja."
      >
        <TextArea value={data.legalText} onChange={(v) => set({ legalText: v })} />
      </Field>
    </>
  );
}
