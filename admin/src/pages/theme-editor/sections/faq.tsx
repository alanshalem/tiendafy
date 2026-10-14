import { SECTION_REGISTRY, type FaqItem } from '@tiendafy/types';
import { Check, Field, TextArea, TextInput } from '../../theme-editor-inputs';
import { ItemListEditor } from './ItemListEditor';
import type { SectionEditorProps } from './types';

const MAX_ITEMS = SECTION_REGISTRY.faq.fields.items.max;

export function FaqEditor({ data, set }: SectionEditorProps<'faq'>) {
  return (
    <>
      <Field label="Título" hint="Dejalo vacío para no mostrar título.">
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
        itemTitle={(f) => f.question.trim()}
        renderItem={(f, update) => (
          <>
            <Field label="Pregunta">
              <TextInput
                value={f.question}
                onChange={(v) => update({ question: v })}
                placeholder="¿Hacen envíos a todo el país?"
              />
            </Field>
            <Field label="Respuesta" hint="Los saltos de línea se respetan en la tienda.">
              <TextArea value={f.answer} onChange={(v) => update({ answer: v })} />
            </Field>
            {(!f.question.trim() || !f.answer.trim()) && (
              <p className="text-xs text-warning">Sin pregunta y respuesta no se muestra en la tienda.</p>
            )}
          </>
        )}
      />
      <Check
        label="Mostrar la primera pregunta abierta"
        checked={data.openFirst}
        onChange={(v) => set({ openFirst: v })}
      />
      <p className="text-xs text-fg-subtle">
        Respondé acá lo que te preguntan siempre por WhatsApp: envíos, cambios, talles, medios de pago.
      </p>
    </>
  );
}
