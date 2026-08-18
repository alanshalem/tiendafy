import { useEffect, useState } from 'react';

/**
 * Valor con retardo: la búsqueda escribe al instante pero el filtro (y las
 * queries que dependen de él) recién se mueven cuando el usuario deja de
 * tipear — evita un fetch por tecla en listas que consultan por página.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
