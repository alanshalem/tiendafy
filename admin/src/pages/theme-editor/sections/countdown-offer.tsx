import { Field, Select, TextArea, TextInput, Check } from '../../theme-editor-inputs';
import { LinkPicker } from '../../../components/LinkPicker';
import { DateTimeField, ProductSourceField } from './section-pickers';
import type { SectionEditorProps } from './types';

/**
 * Ofertas con cronómetro. El origen de los productos va en `data.source` y
 * `data.limit` (como destacados y ofertas): no son campos del registro, los
 * resuelve la API. Sin elegir nada, se muestran los que están en oferta.
 */
export function CountdownOfferEditor({ data, set }: SectionEditorProps<'countdown-offer'>) {
  const raw = data as Record<string, unknown>;
  const setRaw = set as (patch: Record<string, unknown>) => void;
  return (
    <>
      <Field label="Título">
        <TextInput
          value={data.title}
          onChange={(v) => set({ title: v })}
          placeholder="Ofertas por tiempo limitado"
        />
      </Field>
      <Field label="Texto">
        <TextArea value={data.text} onChange={(v) => set({ text: v })} />
      </Field>
      <DateTimeField
        label="Termina el"
        value={data.endsAt}
        onChange={(endsAt) => set({ endsAt })}
        hint="El cronómetro cuenta hasta ese momento."
      />
      <Field label="Cuando termina">
        <Select
          value={data.whenEnded}
          onChange={(v) => set({ whenEnded: v as typeof data.whenEnded })}
          options={[
            { value: 'hide', label: 'Ocultar la sección' },
            { value: 'message', label: 'Mostrar un mensaje' },
          ]}
        />
      </Field>
      {data.whenEnded === 'message' && (
        <Field label="Mensaje cuando termina">
          <TextInput value={data.endedText} onChange={(v) => set({ endedText: v })} />
        </Field>
      )}
      <ProductSourceField
        source={raw.source}
        limit={raw.limit}
        fallback={{ kind: 'on-sale' }}
        onChange={(patch) => setRaw(patch)}
      />
      <Check
        label="Mostrar los productos en un carrusel"
        checked={data.carousel}
        onChange={(v) => set({ carousel: v })}
      />
      <Field label="Texto del botón">
        <TextInput
          value={data.buttonText}
          onChange={(v) => set({ buttonText: v })}
          placeholder="Ver todas las ofertas"
        />
      </Field>
      <LinkPicker label="A dónde lleva el botón" value={data.link} onChange={(link) => set({ link })} />
    </>
  );
}
