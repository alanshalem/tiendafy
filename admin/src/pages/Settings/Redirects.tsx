import { useCallback, useEffect, useState, useId } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button, Input, useConfirm, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { formatDateTime, formatNumber } from '../../lib/format';
import { useStore } from '../../context/StoreContext';
import { SettingsHeader } from './SettingsLayout';
import { HelpLink } from '../../components/HelpLink';
import { SETTINGS_CARD, TABLE_HEAD_STICKY } from '../../lib/styles';

/**
 * Redirecciones 301: URL vieja → URL nueva.
 *
 * El storefront las consulta recién cuando una página no existe, así que cada
 * regla que se dispara es una visita que se salvó de un 404. Por eso se muestra
 * cuántas veces se usó cada una: una que nunca corre se puede borrar, y una que
 * corre mucho suele señalar un link roto que conviene arreglar en el origen.
 */
interface Redirect {
  id: string;
  from: string;
  to: string;
  hits: number;
  lastHitAtUtc: string | null;
}

export function RedirectsPage() {
  const fid = useId();
  const { store } = useStore();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [items, setItems] = useState<Redirect[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    api
      .get<{ items: Redirect[] }>('/api/v1/redirects/')
      .then((d) => setItems(d.items ?? []))
      .catch((err) => {
        setItems(null);
        setLoadError(errMsg(err, 'No se pudieron cargar las redirecciones.'));
      });
  }, []);

  useEffect(() => {
    if (store) load();
  }, [store, load]);

  const add = async () => {
    setBusy(true);
    try {
      await api.post('/api/v1/redirects/', { from, to });
      setFrom('');
      setTo('');
      toast('Redirección creada', { variant: 'success' });
      load();
    } catch (err) {
      toast(errMsg(err, 'No se pudo crear la redirección.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (rule: Redirect) => {
    const ok = await confirm({
      title: 'Eliminar redirección',
      message: `${rule.from} va a volver a mostrar la pantalla de "página no encontrada".`,
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/v1/redirects/${rule.id}`);
      toast('Redirección eliminada', { variant: 'success' });
      load();
    } catch (err) {
      toast(errMsg(err, 'No se pudo eliminar.'), { variant: 'error' });
    }
  };

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <SettingsHeader
        title="Redirecciones"
        description="Cuando cambiás la dirección de un producto o borrás una página, el link que ya circula por ahí queda roto. Una redirección lo manda al lugar nuevo y le pasa a Google el posicionamiento que tenía."
      />

      <div className={SETTINGS_CARD}>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor={`${fid}-1`} className="mb-1.5 block text-sm font-medium text-fg">
              Dirección vieja
            </label>
            <Input
              id={`${fid}-1`}
              aria-label="Dirección vieja"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="/producto-viejo"
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <label htmlFor={`${fid}-2`} className="mb-1.5 block text-sm font-medium text-fg">
              Dirección nueva
            </label>
            <Input
              id={`${fid}-2`}
              aria-label="Dirección nueva"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="/productos/nuevo-slug"
            />
          </div>
          <Button onClick={add} disabled={!from.trim() || !to.trim() || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Agregar
          </Button>
        </div>
        <p className="mt-2 text-xs text-fg-muted">
          Solo la parte que va después del dominio. Se guarda al agregar: no hay nada más que confirmar.
        </p>

        {loadError && <p className="mt-4 text-sm text-danger">{loadError}</p>}

        {items && items.length === 0 && (
          <p className="mt-4 rounded-lg border border-dashed border-border py-8 text-center text-sm text-fg-muted">
            Todavía no hay ninguna. Creá una cada vez que cambies o borres una dirección que ya estaba
            publicada.
          </p>
        )}

        {items && items.length > 0 && (
          <table className="mt-4 w-full text-sm">
            <thead className={TABLE_HEAD_STICKY}>
              <tr className="border-b border-border text-left text-xs text-fg-muted">
                <th className="py-2 font-medium">Desde</th>
                <th className="py-2 font-medium">Hacia</th>
                <th className="py-2 font-medium">Se usó</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="py-2 font-mono text-xs text-fg">{r.from}</td>
                  <td className="py-2 font-mono text-xs text-fg">{r.to}</td>
                  <td className="py-2 text-xs">
                    {r.hits === 0 ? (
                      <span className="text-fg-subtle">Nunca</span>
                    ) : (
                      <span className="text-fg" title={r.lastHitAtUtc ? formatDateTime(r.lastHitAtUtc) : ''}>
                        {formatNumber(r.hits)} {r.hits === 1 ? 'vez' : 'veces'}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => remove(r)}
                      aria-label={`Eliminar la redirección de ${r.from}`}
                      className="rounded-md p-1 text-fg-muted hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <HelpLink id="ajustesAvanzados" />
    </div>
  );
}
