import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  CornerLeftUp,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from 'lucide-react';
import { Checkbox, cn } from '@tiendafy/ui';
import {
  BUILTIN_MENU_IDS,
  type ThemeConfig,
  type ThemeMenuItem,
  type ThemeMenuItemKind,
} from '@tiendafy/types';
import { api } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { LinkPicker, type LinkPick } from '../components/LinkPicker';
import { INPUT_BASE } from './theme-editor-inputs';

/* ============================================================
   Menú del encabezado, armable.

   Los ítems fijos (Inicio, Productos, Categorías, Contacto) y las páginas
   publicadas existen siempre: se ocultan, se renombran y se ordenan, pero no
   se borran. Lo demás (una categoría, un producto, cualquier link) lo agrega
   el comercio y sí se puede quitar. Un nivel de anidado: un ítem puede
   colgar de otro y en la tienda el de arriba se vuelve un desplegable.

   El orden no es sólo estético: lo que no entra a lo ancho del encabezado se
   va a un desplegable "Más", así que lo de arriba es lo que queda a la vista.

   Se guarda la lista entera cada vez (el storefront igual agrega al final lo
   que falte): mantener un orden parcial y adivinar dónde entra lo que falta
   es la clase de estado que después nadie entiende.
   ============================================================ */

const BUILTIN_LABELS: Record<string, string> = {
  home: 'Inicio',
  products: 'Productos',
  categories: 'Categorías',
  contact: 'Contacto',
};

const KIND_LABEL: Record<ThemeMenuItemKind, string> = {
  builtin: 'Fijo',
  page: 'Página',
  category: 'Categoría',
  product: 'Producto',
  link: 'Link',
};

interface PublishedPage {
  id: string;
  title: string;
  slug: string;
}

/** Botón cuadrado de 40 px (se toca con el dedo en el panel angosto). */
const ICON_BTN =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-bg-muted hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent';

const kindOf = (m: ThemeMenuItem): ThemeMenuItemKind => m.kind ?? 'builtin';

/** ¿Puede tener hijos? El desplegable de Categorías ya es un desplegable. */
const canParent = (m: ThemeMenuItem) => m.id !== 'categories';

/** Un id nuevo para un link propio. */
const newLinkId = () => `link:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** El ítem que corresponde a lo que se eligió en el selector de links. */
function itemFromPick(href: string, pick: LinkPick | undefined): ThemeMenuItem {
  const label = pick?.label || guessLabel(href);
  if (pick?.refId && pick.type === 'product')
    return { id: `prod:${pick.refId}`, visible: true, kind: 'product', label, href };
  if (pick?.refId && pick.type === 'category')
    return { id: `cat:${pick.refId}`, visible: true, kind: 'category', label, href };
  if (pick?.refId && pick.type === 'page')
    return { id: `page:${pick.refId}`, visible: true, kind: 'page', label, href };
  return { id: newLinkId(), visible: true, kind: 'link', label, href };
}

/** Un nombre de arranque para un link escrito a mano: el dominio sin www. */
function guessLabel(href: string): string {
  const m = /^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(href);
  if (m) return m[1]!;
  if (href.startsWith('https://wa.me')) return 'WhatsApp';
  if (href.startsWith('mailto:')) return 'Email';
  if (href.startsWith('tel:')) return 'Teléfono';
  return 'Link';
}

export function MenuEditor({
  theme,
  updateTheme,
}: {
  theme: ThemeConfig;
  updateTheme: (u: (t: ThemeConfig) => ThemeConfig) => void;
}) {
  const { store } = useStore();
  const pagesQuery = useQuery({
    queryKey: ['pages-published', store?.id],
    queryFn: () => api.get<{ items: PublishedPage[] }>('/api/v1/pages/published'),
    enabled: !!store,
  });
  const pages = pagesQuery.data?.items ?? [];
  const pageById = new Map(pages.map((p) => [`page:${p.id}`, p]));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Lo guardado + lo que existe y nunca se tocó (los fijos y las páginas
  // nuevas aparecen solos al final, como en la tienda).
  const prefs = theme.header.menu ?? [];
  const known = new Set(prefs.map((m) => m.id));
  const rows: ThemeMenuItem[] = [
    ...prefs,
    ...BUILTIN_MENU_IDS.filter((id) => !known.has(id)).map<ThemeMenuItem>((id) => ({
      id,
      visible: true,
      kind: 'builtin',
    })),
    ...pages
      .filter((p) => !known.has(`page:${p.id}`))
      .map<ThemeMenuItem>((p) => ({ id: `page:${p.id}`, visible: true, kind: 'page' })),
  ];

  const ids = new Set(rows.map((r) => r.id));
  const isTop = (m: ThemeMenuItem) => !m.parent || !ids.has(m.parent);
  const tops = rows.filter(isTop);
  const childrenOf = (id: string) => rows.filter((r) => r.parent === id && !isTop(r));

  const labelOf = (m: ThemeMenuItem): string =>
    m.label?.trim() ||
    BUILTIN_LABELS[m.id] ||
    pageById.get(m.id)?.title ||
    (kindOf(m) === 'page' ? 'Página sin publicar' : 'Link');

  /** Guarda la lista aplanada: cada ítem de primer nivel seguido de sus hijos. */
  const save = (nextTops: ThemeMenuItem[], kids: (id: string) => ThemeMenuItem[]) => {
    const flat = nextTops.flatMap((t) => [t, ...kids(t.id)]);
    updateTheme((t) => ({ ...t, header: { ...t.header, menu: flat } }));
  };
  const saveRows = (next: ThemeMenuItem[]) => {
    const nextIds = new Set(next.map((r) => r.id));
    const top = (m: ThemeMenuItem) => !m.parent || !nextIds.has(m.parent);
    save(next.filter(top), (id) => next.filter((r) => r.parent === id && !top(r)));
  };
  const patch = (id: string, change: Partial<ThemeMenuItem>) =>
    saveRows(rows.map((r) => (r.id === id ? { ...r, ...change } : r)));

  const move = (item: ThemeMenuItem, delta: number) => {
    const siblings = isTop(item) ? tops : childrenOf(item.parent!);
    const from = siblings.findIndex((s) => s.id === item.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= siblings.length) return;
    const reordered = [...siblings];
    reordered.splice(from, 1);
    reordered.splice(to, 0, item);
    if (isTop(item)) save(reordered, childrenOf);
    else save(tops, (id) => (id === item.parent ? reordered : childrenOf(id)));
  };

  /** Meter adentro del ítem de arriba (queda último de sus hijos). */
  const indent = (item: ThemeMenuItem) => {
    const index = tops.findIndex((t) => t.id === item.id);
    const parent = tops[index - 1];
    if (!parent || !canParent(parent)) return;
    const moved = { ...item, parent: parent.id };
    save(
      tops.filter((t) => t.id !== item.id),
      (id) => (id === parent.id ? [...childrenOf(id), moved] : childrenOf(id)),
    );
  };

  /** Sacar al primer nivel, justo después de su padre. */
  const outdent = (item: ThemeMenuItem) => {
    const { parent, ...rest } = item;
    const index = tops.findIndex((t) => t.id === parent);
    const nextTops = [...tops];
    nextTops.splice(index + 1, 0, rest);
    save(nextTops, (id) => childrenOf(id).filter((c) => c.id !== item.id));
  };

  /** Quitar del menú: los hijos suben al primer nivel en vez de perderse. */
  const remove = (item: ThemeMenuItem) => {
    setExpanded(null);
    saveRows(
      rows
        .filter((r) => r.id !== item.id)
        .map((r) => (r.parent === item.id ? { ...r, parent: undefined } : r)),
    );
  };

  const add = (href: string, pick?: LinkPick) => {
    setAdding(false);
    if (!href) return;
    const item = itemFromPick(href, pick);
    const existing = rows.find((r) => r.id === item.id);
    if (existing) {
      // Ya estaba (oculta, por ejemplo): se muestra en vez de duplicarla.
      patch(existing.id, { visible: true, href: existing.href ?? item.href });
      setExpanded(existing.id);
      return;
    }
    saveRows([...rows, item]);
    setExpanded(item.id);
  };

  const renderRow = (item: ThemeMenuItem, siblings: ThemeMenuItem[], index: number, child: boolean) => {
    const label = labelOf(item);
    const kind = kindOf(item);
    const open = expanded === item.id;
    const editorId = `menu-item-${item.id.replace(/[^\w-]/g, '-')}`;
    const prevTop = !child ? tops[index - 1] : undefined;
    const canIndent =
      !child && !!prevTop && canParent(prevTop) && canParent(item) && childrenOf(item.id).length === 0;
    return (
      <li key={item.id} className={cn(child && 'ml-5')}>
        <div className="flex items-center rounded-md border border-border bg-surface">
          <button
            type="button"
            onClick={() => setExpanded(open ? null : item.id)}
            aria-expanded={open}
            aria-controls={editorId}
            className="flex min-h-10 min-w-0 flex-1 items-center gap-1.5 px-2 text-left"
          >
            {child && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />}
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                !item.visible && 'text-fg-subtle line-through',
              )}
            >
              {label}
            </span>
            <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-wide text-fg-subtle">
              {KIND_LABEL[kind]}
            </span>
            <ChevronDown
              className={cn('h-4 w-4 shrink-0 text-fg-muted transition-transform', open && 'rotate-180')}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={() => move(item, -1)}
            disabled={index === 0}
            aria-label={`Subir ${label}`}
            className={ICON_BTN}
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => move(item, 1)}
            disabled={index === siblings.length - 1}
            aria-label={`Bajar ${label}`}
            className={ICON_BTN}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => patch(item.id, { visible: !item.visible })}
            aria-label={item.visible ? `Ocultar ${label}` : `Mostrar ${label}`}
            aria-pressed={!item.visible}
            className={ICON_BTN}
          >
            {item.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>

        {open && (
          <div id={editorId} className="mt-1 space-y-3 rounded-md border border-border bg-bg-muted/40 p-3">
            <div>
              <label htmlFor={`${editorId}-name`} className="mb-1.5 block text-sm font-medium text-fg">
                Nombre en el menú
              </label>
              <input
                id={`${editorId}-name`}
                value={item.label ?? ''}
                onChange={(e) => patch(item.id, { label: e.target.value })}
                placeholder={BUILTIN_LABELS[item.id] || pageById.get(item.id)?.title || 'Nombre'}
                className={`h-10 w-full px-3 text-sm ${INPUT_BASE}`}
              />
            </div>

            {kind === 'builtin' && item.id === 'categories' && (
              <p className="text-xs text-fg-muted">Abre un desplegable con todas tus categorías.</p>
            )}
            {kind === 'page' && !item.href && (
              <p className="text-xs text-fg-muted">
                Lleva a la página de contenido. Se edita en Páginas de contenido.
              </p>
            )}

            {kind !== 'builtin' && (kind !== 'page' || item.href) && (
              <LinkPicker
                label="Destino"
                value={item.href ?? ''}
                clearable={false}
                onChange={(href) => href && patch(item.id, { href })}
                newTab={item.newTab}
                onNewTabChange={(v) => patch(item.id, { newTab: v || undefined })}
              />
            )}

            {kind === 'category' && (
              <label className="flex min-h-10 items-start gap-2 text-sm">
                <Checkbox
                  checked={!!item.showChildren}
                  onChange={(e) => patch(item.id, { showChildren: e.target.checked || undefined })}
                />
                <span>
                  Mostrar subcategorías
                  <span className="block text-xs text-fg-muted">
                    En la computadora abre un menú grande con sus subcategorías en columnas; en el celular,
                    una lista desplegable.
                  </span>
                </span>
              </label>
            )}

            <div className="flex flex-wrap gap-2">
              {canIndent && (
                <button
                  type="button"
                  onClick={() => indent(item)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-bg-muted"
                >
                  <CornerDownRight className="h-4 w-4" /> Meter dentro de «{labelOf(prevTop!)}»
                </button>
              )}
              {child && (
                <button
                  type="button"
                  onClick={() => outdent(item)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-bg-muted"
                >
                  <CornerLeftUp className="h-4 w-4" /> Sacar al primer nivel
                </button>
              )}
              {kind !== 'builtin' && !(kind === 'page' && !item.href) && (
                <button
                  type="button"
                  onClick={() => remove(item)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm text-danger hover:bg-danger/10"
                >
                  <Trash2 className="h-4 w-4" /> Quitar del menú
                </button>
              )}
            </div>
          </div>
        )}

        {!child && childrenOf(item.id).length > 0 && (
          <ul className="mt-1 space-y-1" aria-label={`Dentro de ${label}`}>
            {childrenOf(item.id).map((c, i, list) => renderRow(c, list, i, true))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div>
      <p className="mb-2 text-xs text-fg-muted">
        Arriba va lo más importante: cuando no entran todos, los últimos pasan a un desplegable «Más». Tocá un
        ítem para renombrarlo, cambiar a dónde lleva o meterlo dentro de otro.
      </p>
      <ul className="space-y-1" aria-label="Ítems del menú">
        {tops.map((t, i) => renderRow(t, tops, i, false))}
      </ul>

      <div className="mt-3">
        {adding ? (
          <LinkPicker
            label="Nuevo ítem del menú"
            value=""
            defaultOpen
            onChange={add}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <Plus className="h-4 w-4" /> Agregar al menú
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-fg-subtle">
        Categorías, productos, páginas o cualquier link. Las páginas de contenido que publiques aparecen solas
        al final.
      </p>
    </div>
  );
}
