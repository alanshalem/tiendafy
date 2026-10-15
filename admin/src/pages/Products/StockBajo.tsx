import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, PackageCheck, Plus, Settings2 } from 'lucide-react';
import { Badge, Button, Checkbox, cn, Switch, usePrompt, useToast, Spinner, PageHeader } from '@tiendafy/ui';
import { formatDateTime } from '@tiendafy/types';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { usePermissions } from '../../context/PermissionsContext';
import { NoStoreSelected } from '../../components/NoStoreSelected';
import { ERROR_SHOWN, LoadError } from '../../components/LoadError';
import { HelpLink } from '../../components/HelpLink';
import { TABLE_CARD, TABLE_HEAD_STICKY_SUBTLE, TABLE_SCROLL_X } from '../../lib/styles';
import {
  itemLabel,
  MODE_LABEL,
  type LowStockItem,
  type LowStockResponse,
  type StockAlertSettings,
} from '../../lib/stockAlerts';
import type { FormItem } from '../compras-tipos';

/**
 * Stock bajo: lo que se agota antes de que llegue la próxima compra (la
 * misma cuenta que Compras › Reposición) y lo que está por debajo del
 * mínimo propio de cada producto, con el pedido sugerido. De acá sale la
 * orden de compra armada.
 */
export function StockBajoPage() {
  const { store } = useStore();
  const { can } = usePermissions();
  const { toast } = useToast();
  const prompt = usePrompt();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['stock-alerts', store?.id],
    queryFn: () => api.get<LowStockResponse>('/api/v1/stock-alerts'),
    enabled: !!store,
    meta: ERROR_SHOWN,
  });
  const { data: settings } = useQuery({
    queryKey: ['stock-alert-settings', store?.id],
    queryFn: () => api.get<StockAlertSettings>('/api/v1/stock-alerts/settings'),
    enabled: !!store,
    meta: ERROR_SHOWN,
  });

  if (!store) return <NoStoreSelected />;

  const items = data?.items ?? [];
  const canEdit = can('inventory.write');
  const canBuy = can('purchasing.manage');
  const chosen = items.filter((i) => selected.has(i.variantId));
  const forOrder = chosen.length > 0 ? chosen : items;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['stock-alerts', store.id] });
    void queryClient.invalidateQueries({ queryKey: ['stock-alerts-count', store.id] });
  };

  const setRule = async (item: LowStockItem, minUnits: number | null, muted: boolean) => {
    setSaving(item.variantId);
    try {
      await api.put(`/api/v1/stock-alerts/rules/${item.variantId}`, { minUnits, muted });
      toast(muted ? `${itemLabel(item)} ya no avisa.` : 'Mínimo guardado.', { variant: 'success' });
      refresh();
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar.'), { variant: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const editMinimum = async (item: LowStockItem) => {
    const value = await prompt({
      title: `Mínimo de ${itemLabel(item)}`,
      message:
        'Avisamos cuando el stock llega a este número o menos, aunque no se venda. Vacío = sin mínimo propio.',
      defaultValue: item.minUnits?.toString() ?? '',
      confirmLabel: 'Guardar',
    });
    if (value === null) return;
    const n = value.trim() === '' ? null : Number(value);
    if (n !== null && (!Number.isInteger(n) || n < 0)) {
      toast('El mínimo es un número entero de unidades.', { variant: 'error' });
      return;
    }
    await setRule(item, n, false);
  };

  const setOptOut = async (optOut: boolean) => {
    try {
      await api.put('/api/v1/stock-alerts/settings/me', { optOut });
      void queryClient.invalidateQueries({ queryKey: ['stock-alert-settings', store.id] });
      toast(optOut ? 'Listo: no te mandamos más estos emails.' : 'Listo: te vamos a avisar por email.', {
        variant: 'success',
      });
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar.'), { variant: 'error' });
    }
  };

  // La orden de compra sale armada con lo sugerido: se revisa en Compras antes de guardarla.
  const buildOrder = () => {
    const draftItems: FormItem[] = forOrder.map((i) => ({
      variantId: i.variantId,
      label: itemLabel(i),
      sku: i.sku,
      quantity: String(i.suggestedQty),
      unitCost: '',
    }));
    navigate('/compras?orden=nueva', { state: { draftItems } });
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock bajo"
        subtitle="Lo que se agota antes de que llegue la próxima compra (con lo vendido en 60 días, en la tienda y en Mercado Libre) y lo que bajó de su mínimo."
        actions={
          canBuy &&
          items.length > 0 && (
            <Button onClick={buildOrder}>
              <Plus className="h-4 w-4" /> Armar orden de compra ({forOrder.length})
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
        <span className="text-fg-muted">
          Avisos de la tienda:{' '}
          <span className="font-medium text-fg">
            {data ? MODE_LABEL[data.mode] : '…'}
            {data?.mode === 'diario' && settings ? ` (a las ${settings.digestHour} h)` : ''}
          </span>
        </span>
        {canEdit && (
          <Link
            to="/configuracion/alertas-de-stock"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            <Settings2 className="h-4 w-4" /> Configurar
          </Link>
        )}
        {settings?.me.eligible && (
          <div className="ml-auto">
            <Switch
              checked={!settings.me.optedOut}
              onChange={(on) => void setOptOut(!on)}
              label="Recibir estos avisos por email"
            />
          </div>
        )}
      </div>

      <div className={TABLE_CARD}>
        {isLoading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-fg-muted">
            <Spinner inline /> Calculando…
          </p>
        ) : error && !data ? (
          <LoadError
            className="m-3"
            title="No se pudo calcular el stock bajo."
            error={error}
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center text-fg-muted">
            <PackageCheck className="h-8 w-8 opacity-50" />
            <p className="text-sm">Nada por reponer: el stock cubre las ventas hasta la próxima compra.</p>
          </div>
        ) : (
          <div className={TABLE_SCROLL_X}>
            <table className="w-full text-sm">
              <thead className={TABLE_HEAD_STICKY_SUBTLE}>
                <tr className="border-b border-border bg-bg-subtle text-left text-fg-muted">
                  {canBuy && (
                    <th className="w-10 px-3 py-2.5">
                      <span className="sr-only">Elegir</span>
                    </th>
                  )}
                  <th className="px-3 py-2.5 font-medium">Producto</th>
                  <th className="px-3 py-2.5 text-right font-medium">Stock</th>
                  <th className="px-3 py-2.5 font-medium">Por qué</th>
                  <th className="px-3 py-2.5 text-right font-medium">Pedir</th>
                  <th className="px-3 py-2.5 font-medium">Desde</th>
                  {canEdit && (
                    <th className="px-3 py-2.5">
                      <span className="sr-only">Acciones</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.variantId} className="border-b border-border last:border-b-0">
                    {canBuy && (
                      <td className="px-3 py-2.5">
                        <Checkbox
                          aria-label={`Elegir ${itemLabel(i)}`}
                          checked={selected.has(i.variantId)}
                          onChange={() => toggle(i.variantId)}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <div className="text-fg">{itemLabel(i)}</div>
                      <div className="font-mono text-xs text-fg-subtle">{i.sku}</div>
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 text-right tabular-nums',
                        i.available === 0 ? 'font-semibold text-danger' : 'text-fg',
                      )}
                    >
                      {i.available}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-fg-muted">
                      {i.reason === 'minimo' ? (
                        <Badge variant="warning">Bajo el mínimo ({i.minUnits})</Badge>
                      ) : (
                        <>
                          Alcanza {i.coverageDays} días
                          {i.unitsPerDay != null && (
                            <span className="text-fg-subtle"> · {i.unitsPerDay}/día</span>
                          )}
                          {i.minUnits != null && (
                            <span className="text-fg-subtle"> · mínimo {i.minUnits}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-fg">
                      {i.suggestedQty} u
                    </td>
                    <td className="px-3 py-2.5 text-xs text-fg-muted">
                      {i.crossedAtUtc ? formatDateTime(i.crossedAtUtc) : '—'}
                      {i.notifiedAtUtc && <div className="text-fg-subtle">Avisado</div>}
                    </td>
                    {canEdit && (
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving === i.variantId}
                          onClick={() => void editMinimum(i)}
                        >
                          Mínimo
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving === i.variantId}
                          onClick={() => void setRule(i, i.minUnits, true)}
                          title="No avisar más por este producto (por ejemplo, si se discontinúa)"
                        >
                          <BellOff className="h-4 w-4" /> Silenciar
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <HelpLink id="stockBajo" />
    </div>
  );
}
