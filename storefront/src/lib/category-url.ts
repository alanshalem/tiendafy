/**
 * La URL de una categoría en el listado: /productos?category=<ruta>.
 *
 * La ruta es la de la categoría desde la raíz ("ropa/remeras"): legible, y
 * única dentro de la tienda (el slug solo no: "hombre/remeras" y
 * "mujer/remeras"). Antes iba el id (un UUID), que no le dice nada a quien
 * ve el link ni a Google. Los links viejos con el id siguen funcionando:
 * findCategory acepta las dos formas.
 *
 * Sin imports de servidor: lo usan el header y el listado en el navegador.
 */
export interface CategoryRef {
  id: string;
  path?: string | null;
}

/** Lo que va en ?category=: la ruta, o el id si (por una respuesta vieja) no vino. */
export function categoryParam(c: CategoryRef): string {
  return c.path || c.id;
}

/**
 * Un query string con las barras sin escapar: `ropa/remeras` y no
 * `ropa%2Fremeras`. Las dos llegan igual al servidor, pero la canónica y los
 * links tienen que ser la misma URL al pie de la letra.
 */
export function readableQuery(params: URLSearchParams): string {
  return params.toString().replace(/%2F/gi, '/');
}

/** El link al listado filtrado por la categoría. */
export function categoryHref(c: CategoryRef, base = '/productos'): string {
  return `${base}?${readableQuery(new URLSearchParams({ category: categoryParam(c) }))}`;
}

/** La categoría que nombra ?category=, por id (links viejos) o por ruta. */
export function findCategory<T extends CategoryRef>(categories: T[], raw: string | undefined): T | undefined {
  const wanted = raw?.trim().toLowerCase();
  if (!wanted) return undefined;
  return (
    categories.find((c) => c.id.toLowerCase() === wanted) ??
    categories.find((c) => (c.path ?? '').toLowerCase() === wanted)
  );
}
