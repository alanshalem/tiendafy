import { SECTION_REGISTRY, type TestimonialItem } from '@tiendafy/types';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { Field, TextArea, TextInput } from '../../theme-editor-inputs';
import { ItemListEditor } from './ItemListEditor';
import type { SectionEditorProps } from './types';

const MAX_ITEMS = SECTION_REGISTRY.testimonials.fields.items.max;

export function TestimonialsEditor({ data, set }: SectionEditorProps<'testimonials'>) {
  return (
    <>
      <Field label="Título">
        <TextInput
          value={data.title}
          onChange={(v) => set({ title: v })}
          placeholder="Lo que dicen nuestros clientes"
        />
      </Field>
      <ItemListEditor<TestimonialItem>
        items={data.items}
        onChange={(items) => set({ items })}
        max={MAX_ITEMS}
        addLabel="Agregar testimonio"
        listLabel="Testimonios"
        createItem={() => ({ quote: '', name: '', detail: '', photo: '' })}
        renderItem={(t, update) => (
          <>
            <Field label="Opinión">
              <TextArea value={t.quote} onChange={(v) => update({ quote: v })} />
            </Field>
            <TextInput
              value={t.name}
              onChange={(v) => update({ name: v })}
              placeholder="Nombre (ej. Laura G.)"
            />
            <TextInput
              value={t.detail}
              onChange={(v) => update({ detail: v })}
              placeholder="Detalle (ej. Compró en CABA) — opcional"
            />
            <Field label="Foto (opcional)">
              <MediaUpload
                kind="testimonialPhoto"
                value={t.photo}
                onChange={(url) => update({ photo: url })}
              />
            </Field>
          </>
        )}
      />
      <p className="text-xs text-fg-subtle">
        Consejo: usá opiniones reales (de WhatsApp o Instagram, con permiso). Cortas y concretas convencen
        más.
      </p>
    </>
  );
}
