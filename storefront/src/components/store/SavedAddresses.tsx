'use client';

import { useEffect, useId, useState } from 'react';
import { Loader2, MapPin, Plus, Star } from 'lucide-react';
import { API_URL, problemMessage, tenantHeaders } from '@/lib/api-client';
import { EMPTY_ADDRESS, formatAddress, type SavedAddress, type SavedAddressInput } from '@/lib/addresses';
import { INPUT_THEMED_11 } from './styles';

const BTN_OUTLINE =
  'inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--color-fg)/0.15)] px-3.5 py-1.5 text-xs font-medium hover:bg-[rgb(var(--color-fg)/0.05)] disabled:opacity-60';

type Editing = { id: string | null; value: SavedAddressInput } | null;

/**
 * Las direcciones guardadas del comprador: agregar, editar, borrar y elegir
 * la predeterminada (la que el checkout completa solo).
 */
export function SavedAddresses({ tenantId }: { tenantId: string }) {
  const [items, setItems] = useState<SavedAddress[] | 'error' | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/v1/shop/addresses/`, { headers: tenantHeaders(tenantId), credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items: SavedAddress[] }) => active && setItems(d.items ?? []))
      .catch(() => active && setItems('error'));
    return () => {
      active = false;
    };
  }, [tenantId, version]);

  /** Escribe y vuelve a leer la lista (la predeterminada puede haber cambiado en otra fila). */
  const send = async (method: string, path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/shop/addresses${path}`, {
        method,
        headers: tenantHeaders(tenantId, body !== undefined),
        credentials: 'include',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await problemMessage(res, 'No se pudo guardar. Probá de nuevo.'));
        return false;
      }
      setVersion((v) => v + 1);
      return true;
    } catch {
      setError('No se pudo guardar. Revisá tu conexión.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const ok = editing.id
      ? await send('PUT', `/${editing.id}`, editing.value)
      : await send('POST', '/', editing.value);
    if (ok) setEditing(null);
  };

  return (
    <section className="mt-10" aria-labelledby="mis-direcciones">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="mis-direcciones" className="text-lg font-bold">
          Mis direcciones
        </h2>
        {!editing && Array.isArray(items) && (
          <button
            type="button"
            className={BTN_OUTLINE}
            onClick={() =>
              setEditing({ id: null, value: { ...EMPTY_ADDRESS, isDefault: items.length === 0 } })
            }
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Agregar dirección
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}

      {editing ? (
        <AddressForm
          value={editing.value}
          onChange={(value) => setEditing({ ...editing, value })}
          onCancel={() => {
            setEditing(null);
            setError(null);
          }}
          onSave={save}
          busy={busy}
          isNew={!editing.id}
        />
      ) : items === null ? (
        <p className="py-6 text-center text-sm text-fg-muted">Cargando…</p>
      ) : items === 'error' ? (
        <p className="py-6 text-center text-sm text-fg-muted">No pudimos cargar tus direcciones.</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[rgb(var(--color-fg)/0.15)] py-8 text-center text-sm text-fg-muted">
          Guardá una dirección y la próxima compra se completa sola.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((a) => (
            <li key={a.id} className="rounded-2xl border border-[rgb(var(--color-fg)/0.12)] p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <MapPin className="h-4 w-4" aria-hidden /> {a.label || 'Dirección'}
                {a.isDefault && (
                  <span className="rounded-full bg-[rgb(var(--color-primary)/0.12)] px-2 py-0.5 text-[11px] font-semibold text-primary-ink">
                    Predeterminada
                  </span>
                )}
              </div>
              <p className="mt-1">{[a.name, a.lastName].filter(Boolean).join(' ')}</p>
              <p className="text-fg-muted">{formatAddress(a)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={BTN_OUTLINE}
                  onClick={() => setEditing({ id: a.id, value: { ...a } })}
                >
                  Editar
                </button>
                {!a.isDefault && (
                  <button
                    type="button"
                    className={BTN_OUTLINE}
                    disabled={busy}
                    onClick={() => send('POST', `/${a.id}/default`)}
                  >
                    <Star className="h-3.5 w-3.5" aria-hidden /> Usar como predeterminada
                  </button>
                )}
                <button
                  type="button"
                  className={BTN_OUTLINE}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('¿Borrar esta dirección?')) void send('DELETE', `/${a.id}`);
                  }}
                >
                  Borrar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddressForm({
  value,
  onChange,
  onCancel,
  onSave,
  busy,
  isNew,
}: {
  value: SavedAddressInput;
  onChange: (v: SavedAddressInput) => void;
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
  isNew: boolean;
}) {
  const id = useId();
  const field = (
    key: keyof SavedAddressInput,
    label: string,
    opts: { required?: boolean; auto?: string; wide?: boolean } = {},
  ) => (
    <label
      className={`block text-xs font-medium ${opts.wide ? 'sm:col-span-2' : ''}`}
      htmlFor={`${id}-${key}`}
    >
      {label}
      {opts.required && <span aria-hidden> *</span>}
      <input
        id={`${id}-${key}`}
        className={`${INPUT_THEMED_11} mt-1`}
        value={String(value[key] ?? '')}
        required={opts.required}
        autoComplete={opts.auto}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <form
      className="rounded-2xl border border-[rgb(var(--color-fg)/0.12)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {field('label', 'Nombre de la dirección (ej. Casa)', { wide: true })}
        {field('name', 'Nombre de quien recibe', { required: true, auto: 'given-name' })}
        {field('lastName', 'Apellido', { auto: 'family-name' })}
        {field('street', 'Calle', { required: true, auto: 'address-line1' })}
        {field('streetNumber', 'Número', { required: true })}
        {field('apartment', 'Piso / depto', { auto: 'address-line2' })}
        {field('city', 'Ciudad', { required: true, auto: 'address-level2' })}
        {field('province', 'Provincia', { auto: 'address-level1' })}
        {field('zip', 'Código postal', { required: true, auto: 'postal-code' })}
        {field('phone', 'Teléfono', { auto: 'tel' })}
        {field('doc', 'DNI o CUIT')}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.isDefault}
          onChange={(e) => onChange({ ...value, isDefault: e.target.checked })}
        />
        Usar como predeterminada
      </label>
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {isNew ? 'Guardar dirección' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2.5 text-sm font-medium hover:underline"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
