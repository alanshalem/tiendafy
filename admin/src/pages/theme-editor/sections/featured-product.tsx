import { Check, Field, Select, TextInput } from '../../theme-editor-inputs';
import { ChoiceGroup, SideIcon } from './choice-group';
import { SingleProductPicker } from './section-pickers';
import type { SectionEditorProps } from './types';

export function FeaturedProductEditor({ data, set }: SectionEditorProps<'featured-product'>) {
  return (
    <>
      <Field label="Producto">
        <SingleProductPicker
          value={data.productId}
          onChange={(productId) => set({ productId })}
          emptyHint="Si no elegís ninguno, se muestra el más vendido."
        />
      </Field>
      <Field label="Etiqueta" hint="Un texto corto arriba del nombre. Vacío = sin etiqueta.">
        <TextInput value={data.badge} onChange={(v) => set({ badge: v })} placeholder="Elegido del mes" />
      </Field>
      <ChoiceGroup
        label="Foto en computadora"
        hint="En celulares va arriba del nombre."
        value={data.layout}
        onChange={(layout) => set({ layout })}
        options={[
          {
            value: 'image-left',
            label: 'Izquierda',
            title: 'A la izquierda',
            icon: <SideIcon image="left" />,
          },
          { value: 'image-right', label: 'Derecha', title: 'A la derecha', icon: <SideIcon image="right" /> },
        ]}
      />
      <Field label="Botón">
        <Select
          value={data.button}
          onChange={(v) => set({ button: v as typeof data.button })}
          options={[
            { value: 'cart', label: 'Agregar al carrito' },
            { value: 'link', label: 'Ver producto' },
          ]}
        />
      </Field>
      <Check
        label="Mostrar un resumen de la descripción"
        checked={data.showDescription}
        onChange={(v) => set({ showDescription: v })}
      />
      <p className="rounded-md bg-bg-muted p-2.5 text-xs text-fg-muted">
        Si el producto tiene varios talles o colores, el botón lleva a su página para elegir.
      </p>
    </>
  );
}
