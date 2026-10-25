import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Input, Spinner, Switch, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { invalidateAi, parseUsd, SUGGESTED_BUDGET_USD, usdToInput, type AiSettings } from '../../lib/ai';
import { useStore } from '../../context/StoreContext';
import { SETTINGS_CARD } from '../../lib/styles';
import { useUnsavedInScope } from '../../lib/unsavedScope';

/** Interruptor, tope mensual y umbral de aviso. El interruptor no se prende sin tope. */
export function AiBudgetCard({ settings }: { settings: AiSettings }) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const budgetText = budget ?? usdToInput(settings.monthlyBudgetUsd);
  const thresholdText = threshold ?? String(settings.alertThresholdPct);
  const budgetUsd = budgetText.trim() === '' ? 0 : parseUsd(budgetText);
  const thresholdPct = /^\d+$/.test(thresholdText) ? Number(thresholdText) : null;
  const hasBudget = budgetUsd !== null && budgetUsd > 0;
  // Sin tope no hay IA prendida: si se borra el tope, el interruptor se apaga solo.
  const isEnabled = (enabled ?? settings.enabled) && hasBudget;

  const valid = budgetUsd !== null && thresholdPct !== null && thresholdPct >= 1 && thresholdPct <= 100;
  const dirty =
    isEnabled !== settings.enabled ||
    budgetUsd !== settings.monthlyBudgetUsd ||
    thresholdPct !== settings.alertThresholdPct;
  useUnsavedInScope(dirty);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await api.put('/api/v1/ai/config/settings', {
        enabled: isEnabled,
        monthlyBudgetUsd: budgetUsd,
        alertThresholdPct: thresholdPct,
      });
      await invalidateAi(qc, store?.id);
      setEnabled(null);
      setBudget(null);
      setThreshold(null);
      toast('Presupuesto guardado', { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar el presupuesto.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={SETTINGS_CARD}>
      <h2 className="text-base font-semibold text-fg">Presupuesto</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Cuando se llega al tope del mes, la inteligencia artificial se frena hasta el mes siguiente o hasta
        que lo subas. Es un cálculo estimado: poné también un límite en la consola de cada proveedor.
      </p>

      <div className="mt-4">
        <Switch
          checked={isEnabled}
          onChange={setEnabled}
          disabled={!hasBudget}
          label="Usar inteligencia artificial en esta tienda"
          description={hasBudget ? undefined : 'Cargá un tope mensual para poder prenderla.'}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ai-budget" className="text-sm font-medium text-fg">
            Tope mensual (US$)
          </label>
          <Input
            id="ai-budget"
            compact
            inputMode="decimal"
            className="mt-1"
            placeholder="Sin tope"
            value={budgetText}
            error={budgetUsd === null}
            onChange={(e) => setBudget(e.target.value)}
          />
          {!hasBudget && (
            <button
              type="button"
              className="mt-1 text-xs font-medium text-primary underline"
              onClick={() => setBudget(String(SUGGESTED_BUDGET_USD))}
            >
              Poner US$ {SUGGESTED_BUDGET_USD}
            </button>
          )}
        </div>
        <div>
          <label htmlFor="ai-threshold" className="text-sm font-medium text-fg">
            Avisarme al llegar al (%)
          </label>
          <Input
            id="ai-threshold"
            compact
            inputMode="numeric"
            className="mt-1"
            value={thresholdText}
            error={!valid && thresholdPct === null}
            onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ''))}
          />
          <p className="mt-1 text-xs text-fg-subtle">El aviso aparece en Inicio. Entre 1 y 100.</p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={() => void save()} disabled={!dirty || !valid || saving}>
          {saving && <Spinner inline />} Guardar presupuesto
        </Button>
      </div>
    </section>
  );
}
