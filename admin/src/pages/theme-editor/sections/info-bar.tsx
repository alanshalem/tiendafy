import { SECTION_REGISTRY, type InfoBarData, type InfoItemData } from '@tiendafy/types';
import { LinkPicker } from '../../../components/LinkPicker';
import { MediaUpload } from '../../../components/upload/MediaUpload';
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
const iconLabel = (icon: string) => INFO_ICONS.find((i) => i.value === icon)?.label ?? 'Ítem';

const LAYOUTS: { value: InfoBarData['mobileLayout']; label: string }[] = [
  { value: 'stack', label: 'Uno abajo del otro' },
  { value: 'grid', label: 'De a dos' },
  { value: 'carousel', label: 'Deslizables (carrusel)' },
];

const MAX_ITEMS = SECTION_REGISTRY['info-bar'].fields.items.max;
/**
 * Sin ítems cargados la tienda muestra estos mismos (los del registro): se
 * editan a partir de ellos, así tocar un ícono no borra los títulos que se
 * veían.
 */
const STARTING_ITEMS = SECTION_REGISTRY['info-bar'].defaults.items ?? [];

export function InfoBarEditor({ data, set }: SectionEditorProps<'info-bar'>) {
  const items = data.items.length > 0 ? data.items : STARTING_ITEMS.map((i) => ({ ...i }));
  return (
    <>
      <ItemListEditor<InfoItemData>
        items={items}
        onChange={(next) => set({ items: next })}
        max={MAX_ITEMS}
        addLabel="Agregar ítem"
        listLabel="Ítems de la barra"
        createItem={() => ({ icon: 'shipping', title: '', description: '', link: '', image: '' })}
        // Sin título, el ítem se nombra por su ícono ("Envíos"), no "Ítem 3".
        itemTitle={(it) => it.title.trim() || iconLabel(it.icon)}
        renderItem={(it, update) => (
          <>
            <Field label="Ícono">
              <Select
                value={it.icon}
                onChange={(v) => update({ icon: v as InfoItemData['icon'] })}
                options={INFO_ICONS}
              />
            </Field>
            <Field label="Ícono propio (opcional)" hint="Si subís uno, reemplaza al de la lista.">
              <MediaUpload kind="infoIcon" value={it.image} onChange={(url) => update({ image: url })} />
            </Field>
            <Field label="Título">
              <TextInput
                value={it.title}
                onChange={(v) => update({ title: v })}
                placeholder="Envíos a todo el país"
              />
            </Field>
            <Field label="Descripción (opcional)">
              <TextInput
                value={it.description}
                onChange={(v) => update({ description: v })}
                placeholder="Llega en 24 a 72 h"
              />
            </Field>
            <LinkPicker label="Link (opcional)" value={it.link} onChange={(href) => update({ link: href })} />
          </>
        )}
      />
      <Field label="En el celular">
        <Select
          value={data.mobileLayout}
          onChange={(v) => set({ mobileLayout: v as InfoBarData['mobileLayout'] })}
          options={LAYOUTS}
        />
      </Field>
    </>
  );
}
