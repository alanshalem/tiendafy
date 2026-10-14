import { SECTION_REGISTRY, type InfoItemData } from '@tiendafy/types';
import { Field, Select, TextInput } from '../../theme-editor-inputs';
import { ItemListEditor } from './ItemListEditor';
import type { SectionEditorProps } from './types';

const INFO_ICONS: { value: InfoItemData['icon']; label: string }[] = [
  { value: 'shipping', label: 'Envíos' },
  { value: 'card', label: 'Tarjetas de crédito' },
  { value: 'security', label: 'Seguridad' },
  { value: 'gift', label: 'Regalo / Promo' },
  { value: 'support', label: 'Atención' },
  { value: 'returns', label: 'Cambios' },
];

const MAX_ITEMS = SECTION_REGISTRY['info-bar'].fields.items.max;
/** Sin ítems cargados la tienda muestra los tres de siempre: se editan a partir de esos. */
const STARTING_ITEMS = SECTION_REGISTRY['info-bar'].defaults.items ?? [];

export function InfoBarEditor({ data, set }: SectionEditorProps<'info-bar'>) {
  const items = data.items.length > 0 ? data.items : STARTING_ITEMS.map((i) => ({ ...i }));
  return (
    <ItemListEditor<InfoItemData>
      items={items}
      onChange={(next) => set({ items: next })}
      max={MAX_ITEMS}
      addLabel="Agregar ítem"
      listLabel="Ítems de la barra"
      createItem={() => ({ icon: 'shipping', title: '', description: '', link: '' })}
      renderItem={(it, update) => (
        <>
          <Field label="Ícono">
            <Select
              value={it.icon}
              onChange={(v) => update({ icon: v as InfoItemData['icon'] })}
              options={INFO_ICONS}
            />
          </Field>
          <TextInput value={it.title} onChange={(v) => update({ title: v })} placeholder="Título" />
          <TextInput
            value={it.description}
            onChange={(v) => update({ description: v })}
            placeholder="Descripción"
          />
          <TextInput value={it.link} onChange={(v) => update({ link: v })} placeholder="Link (opcional)" />
        </>
      )}
    />
  );
}
