import { useEffect, useState } from 'react';
import { GripVertical, X, Plus } from 'lucide-react';
import { cn } from '@tiendafy/ui';
import { api } from '../lib/api';
import { Field, TextInput, Select, INPUT_BASE } from './theme-editor-inputs';

interface PickProduct {
  id: string;
  name: string;
  image: string | null;
}

/**
 * Selector de productos para Destacados/Nuevos/Ofertas. Los resultados sólo
 * aparecen al buscar (no se listan todos). Los elegidos se reordenan por
 * drag-and-drop (el orden es el que se muestra en la tienda).
 */
export function ProductPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [all, setAll] = useState<PickProduct[] | null>(null);
  const [q, setQ] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<{ items: { id: string; name: string; images: { url: string }[] }[] }>('/api/v1/products?limit=100')
      .then((r) => setAll(r.items.map((p) => ({ id: p.id, name: p.name, image: p.images[0]?.url ?? null }))))
      .catch(() => setAll([]));
  }, []);
  const byId = (id: string) => all?.find((p) => p.id === id);
  const add = (id: string) => {
    if (!value.includes(id)) onChange([...value, id]);
  };
  const removeId = (id: string) => onChange(value.filter((x) => x !== id));
  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const from = value.indexOf(fromId);
    const to = value.indexOf(toId);
    if (from < 0 || to < 0) return;
    const next = [...value];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange(next);
  };

  const query = q.trim().toLowerCase();
  const results = query
    ? (all ?? []).filter((p) => !value.includes(p.id) && p.name.toLowerCase().includes(query)).slice(0, 8)
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
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar productos para agregar…"
        className={`h-9 w-full px-3 text-sm ${INPUT_BASE}`}
      />
      {query && (
        <div className="mt-1 max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-1">
          {all === null && <p className="p-3 text-center text-xs text-fg-muted">Cargando…</p>}
          {all !== null && results.length === 0 && (
            <p className="p-3 text-center text-xs text-fg-muted">Sin resultados.</p>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                add(p.id);
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
