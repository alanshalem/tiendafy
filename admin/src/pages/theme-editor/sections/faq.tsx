import { SECTION_REGISTRY, type FaqItem } from '@tiendafy/types';
import { Field, TextArea, TextInput } from '../../theme-editor-inputs';
import { ItemListEditor } from './ItemListEditor';
import type { SectionEditorProps } from './types';

const MAX_ITEMS = SECTION_REGISTRY.faq.fields.items.max;

export function FaqEditor({ data, set }: SectionEditorProps<'faq'>) {
  return (
    <>
      <Field label="Título">
        <TextInput
          value={data.title}
          onChange={(v) => set({ title: v })}
          placeholder="Preguntas frecuentes"
        />
      </Field>
      <ItemListEditor<FaqItem>
        items={data.items}
        onChange={(items) => set({ items })}
        max={MAX_ITEMS}
        addLabel="Agregar pregunta"
        listLabel="Preguntas"
        createItem={() => ({ question: '', answer: '' })}
        renderItem={(f, update) => (
          <>
            <Field label="Pregunta">
              <TextInput
                value={f.question}
                onChange={(v) => update({ question: v })}
                placeholder="¿Hacen envíos a todo el país?"
              />
            </Field>
            <Field label="Respuesta">
              <TextArea value={f.answer} onChange={(v) => update({ answer: v })} />
            </Field>
          </>
        )}
      />
      <p className="text-xs text-fg-subtle">
        Respondé acá lo que te preguntan siempre por WhatsApp: envíos, cambios, talles, medios de pago.
      </p>
    </>
  );
}
