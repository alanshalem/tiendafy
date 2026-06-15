import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../../context/StoreContext';

/**
 * Persistencia de configuración por tienda en localStorage. Mientras no
 * existan los módulos de backend (pagos, envíos, contacto...), esto le da
 * al merchant una experiencia real y persistente. Cada página usa su `key`.
 */
export function useSettings<T>(key: string, initial: T) {
  const { store } = useStore();
  const storageKey = `tiendafy.settings.${store?.id ?? 'none'}.${key}`;
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!store) return;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        setValue({ ...initial, ...JSON.parse(raw) });
      } catch {
        /* ignore */
      }
    } else {
      setValue(initial);
    }
    setLoaded(true);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, store]);

  const update = useCallback((patch: Partial<T>) => {
    setValue((v) => ({ ...v, ...patch }));
    setDirty(true);
  }, []);

  const save = useCallback(() => {
    localStorage.setItem(storageKey, JSON.stringify(value));
    setDirty(false);
  }, [storageKey, value]);

  return { value, update, save, dirty, loaded };
}
