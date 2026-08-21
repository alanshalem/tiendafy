/**
 * Clases repetidas del panel. Reemplazo textual exacto de literales que
 * estaban copiados en muchas páginas — el render no cambia.
 */

/** Card de configuración (p-5; distinta del <Card> de @tiendafy/ui, que usa p-4). */
export const SETTINGS_CARD = 'rounded-lg border border-border bg-surface p-5 shadow-card';

/**
 * Contenedor de tabla (card sin padding con las esquinas recortadas).
 *
 * `overflow-clip` y no `overflow-hidden` a propósito: los dos recortan igual,
 * pero `hidden` convierte a la card en contenedor de scroll, y un `sticky` de
 * adentro se ancla a ella —que no scrollea— en vez de a la página. Con `clip`
 * el encabezado de la tabla puede quedar fijo.
 */
export const TABLE_CARD = 'overflow-clip rounded-lg border border-border bg-surface shadow-card';

/**
 * Encabezado de tabla que queda fijo debajo del encabezado del panel mientras
 * se scrollea la página. En una lista de 25 filas, sin esto a mitad de camino
 * quedás mirando columnas sin saber qué es cada una.
 *
 * El fondo va en cada `th` y no en el `tr`: el elemento fijo pinta su propio
 * fondo y el de la fila queda por debajo, así que las filas se le verían a
 * través. El borde inferior va como sombra porque con bordes colapsados lo
 * pinta la tabla, y bajo una celda fija desaparece.
 */
export const TABLE_HEAD_STICKY =
  'sticky top-[var(--header-height)] z-10 [&_th]:bg-surface [&_th]:shadow-[inset_0_-1px_0_rgb(var(--color-border))]';

/** Igual, para las tablas cuyo encabezado va sobre el gris de fondo. */
export const TABLE_HEAD_STICKY_SUBTLE =
  'sticky top-[var(--header-height)] z-10 [&_th]:bg-bg-subtle [&_th]:shadow-[inset_0_-1px_0_rgb(var(--color-border))]';

/**
 * Envoltorio de las tablas anchas, las que no entran y hay que correr de
 * costado. En pantalla grande deja de ser contenedor de scroll —ahí ya entran
 * sobradas, así que el scroll horizontal nunca se usaba— y recién entonces el
 * encabezado fijo puede anclarse a la página.
 */
export const TABLE_SCROLL_X = 'overflow-x-auto xl:overflow-x-visible';

/**
 * Igual que TABLE_HEAD_STICKY_SUBTLE, pero deja lugar a una barra fija que
 * aparece y desaparece —la de acciones masivas—: el alto viene por la variable
 * `--bulk-bar`, que la pantalla pone en 0 cuando no hay barra. Sin esto, las
 * dos se fijan a la misma altura y la barra tapa los nombres de columna justo
 * cuando estás editando en lote.
 */
export const TABLE_HEAD_STICKY_UNDER_BAR =
  'sticky top-[calc(var(--header-height)+var(--bulk-bar,0px))] z-10 [&_th]:bg-bg-subtle [&_th]:shadow-[inset_0_-1px_0_rgb(var(--color-border))]';
