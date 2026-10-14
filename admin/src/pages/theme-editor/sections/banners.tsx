import type { BannerRatio, Overlay, TextPosition } from '@tiendafy/types';
import { Field, Select, TextInput } from '../../theme-editor-inputs';
import { CheckRow, EditorWarning, OverlayField, PositionPicker, ratioOptions } from './image-fields';

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

const perRow = (n: string) => `${n} por fila`;

export function BannerGridFields<D extends GridData>({
  data,
  set,
  columns,
  ratios,
}: {
  data: D;
  set: (patch: Partial<D>) => void;
  /** Las opciones de columnas en computadora. */
  columns: readonly string[];
  ratios: readonly BannerRatio[];
}) {
  return (
    <>
      <Field label="Título de la sección (opcional)">
        <TextInput value={data.title} onChange={(v) => set({ title: v } as Partial<D>)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="En computadora">
          <Select
            value={data.columns}
            onChange={(v) => set({ columns: v } as Partial<D>)}
            options={columns.map((n) => ({ value: n, label: perRow(n) }))}
          />
        </Field>
        <Field label="En celular">
          <Select
            value={data.columnsMobile}
            onChange={(v) => set({ columnsMobile: v } as Partial<D>)}
            options={['1', '2'].map((n) => ({ value: n, label: perRow(n) }))}
          />
        </Field>
      </div>
      <Field label="Forma de las imágenes" hint="La medida recomendada para subir cambia con esto.">
        <Select
          value={data.ratio}
          onChange={(v) => set({ ratio: v } as Partial<D>)}
          options={ratioOptions(ratios)}
        />
      </Field>
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
