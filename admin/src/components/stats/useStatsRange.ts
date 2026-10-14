import { useCallback, useEffect, useMemo } from 'react';
import { useListParams } from '../../lib/useListParams';
import { defaultStatsRange } from './StatsToolbar';

type StatsRange = ReturnType<typeof defaultStatsRange>;

/** Período y página de una pantalla de estadísticas, en la URL (ver useListParams). */
const RANGE_DEFAULTS = { rango: '', desde: '', hasta: '', pagina: 1 };

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** El último período elegido en cualquier pantalla de estadísticas, en la pestaña. */
const STORAGE_KEY = 'tiendafy:stats:rango';

interface Remembered {
  rango: string;
  desde: string;
  hasta: string;
}

function readRemembered(): Remembered | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = new URLSearchParams(raw);
    const rango = p.get('rango') ?? '';
    return rango ? { rango, desde: p.get('desde') ?? '', hasta: p.get('hasta') ?? '' } : null;
  } catch {
    return null; // modo privado o storage bloqueado: sin memoria, igual anda
  }
}

function remember(r: Remembered) {
  try {
    sessionStorage.setItem(STORAGE_KEY, new URLSearchParams({ ...r }).toString());
  } catch {
    // idem: recordar el período es un plus, no una condición
  }
}

/**
 * El período elegido en una pantalla de estadísticas, guardado en la URL: al
 * recargar o volver no se pierde, y "las ventas de este mes" se puede mandar
 * como link. Un período predefinido ("Últimos 30 días") se guarda por nombre
 * y se recalcula al abrir; uno personalizado, con sus fechas.
 *
 * Cambiar el período vuelve a la página 1 de la tabla (antes, en
 * Rentabilidad, quedaba en la página en que estaba aunque ya no existiera).
 *
 * El período es uno solo para todas las pantallas de estadísticas: los links
 * del menú no llevan la query, así que pasar de Visitas a Rentabilidad
 * volvía al período por defecto (y cada pantalla tenía el suyo: 7, 30 o 90
 * días). Ahora el último elegido se recuerda en la pestaña y, si la URL no
 * trae uno, se usa ese y se escribe en la URL (reemplazando, sin sumar una
 * entrada al historial), para que el link siga diciendo qué se está viendo.
 * Lo que trae la URL siempre manda: un link compartido no se pisa.
 */
export function useStatsRange() {
  const { values, set } = useListParams(RANGE_DEFAULTS);
  const { pagina } = values;
  // Se lee en cada render y no una sola vez: volver a tocar en el menú la
  // pantalla en la que ya se está deja la URL sin query sin desmontarla.
  const fallback = values.rango ? null : readRemembered();
  const { rango, desde, hasta } = fallback ?? values;

  // `fallback` es un objeto nuevo en cada render: el efecto depende de su texto.
  const fallbackKey = fallback ? new URLSearchParams({ ...fallback }).toString() : '';
  useEffect(() => {
    if (!fallbackKey) return;
    const p = new URLSearchParams(fallbackKey);
    set(
      { rango: p.get('rango') ?? '', desde: p.get('desde') ?? '', hasta: p.get('hasta') ?? '', pagina },
      { replace: true },
    );
  }, [fallbackKey, pagina, set]);

  useEffect(() => {
    if (values.rango) remember({ rango: values.rango, desde: values.desde, hasta: values.hasta });
  }, [values.rango, values.desde, values.hasta]);

  const range = useMemo<StatsRange>(
    () =>
      rango === 'Personalizado' && isDay(desde) && isDay(hasta)
        ? { preset: rango, from: desde, to: hasta }
        : defaultStatsRange(rango || undefined),
    [rango, desde, hasta],
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
