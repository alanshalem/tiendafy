import type { ThemeConfig } from '@tiendafy/types';

/*
 * Historial de deshacer/rehacer del editor de diseño.
 *
 * Antes cada tecla era un paso: escribir un título de 30 letras y querer
 * volver atrás eran 30 Ctrl+Z, y el tope de 50 se comía cualquier cosa
 * hecha cinco minutos antes. Ahora las ediciones seguidas al MISMO campo
 * (el mismo texto, el mismo color, la misma sección) dentro de un segundo
 * se juntan en un solo paso. Lo estructural (agregar, quitar, mover una
 * sección, cargar otra versión) siempre es un paso propio.
 */

export const UNDO_LIMIT = 100;
const COALESCE_MS = 1000;

export interface EditHistory {
  past: ThemeConfig[];
  future: ThemeConfig[];
  /** El campo de la última edición y cuándo fue (para juntar las seguidas). */
  lastKey: string | null;
  lastAt: number;
}

export const emptyHistory = (): EditHistory => ({ past: [], future: [], lastKey: null, lastAt: 0 });

const changedKeys = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Qué campo tocó una edición, como texto ("colors.primary",
 * "sections:faq-1:items"). `null` = no es la edición de un solo campo (o es
 * estructural) y no se junta con ninguna otra.
 *
 * Se deduce comparando referencias: los paneles cambian el tema copiando solo
 * lo que tocan ({ ...t, header: { ...t.header, bg } }), así que lo que no se
 * tocó conserva su referencia.
 */
export function editKey(prev: ThemeConfig, next: ThemeConfig): string | null {
  const top = changedKeys(
    prev as unknown as Record<string, unknown>,
    next as unknown as Record<string, unknown>,
  );
  if (top.length !== 1) return null;
  const key = top[0]!;
  if (key === 'sections') {
    const a = prev.sections;
    const b = next.sections;
    if (a.length !== b.length || a.some((s, i) => s.id !== b[i]!.id)) return null; // alta, baja o movida
    const touched = b.filter((s, i) => s !== a[i]);
    if (touched.length !== 1) return null;
    const after = touched[0]!;
    const before = a.find((s) => s.id === after.id)!;
    const envelope = changedKeys(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    if (envelope.length !== 1) return null;
    if (envelope[0] !== 'data') return `sections:${after.id}:${envelope[0]}`;
    const fields = changedKeys(before.data, after.data);
    return fields.length === 1 ? `sections:${after.id}:data.${fields[0]}` : null;
  }
  const a = (prev as unknown as Record<string, unknown>)[key];
  const b = (next as unknown as Record<string, unknown>)[key];
  if (isObject(a) && isObject(b)) {
    const sub = changedKeys(a, b);
    return sub.length === 1 ? `${key}.${sub[0]}` : null;
  }
  return key;
}

/** Anota una edición en el historial (o la junta con la anterior si es el mismo campo). */
export function recordEdit(
  history: EditHistory,
  prev: ThemeConfig,
  next: ThemeConfig,
  now: number,
): EditHistory {
  const key = editKey(prev, next);
  const coalesce = key !== null && key === history.lastKey && now - history.lastAt <= COALESCE_MS;
  // Si se junta, el paso que ya está guardado (el estado antes de la ráfaga) alcanza.
  const past =
    coalesce || history.past.at(-1) === prev ? history.past : [...history.past, prev].slice(-UNDO_LIMIT);
  return { past, future: [], lastKey: key, lastAt: now };
}

/** Deshace: devuelve el estado anterior y el historial nuevo, o `null` si no hay nada. */
export function undoEdit(
  history: EditHistory,
  current: ThemeConfig,
): { theme: ThemeConfig; history: EditHistory } | null {
  const theme = history.past.at(-1);
  if (!theme) return null;
  return {
    theme,
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, current],
      lastKey: null,
      lastAt: 0,
    },
  };
}

/** Rehace lo último que se deshizo. */
export function redoEdit(
  history: EditHistory,
  current: ThemeConfig,
): { theme: ThemeConfig; history: EditHistory } | null {
  const theme = history.future.at(-1);
  if (!theme) return null;
  return {
    theme,
    history: {
      past: [...history.past, current].slice(-UNDO_LIMIT),
      future: history.future.slice(0, -1),
      lastKey: null,
      lastAt: 0,
    },
  };
}
