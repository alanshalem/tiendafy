/**
 * Clases de formularios repetidas literalmente en varios componentes de la
 * tienda. Reemplazo textual exacto: el HTML renderizado no cambia.
 */

/** Input claro (formularios sobre fondo del theme) — alto 11. */
export const INPUT_LIGHT_11 =
  'h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black';

/** Input claro compacto — alto 10. */
export const INPUT_LIGHT_10 =
  'h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black';

/** Input tematizado (usa tokens del theme del merchant). */
export const INPUT_THEMED_11 =
  'h-11 w-full rounded-md border border-[rgb(var(--color-fg)/0.2)] bg-transparent px-3 text-sm outline-none focus:border-primary';

/** Botón primario de bloque (submit de formularios de cuenta). */
export const BTN_PRIMARY_BLOCK =
  'flex h-11 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-fg disabled:opacity-60';

/** Textarea claro de los formularios públicos (contacto, arrepentimiento). */
export const TEXTAREA_LIGHT =
  'w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black';

/** Botón de envío de los formularios públicos (con captcha). */
export const BTN_SUBMIT_PUBLIC =
  'inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-fg disabled:opacity-60';
