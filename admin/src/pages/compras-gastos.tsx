import { Button, Card, Input, Select } from '@tiendafy/ui';
import { Plus, Trash2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { FormExpense, PoForm } from './compras-tipos';

/**
 * Los gastos que se le suman a una importacion: flete, aduana, despachante.
 * Son los que convierten el precio FOB en el costo real de la mercaderia.
 */

export function ExpensesEditor({
  form,
  setForm,
  editable,
  currency,
}: {
  form: PoForm;
  setForm: Dispatch<SetStateAction<PoForm | null>>;
  editable: boolean;
  currency: string;
}) {
  const update = (expenses: FormExpense[]) => setForm((f) => (f ? { ...f, expenses } : f));

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">Gastos del embarque</h2>
        {editable && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => update([...form.expenses, { label: '', amount: '', isLocal: false }])}
          >
            <Plus className="h-4 w-4" /> Gasto
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-fg-muted">
        Flete, seguro, aranceles, despachante, IVA aduana… Se prorratean al costo de cada unidad.
      </p>
      <div className="mt-3 space-y-2">
        {form.expenses.map((e, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Input
                placeholder="Concepto (ej. Flete marítimo)"
                value={e.label}
                disabled={!editable}
                onChange={(ev) => {
                  const expenses = [...form.expenses];
                  expenses[idx] = { ...e, label: ev.target.value };
                  update(expenses);
                }}
              />
            </div>
            <div className="w-32 shrink-0">
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Monto"
                className="text-right"
                value={e.amount}
                disabled={!editable}
                onChange={(ev) => {
                  const expenses = [...form.expenses];
                  expenses[idx] = { ...e, amount: ev.target.value };
                  update(expenses);
                }}
              />
            </div>
            <div className="w-28 shrink-0">
              <Select
                value={e.isLocal ? 'ars' : 'po'}
                disabled={!editable}
                onChange={(ev) => {
                  const expenses = [...form.expenses];
                  expenses[idx] = { ...e, isLocal: ev.target.value === 'ars' };
                  update(expenses);
                }}
                options={[
                  { value: 'po', label: currency },
                  { value: 'ars', label: 'ARS' },
                ]}
              />
            </div>
            {editable && (
              <button
                type="button"
                aria-label={`Quitar el gasto ${e.label || idx + 1}`}
                className="text-fg-subtle hover:text-danger"
                onClick={() => update(form.expenses.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {form.expenses.length === 0 && <p className="text-sm text-fg-muted">Sin gastos cargados.</p>}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------- Recepción
