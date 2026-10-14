import { SECTION_REGISTRY, type TestimonialItem, type TestimonialsData } from '@tiendafy/types';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { Field, Select, TextArea, TextInput } from '../../theme-editor-inputs';
import { ChoiceGroup, LayoutIcon } from './choice-group';
import { ItemListEditor } from './ItemListEditor';
import type { SectionEditorProps } from './types';

const MAX_ITEMS = SECTION_REGISTRY.testimonials.fields.items.max;

const RATINGS: { value: TestimonialItem['rating']; label: string }[] = [
  { value: 'none', label: 'Sin estrellas' },
  { value: '5', label: '★★★★★ (5)' },
  { value: '4', label: '★★★★ (4)' },
  { value: '3', label: '★★★ (3)' },
  { value: '2', label: '★★ (2)' },
  { value: '1', label: '★ (1)' },
];

export function TestimonialsEditor({ data, set }: SectionEditorProps<'testimonials'>) {
  return (
    <>
      <Field label="Título" hint="Dejalo vacío para no mostrar título.">
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
        createItem={() => ({ quote: '', name: '', detail: '', photo: '', rating: 'none' })}
        itemTitle={(t) => t.name.trim() || t.quote.trim().slice(0, 40)}
        renderItem={(t, update) => (
          <>
            <Field label="Opinión" hint="Los saltos de línea se respetan en la tienda.">
              <TextArea value={t.quote} onChange={(v) => update({ quote: v })} />
            </Field>
            <Field label="Estrellas">
              <Select
                value={t.rating}
                onChange={(v) => update({ rating: v as TestimonialItem['rating'] })}
                options={RATINGS}
              />
            </Field>
            <Field label="Nombre">
              <TextInput value={t.name} onChange={(v) => update({ name: v })} placeholder="Laura G." />
            </Field>
            <Field label="Detalle (opcional)">
              <TextInput
                value={t.detail}
                onChange={(v) => update({ detail: v })}
                placeholder="Compró en CABA"
              />
            </Field>
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
      <ChoiceGroup
        label="Cómo se muestran"
        value={data.layout}
        onChange={(layout: TestimonialsData['layout']) => set({ layout })}
        options={[
          { value: 'grid', label: 'Grilla', icon: <LayoutIcon layout="grid" /> },
          {
            value: 'carousel',
            label: 'Carrusel',
            title: 'Carrusel (se deslizan)',
            icon: <LayoutIcon layout="carousel" />,
          },
        ]}
      />
      <p className="text-xs text-fg-subtle">
        Consejo: usá opiniones reales (de WhatsApp o Instagram, con permiso). Cortas y concretas convencen
        más.
      </p>
    </>
  );
}
