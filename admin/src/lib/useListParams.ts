import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Filtros, búsqueda, orden y página de un listado, guardados en la URL.
 *
 * Antes vivían en el estado del componente: recargar, volver con «Atrás» o
 * pasarle el link a alguien los perdía, y la persona caía siempre en la página
 * 1 sin filtro. En la URL sobreviven a todo eso y el listado se puede linkear.
 *
 * - `defaults` dice qué parámetros son del listado y de qué tipo (número,
 *   booleano o texto). Un valor igual al default no se escribe: la URL de un
 *   listado sin filtros queda limpia.
 * - Cambiar cualquier filtro vuelve a la página 1 (`pagina`), salvo que el
 *   cambio sea justamente de página.
 * - Cada cambio es una entrada del historial (Atrás deshace el último
 *   filtro); `replace` es para lo que se escribe tecla a tecla, como la
 *   búsqueda, que si no llenaría el historial de "z", "za", "zap"…
 * - Los parámetros que no son del listado (`?order=` de un link, el registro
 *   abierto) se respetan.
 *
 * Con `storageKey`, el listado recuerda sus últimos parámetros en la pestaña
 * (sessionStorage) y los recupera si se vuelve a entrar sin ninguno: volver a
 * "/productos" después de guardar un producto no te deja en la página 1 sin
 * filtros.
 */
export type ListParamValue = string | number | boolean;

/**
 * El parámetro de la página. Cambiar cualquier otro parámetro del listado
 * vuelve a la primera. Una pantalla con dos listados paginados le da a cada
 * uno el suyo (`pageKey`), para que no se pisen `?pagina=`.
 */
const PAGE_KEY = 'pagina';

function parseValue(raw: string | null, fallback: ListParamValue): ListParamValue {
  if (raw === null) return fallback;
  if (typeof fallback === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }
  if (typeof fallback === 'boolean') return raw === '1' || raw === 'true';
  return raw;
}

function encodeValue(value: ListParamValue): string {
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

/** Solo los parámetros del listado, para guardarlos o restaurarlos. */
function pick(params: URLSearchParams, keys: string[]): string {
  const out = new URLSearchParams();
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null) out.set(key, value);
  }
  return out.toString();
}

const STORAGE_PREFIX = 'tiendafy:list:';

function readStored(key: string): string | null {
  try {
    return sessionStorage.getItem(STORAGE_PREFIX + key) || null;
  } catch {
    return null; // modo privado o storage bloqueado: sin memoria, igual anda
  }
}

function writeStored(key: string, value: string) {
  try {
    if (value) sessionStorage.setItem(STORAGE_PREFIX + key, value);
    else sessionStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // idem: recordar es un plus, no una condición
  }
}

export interface ListParams<D extends Record<string, ListParamValue>> {
  values: D;
  /** Cambia uno o más parámetros. Sin `pagina` en el cambio, vuelve a la 1. */
  set: (patch: Partial<D>, options?: { replace?: boolean }) => void;
  /** Saca todos los parámetros del listado (vuelve a los defaults). */
  reset: () => void;
  /** Hay algún filtro o búsqueda puesta (sin contar la página). */
  filtered: boolean;
}

export function useListParams<D extends Record<string, ListParamValue>>(
  defaults: D,
  options: { storageKey?: string | null; pageKey?: string } = {},
): ListParams<D> {
  const { storageKey = null, pageKey = PAGE_KEY } = options;
  const [params, setParams] = useSearchParams();
  const keys = useMemo(() => Object.keys(defaults), [defaults]);
  const hasAny = keys.some((k) => params.has(k));

  // Lo guardado se lee al entrar (o cuando aparece la clave: la tienda activa
  // puede llegar un instante después). Si la URL ya trae parámetros, mandan
  // ellos: un link compartido no se pisa con lo de esta pestaña.
  const pending = () => (storageKey && !hasAny ? readStored(storageKey) : null);
  const [restoreState, setRestoreState] = useState(() => ({ key: storageKey, value: pending() }));
  // Se ajusta al dibujar, no en un efecto: otra clave vuelve a leer, y en
  // cuanto la URL tiene parámetros lo restaurado ya cumplió.
  if (restoreState.key !== storageKey) setRestoreState({ key: storageKey, value: pending() });
  else if (restoreState.value !== null && hasAny) setRestoreState({ key: storageKey, value: null });
  const restore = restoreState.key === storageKey && !hasAny ? restoreState.value : null;

  useEffect(() => {
    if (restore === null) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        new URLSearchParams(restore).forEach((value, key) => next.set(key, value));
        return next;
      },
      { replace: true },
    );
  }, [restore, setParams]);

  const source = useMemo(() => (restore !== null ? new URLSearchParams(restore) : params), [restore, params]);
  const values = useMemo(() => {
    const out: Record<string, ListParamValue> = {};
    for (const key of keys) out[key] = parseValue(source.get(key), defaults[key]!);
    return out as D;
  }, [source, keys, defaults]);

  const listQuery = pick(params, keys);
  useEffect(() => {
    if (!storageKey || restore !== null) return;
    writeStored(storageKey, listQuery);
  }, [storageKey, restore, listQuery]);

  const set = useCallback(
    (patch: Partial<D>, { replace = false }: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === defaults[key] || value === '') next.delete(key);
            else next.set(key, encodeValue(value));
          }
          if (pageKey in defaults && !(pageKey in patch)) next.delete(pageKey);
          return next;
        },
        { replace },
      );
    },
    [defaults, setParams, pageKey],
  );

  const reset = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const key of keys) next.delete(key);
      return next;
    });
  }, [keys, setParams]);

  const filtered = keys.some((k) => k !== pageKey && values[k] !== defaults[k]);

  return { values, set, reset, filtered };
}

/**
 * El texto de un buscador atado a un parámetro de la URL: se escribe al
 * instante (estado local) y la URL —y con ella la consulta al servidor— se
 * actualiza cuando la persona deja de tipear, reemplazando la entrada del
 * historial en vez de sumar una por tecla.
 *
 * Si la URL cambia por fuera (Atrás, "limpiar filtros"), el texto la sigue.
 */
export function useSearchText(
  value: string,
  commit: (text: string) => void,
  delayMs = 350,
): [string, (text: string) => void] {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }

  // Siempre la función del último render, sin que un render cualquiera (llegó
  // la respuesta de la lista) reinicie la espera.
  const latestCommit = useRef(commit);
  useLayoutEffect(() => {
    latestCommit.current = commit;
  });

  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => latestCommit.current(text), delayMs);
    return () => clearTimeout(timer);
  }, [text, value, delayMs]);

  return [text, setText];
}

/**
 * Solo la página, en la URL: para los listados que no tienen filtros. Si una
 * pantalla tiene dos paginados, cada uno lleva su `key` (si no, se pisarían
 * `?pagina=`).
 */
export function usePageParam(key: string = PAGE_KEY): [number, (page: number) => void] {
  const defaults = useMemo(() => ({ [key]: 1 }), [key]);
  const { values, set } = useListParams(defaults, { pageKey: key });
  const setPage = useCallback((page: number) => set({ [key]: page }), [set, key]);
  return [values[key] as number, setPage];
}

/** El buscador de un listado: `useSearchText` sobre el parámetro `key` (por defecto `q`). */
export function useListSearch<D extends Record<string, ListParamValue>>(
  list: ListParams<D>,
  key: keyof D & string = 'q',
  delayMs?: number,
) {
  const { set } = list;
  return useSearchText(
    String(list.values[key]),
    (text) => set({ [key]: text } as Partial<D>, { replace: true }),
    delayMs,
  );
}

/**
 * El registro abierto de una pantalla con listado y ficha (una compra, un
 * presupuesto, un proveedor) como parámetro de la URL: `?orden=<id>`.
 *
 * Así «Atrás» cierra la ficha en vez de sacarte del módulo, recargar no la
 * cierra y el registro se puede linkear desde otra pantalla. Abrir suma una
 * entrada al historial; cerrar vuelve atrás si la ficha se abrió desde acá, o
 * reemplaza la entrada si se llegó directo por un link (para no sacar a la
 * persona de la app).
 */
export function useRecordParam(name: string) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const id = params.get(name);
  const marker = `opened:${name}`;

  /** El `search` (con el resto de los parámetros) que abre ese registro, para un <Link>. */
  const searchFor = useCallback(
    (value: string) => {
      const next = new URLSearchParams(params);
      next.set(name, value);
      return `?${next.toString()}`;
    },
    [params, name],
  );

  const open = useCallback(
    (value: string) => navigate({ search: searchFor(value) }, { state: { [marker]: true } }),
    [navigate, searchFor, marker],
  );

  const openedHere = (location.state as Record<string, unknown> | null)?.[marker] === true;
  const close = useCallback(() => {
    if (openedHere) {
      navigate(-1);
      return;
    }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(name);
        return next;
      },
      { replace: true },
    );
  }, [openedHere, navigate, setParams, name]);

  /** Estado que lleva un <Link> que abre el registro (para que cerrar vuelva atrás). */
  const linkState = useMemo(() => ({ [marker]: true }), [marker]);

  return { id, open, close, searchFor, linkState };
}
