import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Select, Spinner, useToast } from '@tiendafy/ui';
import { api, errMsg } from '../../lib/api';
import { invalidateAi, type AiAssignment, type AiTaskOptions } from '../../lib/ai';
import { useStore } from '../../context/StoreContext';
import { SETTINGS_CARD } from '../../lib/styles';
import { useUnsavedInScope } from '../../lib/unsavedScope';

interface Pair {
  primary: string;
  fallback: string;
}
type Draft = Record<string, Pair>;

const fromServer = (assignments: AiAssignment[]): Draft =>
  Object.fromEntries(
    assignments.map((a) => [a.task, { primary: a.primaryModel, fallback: a.fallbackModel ?? '' }]),
  );

/** Modelo principal y de respaldo de cada tarea, entre los que sirven y tienen clave cargada. */
export function AiModelsCard({
  tasks,
  assignments,
}: {
  tasks: AiTaskOptions[];
  assignments: AiAssignment[];
}) {
  const { store } = useStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const saved = fromServer(assignments);
  const current = draft ?? saved;
  const dirty =
    draft !== null && JSON.stringify(normalize(draft, tasks)) !== JSON.stringify(normalize(saved, tasks));
  useUnsavedInScope(dirty);

  const set = (task: string, patch: Partial<Pair>) =>
    setDraft({ ...current, [task]: { primary: '', fallback: '', ...current[task], ...patch } });

  const useSuggested = () => {
    const next: Draft = { ...current };
    for (const t of tasks) {
      const suggested = t.suggestedModels[0];
      if (!suggested) continue;
      const fallback = next[t.task]?.fallback ?? '';
      next[t.task] = { primary: suggested, fallback: fallback === suggested ? '' : fallback };
    }
    setDraft(next);
  };

  const save = async () => {
    const items = tasks
      .filter((t) => current[t.task]?.primary)
      .map((t) => ({
        task: t.task,
        primaryModel: current[t.task]!.primary,
        fallbackModel: current[t.task]!.fallback || null,
      }));
    setSaving(true);
    try {
      await api.put('/api/v1/ai/config/assignments', { items });
      await invalidateAi(qc, store?.id);
      setDraft(null);
      toast('Modelos guardados', { variant: 'success' });
    } catch (err) {
      toast(errMsg(err, 'No se pudieron guardar los modelos.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const anyEligible = tasks.some((t) => t.eligibleModels.length > 0);

  return (
    <section className={SETTINGS_CARD}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-fg">Modelos por tarea</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Elegí qué modelo hace cada trabajo. El de respaldo entra cuando el principal no responde. Solo
            aparecen los modelos que sirven para la tarea y de proveedores con clave cargada.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={useSuggested} disabled={!anyEligible}>
          Usar recomendados
        </Button>
      </div>

      {!anyEligible && (
        <p className="mt-3 text-sm text-warning">
          Cargá la clave de algún proveedor para poder elegir modelos.
        </p>
      )}

      <ul className="mt-4 divide-y divide-border">
        {tasks.map((t) => {
          const pair = current[t.task] ?? { primary: '', fallback: '' };
          return (
            <li key={t.task} className="py-3">
              <p className="text-sm font-medium text-fg">{t.label}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Select
                  aria-label={`Modelo principal de ${t.label}`}
                  placeholder="Elegí un modelo"
                  value={pair.primary}
                  onChange={(e) => set(t.task, { primary: e.target.value })}
                  options={optionsFor(t, pair.primary, '')}
                />
                <Select
                  aria-label={`Modelo de respaldo de ${t.label}`}
                  placeholder="Sin respaldo"
                  value={pair.fallback}
                  onChange={(e) => set(t.task, { fallback: e.target.value })}
                  options={optionsFor(t, pair.fallback, pair.primary)}
                />
              </div>
              {t.warning && <p className="mt-1.5 text-xs text-warning">{t.warning}</p>}
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex justify-end">
        <Button onClick={() => void save()} disabled={!dirty || saving}>
          {saving && <Spinner inline />} Guardar modelos
        </Button>
      </div>
    </section>
  );
}

/**
 * Los elegibles de la tarea; si lo que quedó guardado ya no está entre ellos (se borró la clave
 * de su proveedor), se deja a la vista marcado para que se note en vez de mostrar un campo en blanco.
 */
function optionsFor(t: AiTaskOptions, selected: string, exclude: string) {
  const ids = t.eligibleModels.filter((m) => m !== exclude);
  const options = ids.map((m) => ({ value: m, label: m }));
  if (selected && !ids.includes(selected))
    options.push({ value: selected, label: `${selected} (sin clave o no disponible)` });
  return options;
}

/** Solo lo que cuenta para comparar: tareas con principal, en el orden de la pantalla. */
const normalize = (d: Draft, tasks: AiTaskOptions[]) =>
  tasks.filter((t) => d[t.task]?.primary).map((t) => [t.task, d[t.task]!.primary, d[t.task]!.fallback]);
