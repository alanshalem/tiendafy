import { useCallback, useMemo } from 'react';
import { useListParams } from '../../lib/useListParams';
import { defaultStatsRange } from './StatsToolbar';

type StatsRange = ReturnType<typeof defaultStatsRange>;

/** Período y página de una pantalla de estadísticas, en la URL (ver useListParams). */
const RANGE_DEFAULTS = { rango: '', desde: '', hasta: '', pagina: 1 };

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * El período elegido en una pantalla de estadísticas, guardado en la URL: al
 * recargar o volver no se pierde, y "las ventas de este mes" se puede mandar
 * como link. Un período predefinido ("Últimos 30 días") se guarda por nombre
 * y se recalcula al abrir; uno personalizado, con sus fechas.
 *
 * Cambiar el período vuelve a la página 1 de la tabla (antes, en
 * Rentabilidad, quedaba en la página en que estaba aunque ya no existiera).
 */
export function useStatsRange(defaultPreset?: string) {
  const { values, set } = useListParams(RANGE_DEFAULTS);
  const { rango, desde, hasta, pagina } = values;

  const range = useMemo<StatsRange>(
    () =>
      rango === 'Personalizado' && isDay(desde) && isDay(hasta)
        ? { preset: rango, from: desde, to: hasta }
        : defaultStatsRange(rango || defaultPreset),
    [rango, desde, hasta, defaultPreset],
  );

  const setRange = useCallback(
    (r: StatsRange) =>
      set(
        r.preset === 'Personalizado'
          ? { rango: r.preset, desde: r.from, hasta: r.to }
          : { rango: r.preset, desde: '', hasta: '' },
      ),
    [set],
  );

  const setPage = useCallback((p: number) => set({ pagina: p }), [set]);

  return { range, setRange, page: pagina, setPage };
}
