import { SECTION_REGISTRY, type IconColumnItem } from '@tiendafy/types';
import { MediaUpload } from '../../../components/upload/MediaUpload';
import { LinkPicker } from '../../../components/LinkPicker';
import { Field, Select, TextArea, TextInput } from '../../theme-editor-inputs';
import { ItemListEditor } from './ItemListEditor';
import { NumberField } from './section-pickers';
import type { SectionEditorProps } from './types';

const FIELDS = SECTION_REGISTRY['icon-columns'].fields;

/** Los íconos del kit de la tienda (se dibujan con el estilo de íconos elegido en Diseño). */
const ICONS: { value: IconColumnItem['icon']; label: string }[] = [
  { value: 'shipping', label: 'Envío (camión)' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'security', label: 'Seguridad (escudo)' },
  { value: 'gift', label: 'Regalo' },
  { value: 'support', label: 'Atención (auriculares)' },
  { value: 'returns', label: 'Cambios (flechas)' },
  { value: 'heart', label: 'Corazón' },
  { value: 'cart', label: 'Carrito' },
  { value: 'chat', label: 'Mensaje' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'mail', label: 'Email' },
  { value: 'mapPin', label: 'Ubicación' },
  { value: 'user', label: 'Persona' },
  { value: 'search', label: 'Lupa' },
  { value: 'none', label: 'Sin ícono' },
];

export function IconColumnsEditor({ data, set }: SectionEditorProps<'icon-columns'>) {
  return (
    <>
      <Field label="Título">
        <TextInput value={data.title} onChange={(v) => set({ title: v })} />
      </Field>
      <ItemListEditor<IconColumnItem>
        items={data.items}
        onChange={(items) => set({ items })}
        max={FIELDS.items.max}
        addLabel="Agregar columna"
        listLabel="Columnas"
        createItem={() => ({ icon: 'gift', image: '', title: '', text: '', link: '' })}
        renderItem={(it, update) => (
          <>
            <Field label="Ícono">
              <Select
                value={it.icon}
                onChange={(v) => update({ icon: v as IconColumnItem['icon'] })}
                options={ICONS}
              />
            </Field>
            <Field label="O una imagen propia (opcional)" hint="Si subís una, va en lugar del ícono.">
              <MediaUpload kind="columnIcon" value={it.image} onChange={(image) => update({ image })} />
            </Field>
            <Field label="Título">
              <TextInput value={it.title} onChange={(title) => update({ title })} />
            </Field>
            <Field label="Texto">
              <TextArea value={it.text} onChange={(text) => update({ text })} />
            </Field>
            <LinkPicker label="Link (opcional)" value={it.link} onChange={(link) => update({ link })} />
          </>
        )}
      />
      <NumberField
        label="Columnas en computadora"
        value={data.columnsDesktop}
        min={FIELDS.columnsDesktop.min}
        max={FIELDS.columnsDesktop.max}
        onChange={(columnsDesktop) => set({ columnsDesktop })}
      />
      <Field label="En celular" hint="La alineación (centro o izquierda) está en «Diseño de la sección».">
        <Select
          value={data.mobile}
          onChange={(v) => set({ mobile: v as typeof data.mobile })}
          options={[
            { value: '1', label: 'Una debajo de la otra' },
            { value: '2', label: 'De a dos' },
            { value: 'swipe', label: 'Deslizando de costado' },
          ]}
        />
      </Field>
    </>
  );
}
