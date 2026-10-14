import type { NewsletterData } from '@tiendafy/types';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { Field, TextArea, TextInput } from '../../theme-editor-inputs';
import { ChoiceGroup, SideIcon, type Choice } from './choice-group';
import type { SectionEditorProps } from './types';

const LAYOUTS: Choice<NewsletterData['layout']>[] = [
  { value: 'stacked', label: 'Centrado', title: 'Todo centrado', icon: <SideIcon image="top" /> },
  { value: 'split', label: 'Imagen al costado', icon: <SideIcon image="left" /> },
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
      <ChoiceGroup
        label="Cómo se acomoda"
        hint={
          data.layout === 'split' && !data.image
            ? 'La imagen al costado necesita una imagen: sin ella, queda todo centrado.'
            : undefined
        }
        value={data.layout}
        onChange={(layout: NewsletterData['layout']) => set({ layout })}
        options={LAYOUTS}
      />
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
