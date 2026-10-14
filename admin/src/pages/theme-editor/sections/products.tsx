import { SECTION_REGISTRY } from '@tiendafy/types';
import { Check, Field, TextInput } from '../../theme-editor-inputs';
import { ProductPicker } from '../../theme-editor-pickers';
import type { SectionEditorProps } from './types';

/** Destacados, recién llegados y ofertas: el mismo editor (cambia el título por defecto). */
export function ProductsEditor({
  section,
  data,
  set,
}: SectionEditorProps<'featured' | 'new-products' | 'sale-products'>) {
  const type = section.type as 'featured' | 'new-products' | 'sale-products';
  return (
    <>
      <Check
        label="Mostrar productos dentro de un carrusel"
        checked={data.carousel}
        onChange={(v) => set({ carousel: v })}
      />
      <Field label="Título">
        <TextInput
          value={data.title}
          onChange={(v) => set({ title: v })}
          placeholder={SECTION_REGISTRY[type].fields.title.fallback}
        />
      </Field>
      <Field label="Productos a mostrar">
        <ProductPicker value={data.productIds} onChange={(productIds) => set({ productIds })} />
      </Field>
    </>
  );
}
