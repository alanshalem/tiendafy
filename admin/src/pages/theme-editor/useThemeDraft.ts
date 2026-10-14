import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeTheme, type ThemeConfig } from '@tiendafy/types';
import { api, ApiRequestError, setActiveTenant } from '../../lib/api';
import { emptyHistory, recordEdit, redoEdit, undoEdit, type EditHistory } from './history';

/*
 * El borrador del editor de diseño: carga, autoguardado, versión (para no
 * pisar lo que hizo otra pestaña u otra persona), deshacer/rehacer y
 * publicar. La pantalla (ThemeEditor) solo dibuja lo que esto expone.
 */

/** Mergea el draft cargado sobre los defaults (y lo migra): nunca faltan campos. */
export const withDefaults = (raw: Partial<ThemeConfig> | null): ThemeConfig => normalizeTheme(raw);

/** La versión del borrador que viene con el tema (GET /draft, publicar, restaurar, copiar). */
export function readDraftVersion(raw: unknown): number | undefined {
  const v = (raw as { draftVersion?: unknown } | null)?.draftVersion;
  return typeof v === 'number' && Number.isInteger(v) ? v : undefined;
}

const isConflict = (err: unknown) => err instanceof ApiRequestError && err.status === 409;

export type SaveState = 'saved' | 'saving' | 'error';

/**
 * Lo que dura mientras se edita UNA tienda. Al cambiar de tienda se arranca
 * otra sesión: un guardado que todavía estaba en viaje termina en la tienda
 * de su sesión (con su tenant y su versión), nunca en la nueva.
 */
interface Session {
  storeId: string;
  /** La versión del borrador que conocemos (undefined = el servidor no la informó). */
  version: number | undefined;
  /** El último tema sin guardar (o cuyo guardado falló). */
  pending: ThemeConfig | null;
  inFlight: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
  /** Otro cambió el borrador: el autoguardado espera a que el comercio elija. */
  conflict: boolean;
}

const newSession = (storeId: string): Session => ({
  storeId,
  version: undefined,
  pending: null,
  inFlight: null,
  timer: null,
  conflict: false,
});

/** Pedidos del borrador siempre con el tenant de SU sesión (no el activo en ese momento). */
const tenantInit = (session: Session, init?: RequestInit): RequestInit => ({
  ...init,
  headers: { ...(init?.headers as Record<string, string> | undefined), 'X-Tenant-Id': session.storeId },
});

/** El tema con la versión del borrador sobre la que se editó (el servidor rechaza si cambió). */
const withVersion = (t: ThemeConfig, version: number | undefined) =>
  version === undefined ? t : { ...t, draftVersion: version };

export interface ThemeDraft {
  theme: ThemeConfig | null;
  /** Lo publicado: la base para "hay cambios sin publicar". */
  published: ThemeConfig | null;
  loadError: boolean;
  retryLoad: () => void;
  /** Un cambio del comercio: vista previa + autoguardado + un paso de deshacer. */
  updateTheme: (updater: (t: ThemeConfig) => ThemeConfig) => void;
  /** Un tema que llegó del servidor (restaurar una versión, copiar de otra tienda). */
  applyIncoming: (cfg: Partial<ThemeConfig>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveState: SaveState;
  /** El motivo del último guardado fallido, si el servidor lo explicó (p. ej. un dato inválido). */
  saveError: string | null;
  /** Otra pestaña u otra persona cambió el borrador mientras se editaba. */
  conflict: boolean;
  /** Conflicto: traer lo último del servidor (lo propio queda en el deshacer). */
  reloadLatest: () => Promise<void>;
  /** Conflicto: guardar lo de esta pestaña encima de lo otro. */
  saveMineAnyway: () => Promise<void>;
  /** Mandar ya el guardado pendiente (cerrar, cambiar de tienda, reintentar). */
  flushDraft: (init?: RequestInit) => Promise<void>;
  /** Publicar lo que se ve. Tira si falla (el conflicto lo muestra el banner). */
  publish: () => Promise<void>;
  /** Volver el borrador a lo publicado (se puede deshacer). */
  discard: () => Promise<void>;
}

/**
 * @param storeId la tienda que se edita (null = ninguna elegida).
 * @param onThemeChange se llama con cada tema nuevo (para la vista previa).
 */
export function useThemeDraft(
  storeId: string | null,
  onThemeChange: (theme: ThemeConfig) => void,
): ThemeDraft {
  const [theme, setThemeState] = useState<ThemeConfig | null>(null);
  const [published, setPublished] = useState<ThemeConfig | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [historyFlags, setHistoryFlags] = useState({ canUndo: false, canRedo: false });

  const themeRef = useRef<ThemeConfig | null>(null);
  const historyRef = useRef<EditHistory>(emptyHistory());
  const sessionRef = useRef<Session>(newSession(storeId ?? ''));
  const onChangeRef = useRef(onThemeChange);
  useEffect(() => {
    onChangeRef.current = onThemeChange;
  });

  // Otra tienda (o reintentar): se vacía el editor en el mismo render, y el
  // efecto de abajo pide lo nuevo.
  const loadFor = storeId ? `${storeId}:${loadKey}` : null;
  const [resetFor, setResetFor] = useState<string | null>(null);
  if (loadFor && resetFor !== loadFor) {
    setResetFor(loadFor);
    setThemeState(null);
    setPublished(null);
    setLoadError(false);
    setConflict(false);
    setSaveState('saved');
    setSaveError(null);
    setHistoryFlags({ canUndo: false, canRedo: false });
  }

  const syncHistory = useCallback(() => {
    const h = historyRef.current;
    setHistoryFlags({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
  }, []);

  const setTheme = useCallback((next: ThemeConfig) => {
    themeRef.current = next;
    setThemeState(next);
    onChangeRef.current(next);
  }, []);

  const markConflict = useCallback((session: Session) => {
    session.conflict = true;
    if (session === sessionRef.current) {
      setConflict(true);
      setSaveState('error');
    }
  }, []);

  // Un guardado a la vez: con dos PUT en viaje, el segundo llevaría una versión
  // vieja y chocaría contra el primero (un conflicto con uno mismo).
  const runSave = useMemo(() => {
    const run = (session: Session, init?: RequestInit): Promise<void> => {
      if (session.inFlight)
        return session.inFlight.then(() => (session.pending ? run(session, init) : undefined));
      const next = session.pending;
      if (!next || session.conflict) return Promise.resolve();
      const current = session === sessionRef.current;
      if (current) setSaveState('saving');
      const flight = api
        .put<{ draftVersion?: number } | undefined>(
          '/api/v1/theme/draft',
          withVersion(next, session.version),
          tenantInit(session, init),
        )
        .then((res) => {
          const v = readDraftVersion(res);
          if (v !== undefined) session.version = v;
          if (session.pending === next) {
            session.pending = null;
            if (session === sessionRef.current) {
              setSaveState('saved');
              setSaveError(null);
            }
          }
        })
        .catch((err: unknown) => {
          if (isConflict(err)) return markConflict(session);
          if (session.pending === next && session === sessionRef.current) {
            setSaveState('error');
            setSaveError(err instanceof ApiRequestError && err.explained ? err.message : null);
          }
        })
        .finally(() => {
          session.inFlight = null;
        });
      session.inFlight = flight;
      return flight;
    };
    return run;
  }, [markConflict]);

  const scheduleSave = useCallback(
    (next: ThemeConfig) => {
      const session = sessionRef.current;
      session.pending = next;
      if (session.conflict) return; // se guarda cuando el comercio elija qué hacer
      setSaveState('saving');
      if (session.timer) clearTimeout(session.timer);
      session.timer = setTimeout(() => {
        session.timer = null;
        void runSave(session);
      }, 600);
    },
    [runSave],
  );

  const flushDraft = useCallback(
    (init?: RequestInit) => {
      const session = sessionRef.current;
      if (session.timer) {
        clearTimeout(session.timer);
        session.timer = null;
      }
      if (!session.pending || session.conflict) return Promise.resolve();
      // Al cerrar la pestaña no se puede esperar al guardado en viaje: el de
      // ahora sale ya (keepalive) con la versión que va a tener el borrador
      // cuando el anterior termine.
      if (init?.keepalive && session.inFlight) {
        const predicted = session.version === undefined ? undefined : session.version + 1;
        return api
          .put('/api/v1/theme/draft', withVersion(session.pending, predicted), tenantInit(session, init))
          .then(
            () => undefined,
            () => undefined,
          );
      }
      return runSave(session, init);
    },
    [runSave],
  );

  // Cargar draft + publicado. Seteamos el tenant explícitamente para evitar
  // la race con el efecto de StoreContext (efectos hijos corren primero).
  // Lo que llega de una tienda anterior se descarta.
  useEffect(() => {
    if (!storeId) return;
    let current = true;
    setActiveTenant(storeId);
    const session = newSession(storeId);
    sessionRef.current = session;
    historyRef.current = emptyHistory();
    themeRef.current = null;
    Promise.all([
      api.get<Partial<ThemeConfig>>('/api/v1/theme/draft'),
      api.get<Partial<ThemeConfig>>('/api/v1/theme'),
    ])
      .then(([d, p]) => {
        if (!current) return;
        session.version = readDraftVersion(d);
        const t = withDefaults(d);
        themeRef.current = t;
        setThemeState(t);
        setPublished(withDefaults(p));
      })
      .catch(() => {
        if (!current) return;
        setLoadError(true);
      });
    return () => {
      current = false;
    };
  }, [storeId, loadKey]);

  const updateTheme = useCallback(
    (updater: (t: ThemeConfig) => ThemeConfig) => {
      const prev = themeRef.current;
      if (!prev) return;
      const next = updater(prev);
      if (next === prev) return;
      historyRef.current = recordEdit(historyRef.current, prev, next, Date.now());
      syncHistory();
      setTheme(next);
      scheduleSave(next);
    },
    [scheduleSave, setTheme, syncHistory],
  );

  /** Reemplazo entero (otra versión, descartar, recargar): un paso propio del deshacer. */
  const replaceTheme = useCallback(
    (next: ThemeConfig, { save }: { save: boolean }) => {
      const prev = themeRef.current;
      if (prev && prev !== next) {
        historyRef.current = { ...recordEdit(historyRef.current, prev, next, Date.now()), lastKey: null };
        syncHistory();
      }
      setTheme(next);
      if (save) scheduleSave(next);
    },
    [scheduleSave, setTheme, syncHistory],
  );

  const applyIncoming = useCallback(
    (cfg: Partial<ThemeConfig>) => {
      // Restaurar y copiar ya cambiaron el borrador en el servidor: su versión es la nueva.
      const v = readDraftVersion(cfg);
      if (v !== undefined) sessionRef.current.version = v;
      replaceTheme(withDefaults(cfg), { save: true });
    },
    [replaceTheme],
  );

  const step = useCallback(
    (fn: typeof undoEdit) => {
      const current = themeRef.current;
      if (!current) return;
      const r = fn(historyRef.current, current);
      if (!r) return;
      historyRef.current = r.history;
      syncHistory();
      setTheme(r.theme);
      scheduleSave(r.theme);
    },
    [scheduleSave, setTheme, syncHistory],
  );
  const undo = useCallback(() => step(undoEdit), [step]);
  const redo = useCallback(() => step(redoEdit), [step]);

  const fetchLatest = useCallback(async (session: Session) => {
    const raw = await api.get<Partial<ThemeConfig>>('/api/v1/theme/draft');
    session.version = readDraftVersion(raw);
    return raw;
  }, []);

  const reloadLatest = useCallback(async () => {
    const session = sessionRef.current;
    const raw = await fetchLatest(session);
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
    session.pending = null;
    session.conflict = false;
    setConflict(false);
    setSaveState('saved');
    setSaveError(null);
    replaceTheme(withDefaults(raw), { save: false });
  }, [fetchLatest, replaceTheme]);

  const saveMineAnyway = useCallback(async () => {
    const session = sessionRef.current;
    await fetchLatest(session);
    session.conflict = false;
    setConflict(false);
    session.pending = themeRef.current;
    await runSave(session);
  }, [fetchLatest, runSave]);

  const publish = useCallback(async () => {
    const session = sessionRef.current;
    const t = themeRef.current;
    if (!t) return;
    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }
    // Que el guardado en viaje termine: si no, publicar llevaría una versión vieja.
    if (session.inFlight) await session.inFlight;
    try {
      const res = await api.post<unknown>('/api/v1/theme/publish', withVersion(t, session.version));
      const v = readDraftVersion(res);
      if (v !== undefined) session.version = v;
    } catch (err) {
      if (isConflict(err)) markConflict(session);
      throw err;
    }
    setPublished(t); // nuevo baseline → "Publicar" se desactiva hasta el próximo cambio
    // Publicar persiste también el borrador: no queda nada pendiente (salvo
    // que se haya seguido editando mientras viajaba).
    if (session.pending === null || session.pending === t) {
      session.pending = null;
      setSaveState('saved');
      setSaveError(null);
    } else {
      scheduleSave(session.pending);
    }
  }, [markConflict, scheduleSave]);

  const discard = useCallback(async () => {
    const session = sessionRef.current;
    const pub = withDefaults(await api.get<Partial<ThemeConfig>>('/api/v1/theme'));
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
    if (session.inFlight) await session.inFlight;
    replaceTheme(pub, { save: false });
    session.pending = pub;
    await runSave(session);
    if (session.pending) throw new Error('No se pudo descartar');
  }, [replaceTheme, runSave]);

  // Al cerrar la pestaña / desmontar: flushear el draft pendiente (keepalive
  // deja terminar el PUT aunque la página muera). Solo frenamos la navegación
  // con el diálogo nativo si hay riesgo real de pérdida (falló o hay conflicto).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const session = sessionRef.current;
      if (!session.pending) return;
      void flushDraft({ keepalive: true });
      if (session.conflict || (!session.inFlight && !session.timer)) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      void flushDraft({ keepalive: true }); // unmount (navegar dentro del admin)
    };
  }, [flushDraft]);

  return {
    theme,
    published,
    loadError,
    retryLoad: () => setLoadKey((k) => k + 1),
    updateTheme,
    applyIncoming,
    undo,
    redo,
    canUndo: historyFlags.canUndo,
    canRedo: historyFlags.canRedo,
    saveState,
    saveError,
    conflict,
    reloadLatest,
    saveMineAnyway,
    flushDraft,
    publish,
    discard,
  };
}
