import { safeHref, type ThemeMenuItem } from '@tiendafy/types';

/** Un ítem ya resuelto del menú del encabezado (lo que se dibuja). */
export interface NavItem {
  id: string;
  label: string;
  /** Destino sin el ?preview del editor: lo agrega quien lo dibuja. */
  href: string;
  /** 'categories' = el desplegable con todo el árbol de categorías. */
  kind?: 'link' | 'categories';
  newTab?: boolean;
  /** Subítems (un nivel): el ítem se vuelve un desplegable. */
  children?: NavItem[];
  /** Categoría con "mostrar subcategorías": su rama del árbol como mega-menú. */
  categoryId?: string;
}

/** Una página de contenido publicada, como la devuelve /pages/published. */
export interface PublishedPage {
  id: string;
  title: string;
  slug: string;
}

/** Los fijos del menú: existen siempre (el comercio los oculta, no los borra). */
const BUILTINS: Record<string, { label: string; href: string; kind?: NavItem['kind'] }> = {
  home: { label: 'Inicio', href: '/' },
  products: { label: 'Productos', href: '/productos' },
  categories: { label: 'Categorías', href: '/productos', kind: 'categories' },
  contact: { label: 'Contacto', href: '/contacto' },
};

const pageHref = (p: PublishedPage) => `/paginas/${p.slug}`;

/**
 * Arma el menú del encabezado: lo que eligió el comercio (orden, nombres,
 * ocultos, anidado) sobre lo que existe de verdad.
 *
 * - Los fijos y las páginas publicadas que el comercio nunca tocó aparecen al
 *   final, en su orden natural: una página nueva se ve sin ir al editor.
 * - Una página guardada con su destino se dibuja ya en el servidor; cuando
 *   llega la lista de publicadas (`pages`, null mientras tanto) se actualiza
 *   su nombre y se descarta si la despublicaron.
 * - Categorías, productos y links propios se dibujan con lo que guardaron; sin
 *   un destino válido no se dibujan (nunca un link roto).
 * - Un ítem oculto se lleva a sus hijos; un hijo cuyo padre ya no existe sube
 *   al primer nivel en vez de perderse.
 */
export function buildHeaderMenu(prefs: ThemeMenuItem[], pages: PublishedPage[] | null): NavItem[] {
  const pageById = new Map((pages ?? []).map((p) => [`page:${p.id}`, p]));
  const resolved = new Map<string, NavItem>();
  const hidden = new Set<string>();
  const order: string[] = [];

  const resolve = (pref: ThemeMenuItem): NavItem | null => {
    const label = pref.label?.trim();
    const kind = pref.kind ?? 'builtin';
    if (kind === 'builtin') {
      const b = BUILTINS[pref.id];
      return b ? { id: pref.id, label: label || b.label, href: b.href, kind: b.kind ?? 'link' } : null;
    }
    if (kind === 'page') {
      const live = pageById.get(pref.id);
      if (live) return { id: pref.id, label: label || live.title, href: pageHref(live) };
      // Todavía no llegó la lista: lo guardado (si lo hay) ya sirve para el HTML del servidor.
      const href = pages === null ? safeHref(pref.href) : undefined;
      return href ? { id: pref.id, label: label || 'Página', href } : null;
    }
    const href = safeHref(pref.href);
    if (!href) return null;
    const item: NavItem = { id: pref.id, label: label || 'Link', href };
    if (pref.newTab) item.newTab = true;
    if (kind === 'category' && pref.showChildren) item.categoryId = pref.id.slice('cat:'.length);
    return item;
  };

  for (const pref of prefs) {
    if (resolved.has(pref.id) || hidden.has(pref.id)) continue;
    if (!pref.visible) {
      hidden.add(pref.id);
      continue;
    }
    const item = resolve(pref);
    if (!item) continue;
    resolved.set(pref.id, item);
    order.push(pref.id);
  }

  // Lo que existe y el comercio nunca ordenó: al final, en el orden natural.
  const known = new Set(prefs.map((p) => p.id));
  for (const id of Object.keys(BUILTINS)) {
    if (known.has(id)) continue;
    resolved.set(id, resolve({ id, visible: true, kind: 'builtin' })!);
    order.push(id);
  }
  for (const p of pages ?? []) {
    const id = `page:${p.id}`;
    if (known.has(id)) continue;
    resolved.set(id, { id, label: p.title, href: pageHref(p) });
    order.push(id);
  }

  // Anidado (un nivel).
  const parentOf = new Map(prefs.filter((p) => p.parent).map((p) => [p.id, p.parent!]));
  const top: NavItem[] = [];
  for (const id of order) {
    const item = resolved.get(id)!;
    const parentId = parentOf.get(id);
    if (parentId && hidden.has(parentId)) continue;
    const parent = parentId ? resolved.get(parentId) : undefined;
    if (parent && !parentOf.has(parentId!) && parent.kind !== 'categories') {
      (parent.children ??= []).push(item);
    } else {
      top.push(item);
    }
  }
  return top;
}
