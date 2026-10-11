import { useMemo, type Dispatch, type SetStateAction } from 'react';
import { Card, Input } from '@tiendafy/ui';
import { Trash2 } from 'lucide-react';
import { formatMoney } from '../lib/format';
import { VariantPicker } from '../components/VariantPicker';
import { InfoDot } from '../components/charts';
import { TABLE_HEAD_STICKY } from '../lib/styles';
import type { FormItem, PoDetail, PoForm } from './compras-tipos';

/** Que se compra y a cuanto: las lineas de la orden. */

export function ItemsEditor({
  form,
  setForm,
  editable,
  currency,
  po,
}: {
  form: PoForm;
  setForm: Dispatch<SetStateAction<PoForm | null>>;
  editable: boolean;
  currency: string;
  po: PoDetail | null;
}) {
  const excluded = useMemo(() => new Set(form.items.map((i) => i.variantId)), [form.items]);
  const update = (patch: Partial<PoForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const landedBy = new Map((po?.items ?? []).map((i) => [i.variantId, i.landedUnitCostArsMinor]));

  return (
    <Card>
      <h2 className="text-sm font-semibold text-fg">Ítems</h2>
      {editable && (
        <div className="mt-2">
          <VariantPicker
            placeholder="Buscar producto o SKU para agregar…"
            exclude={excluded}
            onPick={(m) =>
              update({
                items: [
                  ...form.items,
                  { variantId: m.variantId, label: m.label, sku: m.sku, quantity: '1', unitCost: '' },
                ],
              })
            }
          />
        </div>
      )}

      <table className="mt-3 w-full text-sm">
        <thead className={TABLE_HEAD_STICKY}>
          <tr className="border-b border-border text-left text-xs text-fg-muted">
            <th className="py-2 font-medium">Producto</th>
            <th className="py-2 font-medium">SKU</th>
            <th className="py-2 text-right font-medium">Cantidad</th>
            <th className="py-2 text-right font-medium">Costo unit. ({currency})</th>
            <th className="py-2 text-right font-medium">
              <span className="inline-flex items-center gap-1">
                Landed (ARS){' '}
                <InfoDot info="El costo REAL por unidad puesta en tu depósito: FOB × tipo de cambio + los gastos del embarque prorrateados por valor." />
              </span>
            </th>
            {editable && <th className="py-2" />}
          </tr>
        </thead>
        <tbody>
          {form.items.map((item: FormItem, idx: number) => (
            <tr key={item.variantId} className="border-b border-border last:border-b-0">
              <td className="py-2 text-fg">{item.label}</td>
              <td className="py-2 text-fg-subtle">{item.sku}</td>
              <td className="py-2 text-right">
                <div className="ml-auto w-20 shrink-0">
                  <Input
                    compact
                    type="number"
                    min={1}
                    className="text-right"
                    value={item.quantity}
                    disabled={!editable}
                    onChange={(e) => {
                      const items = [...form.items];
                      items[idx] = { ...item, quantity: e.target.value };
                      update({ items });
                    }}
                  />
                </div>
              </td>
              <td className="py-2 text-right">
                <div className="ml-auto w-24 shrink-0">
                  <Input
                    compact
                    type="number"
                    min={0}
                    step="0.01"
                    className="text-right"
                    value={item.unitCost}
                    disabled={!editable}
                    onChange={(e) => {
                      const items = [...form.items];
                      items[idx] = { ...item, unitCost: e.target.value };
                      update({ items });
                    }}
                  />
                </div>
              </td>
              <td className="py-2 text-right tabular-nums text-fg-muted">
                {landedBy.has(item.variantId) ? formatMoney(landedBy.get(item.variantId)!) : '—'}
              </td>
              {editable && (
                <td className="py-2 text-right">
                  <button
                    type="button"
                    className="text-fg-subtle hover:text-danger"
                    onClick={() =>
                      update({ items: form.items.filter((_: FormItem, i: number) => i !== idx) })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
          {form.items.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-sm text-fg-muted">
                Sin ítems todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
