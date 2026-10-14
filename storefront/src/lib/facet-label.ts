/** Palabras que unen ("amarillo y blanco"): van en minúscula salvo al principio. */
const CONNECTORS = new Set([
  'y',
  'e',
  'o',
  'u',
  'de',
  'del',
  'la',
  'el',
  'con',
  'sin',
  'en',
  'para',
  'por',
  'a',
]);

/**
 * Cómo se MUESTRA un valor de filtro (color, talle, marca, ficha técnica).
 *
 * Cada producto se carga a mano o importado, y el mismo listado ofrecía
 * "AMARILLO" al lado de "Azul". Se muestra parejo, con mayúscula inicial, sin
 * tocar el valor: el filtro sigue mandando el texto exacto, que es con el
 * que se busca.
 *
 * Lo corto en mayúsculas queda como está: "XL", "S", "LED", "USB" son siglas
 * o talles, no palabras gritadas. Lo que ya viene con mayúsculas y minúsculas
 * mezcladas ("iPhone", "McLaren") también: alguien lo escribió así a propósito.
 */
export function facetLabel(value: string): string {
  const letters = value.replace(/[^\p{L}]/gu, '');
  if (!letters) return value;
  const allUpper = letters === letters.toLocaleUpperCase('es');
  const allLower = letters === letters.toLocaleLowerCase('es');
  if (!allUpper && !allLower) return value;

  let seenWord = false;
  return value
    .split(/(\s+|-|\/)/)
    .map((word) => {
      const wordLetters = word.replace(/[^\p{L}]/gu, '');
      if (!wordLetters) return word;
      const lower = word.toLocaleLowerCase('es');
      const leading = !seenWord;
      seenWord = true;
      // "Amarillo y blanco", no "Amarillo Y Blanco": los conectores van en minúscula.
      if (!leading && CONNECTORS.has(lower)) return lower;
      if (allUpper && wordLetters.length <= 3) return word;
      const first = lower.search(/\p{L}/u);
      return lower.slice(0, first) + lower.charAt(first).toLocaleUpperCase('es') + lower.slice(first + 1);
    })
    .join('');
}

/** Pesos enteros con separador de miles ("12.562.922"), para mostrar un precio en un filtro. */
export function formatPesos(amount: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(amount);
}
