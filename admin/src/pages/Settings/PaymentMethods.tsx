import { useState } from 'react';
import { Switch, cn, useToast } from '@tiendafy/ui';
import { SettingsHeader } from './SettingsLayout';
import { useSettings } from './useSettings';
import { MercadoPagoConnect } from './MercadoPagoConnect';

interface PaymentState {
  enabled: Record<string, boolean>;
}

interface Gateway {
  id: string;
  name: string;
  tag: string;
  recommended?: boolean;
  rates: { method: string; condition: string; rate: string }[];
}

const gateways: Gateway[] = [
  {
    id: 'modo',
    name: 'MODO',
    tag: 'Billetera',
    rates: [
      { method: 'Tarjeta de crédito', condition: '1 día', rate: '5,19% + IVA' },
      { method: 'Tarjeta de débito', condition: 'Al instante', rate: '2,99% + IVA' },
    ],
  },
  {
    id: 'naranja',
    name: 'Naranja X',
    tag: 'Tarjeta',
    rates: [{ method: 'Tarjeta de crédito', condition: '5 días', rate: '4,69%' }],
  },
  {
    id: 'paypal',
    name: 'PayPal',
    tag: 'Internacional',
    rates: [{ method: 'Tarjetas de crédito / débito', condition: 'Al instante', rate: '6,49% + USD 0,30' }],
  },
  {
    id: 'transferencia',
    name: 'Transferencia bancaria',
    tag: 'Manual',
    rates: [{ method: 'Transferencia / depósito', condition: 'Manual', rate: '0,00%' }],
  },
  {
    id: 'efectivo',
    name: 'Efectivo / contra entrega',
    tag: 'Manual',
    rates: [{ method: 'Efectivo al recibir', condition: 'Manual', rate: '0,00%' }],
  },
];

const tabs = ['Todos', 'Activos', 'Desactivados'] as const;

export function PaymentMethodsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<(typeof tabs)[number]>('Todos');
  const { value, update } = useSettings<PaymentState>('payments', { enabled: {} });

  const toggle = (id: string, on: boolean) => {
    update({ enabled: { ...value.enabled, [id]: on } });
    // Persistir al toque (sin SaveBar — cada toggle es una acción).
    setTimeout(() => {
      localStorage.setItem(
        `tiendafy.settings.payments`,
        JSON.stringify({ enabled: { ...value.enabled, [id]: on } }),
      );
    }, 0);
    toast(on ? 'Medio de pago activado' : 'Medio de pago desactivado', { variant: 'success' });
  };

  const visible = gateways.filter((g) => {
    const on = value.enabled[g.id] ?? false;
    if (tab === 'Activos') return on;
    if (tab === 'Desactivados') return !on;
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <SettingsHeader title="Medios de pago" />

      <div className="mb-6">
        <MercadoPagoConnect />
      </div>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-fg-muted">Otros medios</h2>

      <div className="mb-4 flex gap-1 border-b border-border text-sm">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px border-b-2 px-4 pb-2.5 font-medium',
              tab === t ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {visible.map((g) => {
          const on = value.enabled[g.id] ?? false;
          return (
            <div key={g.id} className="rounded-lg border border-border bg-surface p-5 shadow-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-fg">{g.name}</span>
                    {g.recommended && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        Recomendado
                      </span>
                    )}
                    <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-fg-muted">{g.tag}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('text-xs font-medium', on ? 'text-success' : 'text-fg-subtle')}>
                    {on ? 'Activo' : 'Desactivado'}
                  </span>
                  <Switch checked={on} onChange={(v) => toggle(g.id, v)} />
                </div>
              </div>

              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-fg-muted">
                    <th className="py-1.5 font-medium">Medio</th>
                    <th className="py-1.5 font-medium">Acreditación</th>
                    <th className="py-1.5 text-right font-medium">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rates.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-b-0">
                      <td className="py-1.5 text-fg">{r.method}</td>
                      <td className="py-1.5 text-fg-muted">{r.condition}</td>
                      <td className="py-1.5 text-right tabular-nums text-fg">{r.rate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-lg border border-dashed border-primary/40 bg-primary/[0.03] p-4 text-sm">
        <div className="font-semibold text-primary">¿Necesitás otro medio?</div>
        <p className="mt-1 text-fg-muted">Conectá apps adicionales en la Tienda de Aplicaciones. (Próximamente)</p>
      </div>
    </div>
  );
}
