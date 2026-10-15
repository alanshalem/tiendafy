import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../lib/queryKeys';
import { Trash2 } from 'lucide-react';
import { Badge, Button, Input, Radio, RadioGroup, Select, Switch, useToast, Spinner } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { useStore } from '../../context/StoreContext';
import { ERROR_SHOWN, LoadError } from '../../components/LoadError';
import { HelpLink } from '../../components/HelpLink';
import { VariantPicker } from '../../components/VariantPicker';
import { SETTINGS_CARD } from '../../lib/styles';
import { useUnsavedInScope } from '../../lib/unsavedScope';
import { SettingsHeader } from './SettingsLayout';
import {
  itemLabel,
  MODE_LABEL,
  type StockAlertMode,
  type StockAlertRule,
  type StockAlertSettings,
} from '../../lib/stockAlerts';

const MODES: StockAlertMode[] = ['off', 'inmediato', 'diario'];
const MODE_HELP: Record<StockAlertMode, string> = {
  off: 'Lo bajo se ve igual en Productos › Stock bajo y en el contador del menú.',
  inmediato: 'Un email apenas un producto cruza su punto de reposición (miramos cada 5 minutos).',
  diario: 'Un solo email por día con todo lo que cruzó desde el anterior.',
};

/**
 * Configuración de las alertas de stock bajo: cuándo avisa la tienda, a
 * quién le llega y los mínimos propios o silenciados de cada producto.
 */
export function StockAlertsPage() {
  const { store } = useStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<StockAlertMode | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const settingsQuery = useQuery({
    queryKey: qk.stockAlertSettings(store?.id),
    queryFn: () => api.get<StockAlertSettings>('/api/v1/stock-alerts/settings'),
    enabled: !!store,
    meta: ERROR_SHOWN,
  });
  const rulesQuery = useQuery({
    queryKey: ['stock-alert-rules', store?.id],
    queryFn: () => api.get<{ items: StockAlertRule[] }>('/api/v1/stock-alerts/rules'),
    enabled: !!store,
    meta: ERROR_SHOWN,
  });

  const settings = settingsQuery.data;
  const currentMode = mode ?? settings?.mode ?? 'off';
  const currentHour = hour ?? settings?.digestHour ?? 9;
  const dirty = !!settings && (currentMode !== settings.mode || currentHour !== settings.digestHour);
  useUnsavedInScope(dirty);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/v1/stock-alerts/settings', { mode: currentMode, digestHour: currentHour });
      await queryClient.invalidateQueries({ queryKey: qk.stockAlertSettings(store?.id) });
      void queryClient.invalidateQueries({ queryKey: qk.stockAlerts(store?.id) });
      setMode(null);
      setHour(null);
      toast('Alertas guardadas', { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const saveRule = async (variantId: string, minUnits: number | null, muted: boolean) => {
    try {
      await api.put(`/api/v1/stock-alerts/rules/${variantId}`, { minUnits, muted });
      void queryClient.invalidateQueries({ queryKey: ['stock-alert-rules', store?.id] });
      void queryClient.invalidateQueries({ queryKey: qk.stockAlerts(store?.id) });
      void queryClient.invalidateQueries({ queryKey: qk.stockAlertsCount(store?.id) });
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar.'), { variant: 'error' });
    }
  };

  if (settingsQuery.error && !settings)
    return (
      <LoadError
        title="No se pudo cargar la configuración de alertas."
        error={settingsQuery.error}
        onRetry={() => void settingsQuery.refetch()}
        retrying={settingsQuery.isFetching}
      />
    );

  const rules = rulesQuery.data?.items ?? [];
  const recipients = settings?.recipients ?? [];

  return (
    <div className="max-w-3xl space-y-5">
      <SettingsHeader
        title="Alertas de stock"
        description="Te avisamos una vez cada vez que un producto cruza su punto de reposición: el stock que queda no llega a cubrir las ventas hasta que entre la próxima compra."
      />

      <section className={SETTINGS_CARD}>
        <h2 className="text-base font-semibold text-fg">Cuándo avisar</h2>
        {!settings ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-fg-muted">
            <Spinner inline /> Cargando…
          </p>
        ) : (
          <>
            <RadioGroup legend={<span className="sr-only">Cuándo avisar</span>} className="mt-3">
              {MODES.map((m) => (
                <Radio
                  key={m}
                  name="stock-alert-mode"
                  label={MODE_LABEL[m]}
                  description={MODE_HELP[m]}
                  checked={currentMode === m}
                  onChange={() => setMode(m)}
                />
              ))}
            </RadioGroup>
            {currentMode === 'diario' && (
              <div className="mt-3 w-56">
                <Select
                  aria-label="Hora del resumen"
                  value={String(currentHour)}
                  onChange={(e) => setHour(Number(e.target.value))}
                  options={Array.from({ length: 24 }, (_, h) => ({
                    value: String(h),
                    label: `A las ${h} h`,
                  }))}
                />
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button onClick={() => void save()} disabled={!dirty || saving}>
                {saving && <Spinner inline />} Guardar
              </Button>
            </div>
          </>
        )}
      </section>

      <section className={SETTINGS_CARD}>
        <h2 className="text-base font-semibold text-fg">A quién le llega</h2>
        <p className="mt-1 text-sm text-fg-muted">
          A quienes tienen el permiso «Compras e importaciones»: es lo que hace falta para armar la orden.
          Cada persona se puede dar de baja desde Productos › Stock bajo. No hay aviso por WhatsApp: el
          WhatsApp de la tienda le escribe al comprador, no al equipo.
        </p>
        {recipients.length === 0 ? (
          <p className="mt-3 text-sm text-warning">
            Nadie del equipo tiene «Compras e importaciones»: dáselo a alguien en{' '}
            <Link to="/configuracion/roles" className="font-medium underline">
              Roles y permisos
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {recipients.map((r) => (
              <li key={r.userId} className="flex items-center gap-2 py-2">
                <span className="text-fg">{r.name}</span>
                <span className="truncate text-xs text-fg-subtle">{r.email}</span>
                {r.optedOut && (
                  <Badge variant="neutral" className="ml-auto">
                    Se dio de baja
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={SETTINGS_CARD}>
        <h2 className="text-base font-semibold text-fg">Mínimos y productos silenciados</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Un mínimo propio avisa cuando el stock llega a ese número, aunque el producto no tenga ventas
          recientes. Silenciar sirve para lo que se discontinúa.
        </p>
        <div className="mt-3">
          <VariantPicker
            placeholder="Buscá un producto para ponerle mínimo…"
            exclude={new Set(rules.map((r) => r.variantId))}
            onPick={(v) => void saveRule(v.variantId, 1, false)}
          />
        </div>
        {rules.length > 0 && (
          <ul className="mt-3 divide-y divide-border text-sm">
            {rules.map((r) => (
              <RuleRow key={r.variantId} rule={r} onSave={saveRule} />
            ))}
          </ul>
        )}
      </section>
      <HelpLink id="stockBajo" />
    </div>
  );
}

function RuleRow({
  rule,
  onSave,
}: {
  rule: StockAlertRule;
  onSave: (variantId: string, minUnits: number | null, muted: boolean) => Promise<void>;
}) {
  const [min, setMin] = useState(rule.minUnits?.toString() ?? '');
  const parsed = min.trim() === '' ? null : Number(min);
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= 0);
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="text-fg">{itemLabel(rule)}</span>
        <span className="ml-1 font-mono text-xs text-fg-subtle">{rule.sku}</span>
      </span>
      <div className="w-24">
        <Input
          compact
          inputMode="numeric"
          aria-label={`Mínimo de ${itemLabel(rule)}`}
          placeholder="Sin mínimo"
          value={min}
          error={!valid}
          onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))}
          onBlur={() => {
            if (valid && parsed !== rule.minUnits) void onSave(rule.variantId, parsed, rule.muted);
          }}
        />
      </div>
      <Switch
        checked={rule.muted}
        onChange={(muted) => void onSave(rule.variantId, parsed, muted)}
        label="Silenciado"
      />
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Quitar la regla de ${itemLabel(rule)}`}
        onClick={() => void onSave(rule.variantId, null, false)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}
