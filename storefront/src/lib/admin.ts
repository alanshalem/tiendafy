import { runtimeValue } from './runtime';

/**
 * Dónde vive el panel de administración. Un solo valor para las dos cosas que
 * lo necesitan: el link "Entrar al panel" de la portada y la validación de los
 * mensajes del editor de tienda (que exige comparar contra el origin exacto).
 *
 * Antes eran dos variables distintas para el mismo dato — y la del link ni
 * siquiera se seteaba en producción, así que el botón principal de la portada
 * mandaba al visitante a su propia máquina (localhost).
 *
 * Se lee en CADA llamada, no al cargar el módulo (lo mismo que apiUrl en
 * lib/api-client): era una constante y, si un chunk se evaluaba antes que el
 * <script> que inyecta la config, quedaba fijo el default de desarrollo y la
 * vista previa dejaba de hablar con el editor.
 */
export function adminOrigin(): string {
  return runtimeValue('adminOrigin');
}
