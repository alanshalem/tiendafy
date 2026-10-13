/**
 * Clases repetidas del panel. Reemplazo textual exacto de literales que
 * estaban copiados en muchas páginas — el render no cambia.
 */

/**
 * Orden de apilado del panel, completo y en un solo lugar.
 *
 * Los números sueltos repartidos por las pantallas son justamente lo que hace
 * que una capa flotante termine tapada: no hay dónde mirar qué va arriba de
 * qué, y dos elementos con el mismo z los ordena el HTML —que no es el orden
 * en que se leen en el código—.
 *
 *   10   encabezado fijo de una tabla        (es chrome de la tabla)
 *   20   chrome fijo de la pantalla          (encabezado del panel, barra de selección)
 *   30   barras de guardar al pie
 *   40   capa flotante anclada a un control  (autocompletado, popover en flujo)
 *   50   paneles laterales y pantallas completas
 *   70   tooltips (van por portal)
 *   90   paleta de comandos
 *  100   avisos
 *  200   menús de @tiendafy/ui (van por portal)
 *
 * Lo que va por portal —tooltips, menús, modales— queda fuera del problema:
 * se dibuja en la raíz del documento y no compite con nada de la pantalla.
 */

/**
 * Capa que se abre pegada a un control y desaparece al elegir. Va por encima
 * de todo lo que está fijo en la pantalla: es transitoria y es lo que la
 * persona está usando en ese momento.
 */
export const Z_ANCHORED = 'z-40';

/**
 * El área de contenido de todas las pantallas del panel: el mismo ancho y el
 * mismo margen en todas.
 *
 * Antes cada página se encerraba en su propio ancho (de 672 a 1600 px en una
 * pantalla de 1920) y el título saltaba de lugar al pasar de una a otra. Las
 * páginas no ponen ancho propio (lo vigila un test); el tope solo se nota en
 * monitores ultra anchos, donde una tabla de 2500 px ya no se lee.
 */
export const PAGE_MAIN = 'mx-auto w-full max-w-[120rem] p-4 sm:p-6 md:p-8';

/** Las barras de guardar fijas al pie: el mismo margen que el contenido, para alinear los botones. */
export const FIXED_BAR_PADDING = 'px-4 py-3 sm:px-6 md:px-8';

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
 *
 * Fijo recién desde xl, igual que TABLE_SCROLL_X: más angosto la tabla va
 * dentro de un contenedor con scroll de costado, y ahí un `sticky` se ancla a
 * ese contenedor (que no scrollea para abajo) y el corrimiento del encabezado
 * del panel lo deja tapando la primera fila.
 *
 * El z-10 es el escalón más bajo de la escala de arriba: al pasar a ser un
 * elemento posicionado, la tabla empieza a competir con lo que flota sobre
 * ella, y tiene que perder.
 */
export const TABLE_HEAD_STICKY =
  'z-10 xl:sticky xl:top-[var(--header-height)] [&_th]:bg-surface [&_th]:shadow-[inset_0_-1px_0_rgb(var(--color-border))]';

/** Igual, para las tablas cuyo encabezado va sobre el gris de fondo. */
export const TABLE_HEAD_STICKY_SUBTLE =
  'z-10 xl:sticky xl:top-[var(--header-height)] [&_th]:bg-bg-subtle [&_th]:shadow-[inset_0_-1px_0_rgb(var(--color-border))]';

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
  'z-10 xl:sticky xl:top-[calc(var(--header-height)+var(--bulk-bar,0px))] [&_th]:bg-bg-subtle [&_th]:shadow-[inset_0_-1px_0_rgb(var(--color-border))]';
