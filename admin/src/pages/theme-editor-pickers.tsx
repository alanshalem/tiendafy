import { useMemo, useState } from 'react';
import { GripVertical, X, Plus } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { moveItem } from '../lib/arrays';
import { useProductSearch, useProductsByIds } from '../lib/useProductSearch';
import { Field, TextInput, Select, INPUT_BASE } from './theme-editor-inputs';

interface PickProduct {
  id: string;
  name: string;
  image: string | null;
}

/** Lo que devuelve /products: alcanza con el nombre y la primera foto. */
interface ProductDto {
  id: string;
  name: string;
  images: { url: string }[];
}

const toPick = (p: ProductDto): PickProduct => ({ id: p.id, name: p.name, image: p.images[0]?.url ?? null });

/** Cuántos resultados se muestran por búsqueda: el panel lateral no da para más. */
const MAX_RESULTS = 8;

/**
 * Selector de productos para Destacados/Nuevos/Ofertas. Los resultados sólo
 * aparecen al buscar (no se listan todos). Los elegidos se reordenan por
 * drag-and-drop (el orden es el que se muestra en la tienda).
 *
 * Busca en la base, como los demás selectores del panel. Antes traía los
 * primeros cien productos y filtraba en el navegador: en una tienda con miles
 * —CKING tiene casi tres mil publicados— el producto ciento uno no se podía
 * elegir, y uno elegido fuera de esos cien aparecía sin nombre.
 */
export function ProductPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  // Lo recién agregado se conoce desde el resultado que se clickeó: así el
  // chip tiene nombre antes de que vuelva la consulta por ids.
  const [picked, setPicked] = useState<Record<string, PickProduct>>({});

  const query = q.trim();
  const search = useProductSearch<ProductDto>(query);
  const chosen = useProductsByIds<ProductDto>(value);

  const known = useMemo(() => {
    const map = new Map<string, PickProduct>(Object.entries(picked));
    for (const p of chosen.data?.items ?? []) map.set(p.id, toPick(p));
    return map;
  }, [picked, chosen.data]);

  const byId = (id: string) => known.get(id);
  const add = (p: PickProduct) => {
    if (value.includes(p.id)) return;
    setPicked((m) => ({ ...m, [p.id]: p }));
    onChange([...value, p.id]);
  };
  const removeId = (id: string) => onChange(value.filter((x) => x !== id));
  const reorder = (fromId: string, toId: string) => {
    const from = value.indexOf(fromId);
    const to = value.indexOf(toId);
    if (from < 0 || to < 0 || from === to) return;
    onChange(moveItem(value, from, to));
  };

  const results = query
    ? (search.data?.items ?? [])
        .filter((p) => !value.includes(p.id))
        .slice(0, MAX_RESULTS)
        .map(toPick)
    : [];

  return (
    <div>
      {/* Elegidos: reordenables por drag */}
      {value.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {value.map((id) => {
            const p = byId(id);
            return (
              <div
                key={id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', id);
                  setDragId(id);
                }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  reorder(e.dataTransfer.getData('text/plain'), id);
                  setDragId(null);
                }}
                className={cn(
                  'flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-sm',
                  dragId === id && 'opacity-50',
                )}
              >
                <span className="cursor-grab text-fg-subtle active:cursor-grabbing" title="Arrastrar">
                  <GripVertical className="h-4 w-4" />
                </span>
                {p?.image ? (
                  <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded bg-black/5" />
                )}
                <span className="flex-1 truncate">{p?.name ?? 'Producto'}</span>
                <button
                  onClick={() => removeId(id)}
                  aria-label="Quitar"
                  className="text-fg-subtle hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Buscador: resultados sólo al escribir */}
      <input
        type="search"
        aria-label="Buscar productos para agregar"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar productos para agregar…"
        className={`h-9 w-full px-3 text-sm ${INPUT_BASE}`}
      />
      {query && (
        <div className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-1">
          {!search.data && <p className="p-3 text-center text-xs text-fg-muted">Cargando…</p>}
          {search.data && results.length === 0 && (
            <p className="p-3 text-center text-xs text-fg-muted">Sin resultados.</p>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                add(p);
                setQ('');
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-bg-muted"
            >
              {p.image ? (
                <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" />
              ) : (
                <div className="h-8 w-8 rounded bg-black/5" />
              )}
              <span className="flex-1 truncate">{p.name}</span>
              <Plus className="h-4 w-4 text-primary" />
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-xs text-fg-subtle">
        {value.length > 0 ? 'Arrastrá para reordenar. ' : ''}Si no elegís ninguno, se muestran
        automáticamente.
      </p>
    </div>
  );
}

const INFO_ICONS = [
  { value: 'shipping', label: 'Envíos' },
  { value: 'card', label: 'Tarjetas de crédito' },
  { value: 'security', label: 'Seguridad' },
  { value: 'gift', label: 'Regalo / Promo' },
  { value: 'support', label: 'Atención' },
  { value: 'returns', label: 'Cambios' },
];

export interface InfoItem {
  icon?: string;
  title?: string;
  description?: string;
  link?: string;
}
export function InfoBarEditor({ items, onChange }: { items: InfoItem[]; onChange: (v: InfoItem[]) => void }) {
  const list = items.length > 0 ? items : [{ icon: 'shipping' }, { icon: 'card' }, { icon: 'security' }];
  const update = (i: number, patch: InfoItem) =>
    onChange(list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  return (
    <div className="space-y-4">
      {list.map((it, i) => (
        <div key={i} className="rounded-md border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Banner {i + 1}
            </span>
            {list.length > 1 && (
              <button
                onClick={() => onChange(list.filter((_, idx) => idx !== i))}
                className="text-xs text-danger hover:underline"
              >
                Quitar
              </button>
            )}
          </div>
          <div className="space-y-2">
            <Field label="Ícono">
              <Select
                value={it.icon ?? 'shipping'}
                onChange={(v) => update(i, { icon: v })}
                options={INFO_ICONS}
              />
            </Field>
            <TextInput
              value={it.title ?? ''}
              onChange={(v) => update(i, { title: v })}
              placeholder="Título"
            />
            <TextInput
              value={it.description ?? ''}
              onChange={(v) => update(i, { description: v })}
              placeholder="Descripción"
            />
            <TextInput
              value={it.link ?? ''}
              onChange={(v) => update(i, { link: v })}
              placeholder="Link (opcional)"
            />
          </div>
        </div>
      ))}
      {list.length < 4 && (
        <button
          onClick={() => onChange([...list, { icon: 'shipping' }])}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Plus className="h-4 w-4" /> Agregar banner
        </button>
      )}
    </div>
  );
}
