/** Las marcas diacríticas combinantes (U+0300–U+036F): tildes, diéresis, la virgulilla de la ñ. */
const DIACRITICS = /[\u0300-\u036f]/g;

/**
 * Texto listo para comparar: sin tildes y en minúscula, así "camion" encuentra
 * "Camión" y nadie tiene que acordarse de cómo se escribió algo.
 *
 * Estaba copiado en el buscador de comandos, en el del editor de diseño y
 * adentro del slug de Ayuda. Dos de las copias tenían el rango de tildes
 * escrito con los caracteres combinantes literales, que en el editor no se
 * ven: leer esa regex era adivinar qué matcheaba.
 */
export const foldText = (s: string): string => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
