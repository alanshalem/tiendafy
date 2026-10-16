/**
 * Clases de formularios repetidas literalmente en varios componentes de la
 * tienda.
 */

/**
 * La superficie de un campo: borde, fondo y texto salen del color del texto
 * de lo que lo rodea (`fg` con alpha), no de un blanco fijo. Antes los campos
 * eran `bg-white text-black` y en una tienda oscura quedaba un recuadro blanco
 * encendido; sobre un pie o una sección con color propio, que redefinen
 * `--color-fg`, el campo también los sigue.
 */
const FIELD = 'border border-fg/20 bg-fg/[0.03] text-fg placeholder:text-fg-muted';

/** Campo de texto — alto 11. */
export const INPUT_11 = `h-11 w-full rounded-md ${FIELD} px-3 text-sm`;

/** Campo de texto compacto — alto 10. */
export const INPUT_10 = `h-10 w-full rounded-md ${FIELD} px-3 text-sm`;

/** Input tematizado (usa tokens del theme del merchant). */
export const INPUT_THEMED_11 =
  'h-11 w-full rounded-md border border-[rgb(var(--color-fg)/0.2)] bg-transparent px-3 text-sm outline-none focus:border-primary';

/** Botón primario de bloque (submit de formularios de cuenta). */
export const BTN_PRIMARY_BLOCK =
  'flex h-11 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-fg disabled:opacity-60';

/** Textarea de los formularios públicos (contacto, arrepentimiento). */
export const TEXTAREA = `w-full rounded-md ${FIELD} px-3 py-2 text-sm`;

/** Botón de envío de los formularios públicos (con captcha). */
export const BTN_SUBMIT_PUBLIC =
  'inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-fg disabled:opacity-60';
