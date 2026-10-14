import type { BannerRatio, Overlay, TextPosition } from '@tiendafy/types';
import { Field, TextInput } from '../../theme-editor-inputs';
import { ChoiceGroup, ColumnsIcon, RatioIcon } from './choice-group';
import { CheckRow, EditorWarning, OverlayField, PositionPicker, RATIO_LABEL } from './image-fields';

/*
 * Lo común a los banners de promo y de categorías: título de la sección,
 * columnas por dispositivo, proporción, ancho y el texto sobre la foto.
 */

interface GridData {
  title: string;
  fullWidth: boolean;
  columns: string;
  columnsMobile: string;
  ratio: BannerRatio;
  textPosition: TextPosition;
  overlay: Overlay;
}

/** Las columnas como dibujitos ("3" → tres barras), con "por fila" para el lector de pantalla. */
export const columnChoices = (values: readonly string[]) =>
  values.map((n) => ({
    value: n,
    label: n,
    title: `${n} por fila`,
    icon: <ColumnsIcon n={Number(n)} />,
  }));

const ratioChoice = (r: string) => ({
  value: r,
  label: r.replace('x', ':'),
  title: RATIO_LABEL[r] ?? r,
  icon: <RatioIcon ratio={r} />,
});

export function BannerGridFields<D extends GridData>({
  data,
  set,
  columns,
  ratios,
  mobileRatio,
}: {
  data: D;
  set: (patch: Partial<D>) => void;
  /** Las opciones de columnas en computadora. */
  columns: readonly string[];
  ratios: readonly BannerRatio[];
  /** Otra forma para el celular (solo los banners de promo la tienen). */
  mobileRatio?: { value: string; onChange: (v: string) => void };
}) {
  return (
    <>
      <Field label="Título de la sección (opcional)">
        <TextInput value={data.title} onChange={(v) => set({ title: v } as Partial<D>)} />
      </Field>
      <ChoiceGroup
        label="Por fila en computadora"
        value={data.columns}
        onChange={(v) => set({ columns: v } as Partial<D>)}
        options={columnChoices(columns)}
        columns={columns.length}
      />
      <ChoiceGroup
        label="Por fila en celular"
        value={data.columnsMobile}
        onChange={(v) => set({ columnsMobile: v } as Partial<D>)}
        options={columnChoices(['1', '2'])}
      />
      <ChoiceGroup
        label="Forma de las imágenes"
        hint="La medida recomendada para subir cambia con esto."
        value={data.ratio}
        onChange={(v) => set({ ratio: v } as Partial<D>)}
        options={ratios.map(ratioChoice)}
        columns={4}
      />
      {mobileRatio && (
        <ChoiceGroup
          label="Forma en celular"
          hint="Más alta deja lugar al texto en una pantalla angosta."
          value={mobileRatio.value}
          onChange={mobileRatio.onChange}
          options={[
            { value: 'same', label: 'La misma', title: 'La misma que en computadora' },
            ...ratios.map(ratioChoice),
          ]}
          columns={4}
        />
      )}
      <CheckRow
        label="Extender al ancho de la pantalla"
        checked={data.fullWidth}
        onChange={(v) => set({ fullWidth: v } as Partial<D>)}
      />
      <PositionPicker
        value={data.textPosition}
        onChange={(textPosition) => set({ textPosition } as Partial<D>)}
      />
      <OverlayField value={data.overlay} onChange={(overlay) => set({ overlay } as Partial<D>)} />
      {data.overlay === 'none' && (
        <EditorWarning>Sin oscurecer, el texto blanco puede no leerse sobre fotos claras.</EditorWarning>
      )}
    </>
  );
}
