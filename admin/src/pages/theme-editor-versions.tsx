import { useEffect, useState } from 'react';
import { CalendarClock, History, Loader2, Store } from 'lucide-react';
import { Modal, useToast } from '@tiendafy/ui';
import { type ThemeConfig } from '@tiendafy/types';
import { api, errMsg } from '../lib/api';
import { formatDateTime } from '../lib/format';

interface Version {
  id: string;
  publishedAtUtc: string;
}

/**
 * Historial de publicaciones.
 *
 * Publicar es lo único irreversible del editor: al segundo siguiente lo ve todo
 * el que entra a la tienda. Volver a una versión la carga en el BORRADOR — se
 * mira en la vista previa y se publica si era eso, en vez de cambiarle la
 * tienda al comercio de un click.
 */
export function HistoryModal({
  open,
  onClose,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  onRestored: (config: Partial<ThemeConfig>) => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<Version[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setItems(null);
    api
      .get<{ items: Version[] }>('/api/v1/theme/history')
      .then((r) => setItems(r.items ?? []))
      .catch(() => setItems([]));
  }, [open]);

  const restore = async (v: Version) => {
    setBusy(v.id);
    try {
      const cfg = await api.post<Partial<ThemeConfig>>(`/api/v1/theme/history/${v.id}/restore`, {});
      onRestored(cfg);
      toast('Versión cargada en el borrador. Revisala y publicá.', { variant: 'success' });
      onClose();
    } catch (err) {
      toast(errMsg(err, 'No se pudo restaurar esa versión.'), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Historial de publicaciones">
      {items === null ? (
        <div className="flex items-center gap-2 py-6 text-sm text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : items.length === 0 ? (
        <p className="py-4 text-sm text-fg-muted">
          Todavía no hay versiones anteriores. Se guarda una cada vez que publicás un cambio.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-fg-muted">
            Cada línea es cómo se veía tu tienda antes de una publicación. Se guardan las últimas 20.
          </p>
          <ul className="space-y-1.5">
            {items.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm text-fg">
                  <History className="h-4 w-4 text-fg-muted" />
                  {formatDateTime(v.publishedAtUtc)}
                </span>
                <button
                  onClick={() => restore(v)}
                  disabled={busy !== null}
                  className="shrink-0 text-sm font-medium text-primary hover:underline disabled:opacity-50"
                >
                  {busy === v.id ? 'Cargando…' : 'Volver a esta'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

/**
 * Copiar el diseño publicado de otra tienda del mismo dueño.
 *
 * Acá una empresa tiene varias tiendas por rubro: cuando cambia la identidad,
 * rehacerla tienda por tienda es la forma segura de que queden distintas.
 */
export function CopyFromStoreModal({
  open,
  onClose,
  stores,
  currentId,
  onCopied,
}: {
  open: boolean;
  onClose: () => void;
  stores: { id: string; name: string }[];
  currentId: string;
  onCopied: (config: Partial<ThemeConfig>) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const others = stores.filter((s) => s.id !== currentId);

  const copy = async (store: { id: string; name: string }) => {
    setBusy(store.id);
    try {
      const cfg = await api.post<Partial<ThemeConfig>>(`/api/v1/theme/copy-from/${store.id}`, {});
      onCopied(cfg);
      toast(`Diseño de ${store.name} copiado al borrador.`, { variant: 'success' });
      onClose();
    } catch (err) {
      toast(errMsg(err, 'No se pudo copiar ese diseño.'), { variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Copiar el diseño de otra tienda">
      <p className="mb-3 text-sm text-fg-muted">
        Se copia lo <strong>publicado</strong> de la otra tienda a tu borrador: colores, fuentes, encabezado,
        pie y secciones. Tu tienda no cambia hasta que publiques. Los productos, el logo cargado y los datos
        de contacto de cada tienda no se tocan.
      </p>
      {others.length === 0 ? (
        <p className="py-2 text-sm text-fg-muted">No tenés otra tienda para copiar.</p>
      ) : (
        <ul className="space-y-1.5">
          {others.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm text-fg">
                <Store className="h-4 w-4 text-fg-muted" />
                {s.name}
              </span>
              <button
                onClick={() => copy(s)}
                disabled={busy !== null}
                className="shrink-0 text-sm font-medium text-primary hover:underline disabled:opacity-50"
              >
                {busy === s.id ? 'Copiando…' : 'Copiar'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/**
 * Programar la publicación.
 *
 * El comercio arma la portada del Hot Sale el martes y quiere que salga el
 * viernes a las 00:00 sin quedarse despierto. Se congela lo que hay ahora: entre
 * hoy y el viernes puede seguir editando sin que eso cambie lo que va a salir.
 */
export function ScheduleModal({
  open,
  onClose,
  theme,
  scheduledAtUtc,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  theme: ThemeConfig;
  scheduledAtUtc: string | null;
  onChanged: (at: string | null) => void;
}) {
  const { toast } = useToast();
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setWhen('');
  }, [open]);

  const save = async () => {
    if (!when) return;
    setBusy(true);
    try {
      // El input da hora local; el backend trabaja en UTC.
      const at = new Date(when);
      const r = await api.post<{ scheduledAtUtc: string }>('/api/v1/theme/schedule', {
        config: theme,
        atUtc: at.toISOString(),
      });
      onChanged(r.scheduledAtUtc);
      toast('Publicación programada.', { variant: 'success' });
      onClose();
    } catch (err) {
      toast(errMsg(err, 'No se pudo programar.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api.delete('/api/v1/theme/schedule');
      onChanged(null);
      toast('Programación cancelada.', { variant: 'success' });
      onClose();
    } catch (err) {
      toast(errMsg(err, 'No se pudo cancelar.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Programar la publicación">
      {scheduledAtUtc && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-border bg-bg-muted px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-fg">
            <CalendarClock className="h-4 w-4 text-fg-muted" />
            Programado para {formatDateTime(scheduledAtUtc)}
          </span>
          <button
            onClick={cancel}
            disabled={busy}
            className="shrink-0 text-sm font-medium text-danger hover:underline disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      )}
      <p className="mb-3 text-sm text-fg-muted">
        Se guarda el diseño <strong>tal como está ahora</strong> y sale solo en la fecha que elijas. Podés
        seguir editando: lo que sigas cambiando no se publica hasta que lo publiques a mano.
      </p>
      <label className="mb-1.5 block text-sm font-medium text-fg" htmlFor="theme-schedule-at">
        Fecha y hora
      </label>
      <input
        id="theme-schedule-at"
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="inline-flex h-10 items-center rounded-md border border-border-strong px-4 text-sm font-medium text-fg hover:bg-bg-muted"
        >
          Cerrar
        </button>
        <button
          onClick={save}
          disabled={!when || busy}
          className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-fg disabled:opacity-50"
        >
          Programar
        </button>
      </div>
    </Modal>
  );
}
