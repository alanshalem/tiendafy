import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qk } from '../lib/queryKeys';
import {
  FileText,
  FolderTree,
  Globe,
  Link2,
  Mail,
  MessageCircle,
  Package,
  Pencil,
  Phone,
  Plus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Checkbox, cn } from '@tiendafy/ui';
import {
  STORE_PAGES,
  categoryLink,
  describeLink,
  normalizeLink,
  pageLink,
  productLink,
  whatsappLink,
  type LinkTarget,
} from '@tiendafy/types';
import { api } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { useCategories } from '../lib/useCategories';
import { useProductSearch } from '../lib/useProductSearch';

/* ============================================================
   Selector de links del editor de diseño.

   El comercio no sabe (ni tiene por qué saber) que la remera vive en
   /productos/remera-oversize o que una categoría es ?category=ropa/remeras:
   elige "Producto → Remera Oversize" y el link se arma solo. Para lo de
   afuera hay un campo de URL que avisa mientras se escribe (y completa el
   https://), y WhatsApp arma el wa.me con el mensaje.

   Lo guardado sigue siendo un href común (string): los temas viejos se leen
   igual, y al editar se reconoce a qué apunta para mostrarlo con su nombre.
   ============================================================ */

export type LinkPickerTab = 'product' | 'category' | 'page' | 'url' | 'whatsapp';

/** Lo que se eligió, además del href: sirve para proponer un nombre (ítems del menú). */
export interface LinkPick {
  href: string;
  /** Nombre del destino ("Remera Oversize", "Ropa", "Cómo comprar"…). */
  label: string;
  type: LinkTarget['type'];
  /** Id del producto, la categoría o la página elegida. */
  refId?: string;
}

export interface LinkPickerProps {
  /** El href guardado. Vacío = sin link. */
  value: string;
  /** Nuevo href ('' al quitarlo) y, si se eligió de una lista, qué se eligió. */
  onChange: (href: string, pick?: LinkPick) => void;
  /** Abrir en otra pestaña. La casilla aparece solo si se pasa `onNewTabChange`. */
  newTab?: boolean;
  onNewTabChange?: (value: boolean) => void;
  /** Título del campo. */
  label?: string;
  hint?: string;
  /** Qué tipos de destino se ofrecen (todos por defecto, en este orden). */
  types?: LinkPickerTab[];
  /** Arranca con el selector abierto (p. ej. al agregar un ítem nuevo). */
  defaultOpen?: boolean;
  /** Si se puede quitar el link (default sí). */
  clearable?: boolean;
  /** Al cerrar el selector sin elegir nada. */
  onCancel?: () => void;
}

const ALL_TABS: LinkPickerTab[] = ['product', 'category', 'page', 'url', 'whatsapp'];

const TAB_META: Record<LinkPickerTab, { label: string; icon: LucideIcon }> = {
  product: { label: 'Producto', icon: Package },
  category: { label: 'Categoría', icon: FolderTree },
  page: { label: 'Página', icon: FileText },
  url: { label: 'URL', icon: Globe },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
};

/** Alto mínimo de todo lo que se toca: 40 px, cómodo con el dedo. */
const TOUCH = 'min-h-10';
const INPUT =
  'h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary';
const ROW = `flex w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-bg-muted focus:bg-bg-muted focus:outline-none ${TOUCH}`;

interface ProductDto {
  id: string;
  name: string;
  slug: string;
  images?: { url: string }[];
}
interface PageDto {
  id: string;
  title: string;
  slug: string;
  published: boolean;
}

/** Páginas de contenido (misma consulta y cache que la pantalla de Páginas). */
function usePages(enabled: boolean) {
  const { store } = useStore();
  return useQuery({
    queryKey: qk.pages(store?.id),
    queryFn: () => api.get<{ items: PageDto[] }>('/api/v1/pages'),
    enabled: enabled && !!store,
  });
}

/** El producto de un link guardado, por slug, para mostrar su nombre. */
function useProductBySlug(slug: string | null) {
  const { store } = useStore();
  return useQuery({
    queryKey: ['product-by-slug', store?.id, slug],
    queryFn: () => api.get<ProductDto>(`/api/v1/products/by-slug/${encodeURIComponent(slug!)}`),
    enabled: !!slug && !!store,
    retry: false,
  });
}

/** El tab que corresponde a un link guardado (al abrir el selector para cambiarlo). */
function tabFor(target: LinkTarget, tabs: LinkPickerTab[]): LinkPickerTab {
  const wanted: LinkPickerTab =
    target.type === 'product'
      ? 'product'
      : target.type === 'category'
        ? 'category'
        : target.type === 'page' || target.type === 'store-page'
          ? 'page'
          : target.type === 'whatsapp'
            ? 'whatsapp'
            : target.type === 'none'
              ? tabs[0]!
              : 'url';
  return tabs.includes(wanted) ? wanted : tabs[0]!;
}

/** "Producto: Remera Oversize" — cómo se muestra un link guardado. */
function useLinkSummary(value: string): { prefix: string; name: string; icon: LucideIcon } | null {
  const target = describeLink(value);
  const products = useProductBySlug(target.type === 'product' ? target.slug : null);
  const categories = useCategories({ enabled: target.type === 'category' });
  const pages = usePages(target.type === 'page');

  switch (target.type) {
    case 'none':
      return value.trim() ? { prefix: 'Link inválido', name: value, icon: Link2 } : null;
    case 'product':
      return { prefix: 'Producto', name: products.data?.name ?? target.slug, icon: Package };
    case 'category': {
      const wanted = target.param.toLowerCase();
      const cat = categories.data?.items.find(
        (c) => c.path.toLowerCase() === wanted || c.id.toLowerCase() === wanted,
      );
      return { prefix: 'Categoría', name: cat?.name ?? target.param, icon: FolderTree };
    }
    case 'page': {
      const page = pages.data?.items.find((p) => p.slug === target.slug);
      return { prefix: 'Página', name: page?.title ?? target.slug, icon: FileText };
    }
    case 'store-page':
      return { prefix: 'Página', name: target.label, icon: FileText };
    case 'whatsapp':
      return { prefix: 'WhatsApp', name: `+${target.phone}`, icon: MessageCircle };
    case 'mailto':
      return { prefix: 'Email', name: target.address, icon: Mail };
    case 'tel':
      return { prefix: 'Teléfono', name: target.number, icon: Phone };
    case 'external':
      return { prefix: 'Web', name: target.href.replace(/^https?:\/\//i, ''), icon: Globe };
    default:
      return { prefix: 'Link', name: target.href, icon: Link2 };
  }
}

/**
 * Ref del selector abierto. Va afuera del componente a propósito: una función
 * estable se llama solo al montar, no en cada render (si no, cualquier
 * re-render le volvería a robar el foco a otro campo).
 */
function focusIfOutside(el: HTMLDivElement | null) {
  if (el && !el.contains(document.activeElement)) el.focus();
}

export function LinkPicker({
  value,
  onChange,
  newTab,
  onNewTabChange,
  label = 'Link',
  hint,
  types = ALL_TABS,
  defaultOpen = false,
  clearable = true,
  onCancel,
}: LinkPickerProps) {
  const labelId = useId();
  const hintId = useId();
  const [editing, setEditing] = useState(defaultOpen);
  const [tab, setTab] = useState<LinkPickerTab>(() => tabFor(describeLink(value), types));
  const summary = useLinkSummary(value);

  const startEditing = () => {
    setTab(tabFor(describeLink(value), types));
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    onCancel?.();
  };
  const pick = (p: LinkPick) => {
    onChange(p.href, p);
    setEditing(false);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  const Icon = summary?.icon;

  return (
    <div role="group" aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined}>
      <div id={labelId} className="mb-1.5 text-sm font-medium text-fg">
        {label}
      </div>

      {!editing && summary && Icon && (
        <div className="flex min-w-0 items-center gap-1 rounded-md border border-border bg-surface pl-3">
          <Icon className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate py-2 text-sm" title={value}>
            <span className={cn(summary.prefix === 'Link inválido' ? 'text-danger' : 'text-fg-muted')}>
              {summary.prefix}:
            </span>{' '}
            {summary.name}
          </span>
          <button
            type="button"
            onClick={startEditing}
            aria-label={`Cambiar ${label.toLowerCase()}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            <Pencil className="h-4 w-4" />
          </button>
          {clearable && (
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label={`Quitar ${label.toLowerCase()}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-danger/10 hover:text-danger"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {!editing && !summary && (
        <button
          type="button"
          onClick={startEditing}
          className={`flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border-strong px-3 text-sm font-medium text-fg-muted hover:border-primary hover:text-primary ${TOUCH}`}
        >
          <Plus className="h-4 w-4" /> Elegir a dónde lleva
        </button>
      )}

      {editing && (
        <div
          className="space-y-2 rounded-md border border-border bg-surface p-2 focus:outline-none"
          onKeyDown={onKeyDown}
          tabIndex={-1}
          // Al abrir, el foco entra al selector (si ningún campo lo tomó con
          // autoFocus): el botón que lo abrió desaparece, y sin esto el foco
          // caía al <body> y Escape no llegaba.
          ref={focusIfOutside}
        >
          {types.length > 1 && (
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="Tipo de destino">
              {types.map((t) => {
                const meta = TAB_META[t];
                const active = t === tab;
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTab(t)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1 text-xs font-medium transition',
                      TOUCH,
                      active
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-fg-muted hover:border-border-strong hover:text-fg',
                    )}
                  >
                    <meta.icon className="h-4 w-4" aria-hidden />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'product' && <ProductTab onPick={pick} />}
          {tab === 'category' && <CategoryTab onPick={pick} />}
          {tab === 'page' && <PageTab onPick={pick} />}
          {tab === 'url' && (
            <UrlTab initial={value} newTab={newTab} onNewTabChange={onNewTabChange} onPick={pick} />
          )}
          {tab === 'whatsapp' && <WhatsAppTab initial={describeLink(value)} onPick={pick} />}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={cancel}
              className={`rounded px-3 text-sm font-medium text-fg-muted hover:bg-bg-muted hover:text-fg ${TOUCH}`}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!editing && value && onNewTabChange && (
        <label className={`flex items-center gap-2 text-sm ${TOUCH}`}>
          <Checkbox checked={!!newTab} onChange={(e) => onNewTabChange(e.target.checked)} />
          Abrir en pestaña nueva
        </label>
      )}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-fg-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/* ---------- Tabs ---------- */

/** Lista de resultados elegibles, con su estado de carga y vacío. */
function ResultList({
  loading,
  empty,
  children,
  label,
}: {
  loading: boolean;
  empty: boolean;
  children: ReactNode;
  label: string;
}) {
  if (loading) return <p className="p-3 text-center text-xs text-fg-muted">Cargando…</p>;
  if (empty) return <p className="p-3 text-center text-xs text-fg-muted">Sin resultados.</p>;
  return (
    <ul aria-label={label} className="max-h-60 space-y-0.5 overflow-y-auto">
      {children}
    </ul>
  );
}

function ProductTab({ onPick }: { onPick: (p: LinkPick) => void }) {
  const [q, setQ] = useState('');
  const search = useProductSearch<ProductDto>(q, { activeOnly: true });
  const items = (search.data?.items ?? []).slice(0, 8);
  return (
    <div className="space-y-1.5">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre o SKU…"
        aria-label="Buscar producto"
        // se abre para buscar: el foco va directo a la caja.
        autoFocus
        className={INPUT}
      />
      <ResultList loading={!search.data} empty={items.length === 0} label="Productos">
        {items.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() =>
                onPick({ href: productLink(p.slug), label: p.name, type: 'product', refId: p.id })
              }
              className={ROW}
            >
              {p.images?.[0]?.url ? (
                <img src={p.images[0].url} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
              ) : (
                <span className="h-8 w-8 shrink-0 rounded bg-bg-muted" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
            </button>
          </li>
        ))}
      </ResultList>
    </div>
  );
}

function CategoryTab({ onPick }: { onPick: (p: LinkPick) => void }) {
  const [q, setQ] = useState('');
  const categories = useCategories();
  const all = categories.data?.items ?? [];
  const needle = q.trim().toLowerCase();
  const items = needle ? all.filter((c) => c.name.toLowerCase().includes(needle)) : all;
  return (
    <div className="space-y-1.5">
      {all.length > 8 && (
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar categoría…"
          aria-label="Buscar categoría"
          className={INPUT}
        />
      )}
      <ResultList loading={!categories.data} empty={items.length === 0} label="Categorías">
        {items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() =>
                onPick({ href: categoryLink(c.path || c.id), label: c.name, type: 'category', refId: c.id })
              }
              className={ROW}
              // Sangría por nivel: el árbol se lee sin dibujar líneas.
              style={{ paddingLeft: `${0.5 + Math.max(0, (c.depth ?? 1) - 1) * 0.875}rem` }}
            >
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
            </button>
          </li>
        ))}
      </ResultList>
    </div>
  );
}

function PageTab({ onPick }: { onPick: (p: LinkPick) => void }) {
  const pages = usePages(true);
  // Solo las publicadas: un link a un borrador le da "no encontrado" al comprador.
  const own = (pages.data?.items ?? []).filter((p) => p.published);
  return (
    <ul aria-label="Páginas" className="max-h-60 space-y-0.5 overflow-y-auto">
      {STORE_PAGES.map((p) => (
        <li key={p.href}>
          <button
            type="button"
            onClick={() => onPick({ href: p.href, label: p.label, type: 'store-page' })}
            className={ROW}
          >
            {p.label}
          </button>
        </li>
      ))}
      {own.length > 0 && (
        <li className="px-2 pb-0.5 pt-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          Tus páginas
        </li>
      )}
      {own.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onPick({ href: pageLink(p.slug), label: p.title, type: 'page', refId: p.id })}
            className={ROW}
          >
            {p.title}
          </button>
        </li>
      ))}
    </ul>
  );
}

function UrlTab({
  initial,
  newTab,
  onNewTabChange,
  onPick,
}: {
  initial: string;
  newTab?: boolean;
  onNewTabChange?: (v: boolean) => void;
  onPick: (p: LinkPick) => void;
}) {
  const inputId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState(initial);
  const result = normalizeLink(draft);
  const showError = !!draft.trim() && !!result.error;
  const apply = () => {
    if (!result.href) return;
    onPick({ href: result.href, label: '', type: describeLink(result.href).type });
  };
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-xs font-medium text-fg-muted">
        Dirección web, email o ruta de tu tienda
      </label>
      <div className="flex gap-1.5">
        <input
          id={inputId}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply();
            }
          }}
          placeholder="mitienda.com/ofertas"
          aria-invalid={showError || undefined}
          aria-describedby={errorId}
          // se abre para escribir.
          autoFocus
          className={cn(INPUT, 'min-w-0 flex-1', showError && 'border-danger focus:ring-danger')}
        />
        <button
          type="button"
          onClick={apply}
          disabled={!result.href}
          className="h-10 shrink-0 rounded-md bg-primary px-3 text-sm font-semibold text-primary-fg disabled:opacity-40"
        >
          Usar
        </button>
      </div>
      <p
        id={errorId}
        aria-live="polite"
        className={cn('text-xs', showError ? 'text-danger' : 'text-fg-muted')}
      >
        {showError
          ? result.error
          : result.href && result.href !== draft.trim()
            ? `Se va a guardar como ${result.href}`
            : ''}
      </p>
      {onNewTabChange && (
        <label className={`flex items-center gap-2 text-sm ${TOUCH}`}>
          <Checkbox checked={!!newTab} onChange={(e) => onNewTabChange(e.target.checked)} />
          Abrir en pestaña nueva
        </label>
      )}
    </div>
  );
}

function WhatsAppTab({ initial, onPick }: { initial: LinkTarget; onPick: (p: LinkPick) => void }) {
  const phoneId = useId();
  const msgId = useId();
  const errorId = useId();
  const [phone, setPhone] = useState(initial.type === 'whatsapp' ? initial.phone : '');
  const [message, setMessage] = useState(initial.type === 'whatsapp' ? initial.message : '');
  const href = whatsappLink(phone, message);
  const showError = !!phone.trim() && !href;
  return (
    <div className="space-y-2">
      <div>
        <label htmlFor={phoneId} className="mb-1 block text-xs font-medium text-fg-muted">
          Número con código de país
        </label>
        <input
          id={phoneId}
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+54 9 11 2233 4455"
          aria-invalid={showError || undefined}
          aria-describedby={errorId}
          // se abre para escribir.
          autoFocus
          className={cn(INPUT, showError && 'border-danger focus:ring-danger')}
        />
        <p id={errorId} aria-live="polite" className="mt-1 text-xs text-danger">
          {showError ? 'El número parece incompleto: poné código de país y de área (ej. 54 9 11…).' : ''}
        </p>
      </div>
      <div>
        <label htmlFor={msgId} className="mb-1 block text-xs font-medium text-fg-muted">
          Mensaje ya escrito (opcional)
        </label>
        <textarea
          id={msgId}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          placeholder="¡Hola! Quiero consultar por…"
          className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <button
        type="button"
        disabled={!href}
        onClick={() => href && onPick({ href, label: 'WhatsApp', type: 'whatsapp' })}
        className="h-10 w-full rounded-md bg-primary px-3 text-sm font-semibold text-primary-fg disabled:opacity-40"
      >
        Usar este WhatsApp
      </button>
    </div>
  );
}
