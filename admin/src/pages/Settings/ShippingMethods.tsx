import { useState } from 'react';
import { Info, Package, Plus, Settings, Tag, Truck, type LucideIcon } from 'lucide-react';
import { Switch, cn, useToast } from '@tiendafy/ui';
import { SettingsHeader } from './SettingsLayout';
import { useSettings } from './useSettings';

interface ShippingState {
  contingency: boolean;
}

const tabs = ['Nacionales', 'Internacionales', 'Retiros'] as const;

export function ShippingMethodsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<(typeof tabs)[number]>('Nacionales');
  const { value, update, save, dirty } = useSettings<ShippingState>('shipping', { contingency: false });

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <SettingsHeader title="Medios de envío" />

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

      {tab === 'Nacionales' ? (
        <div className="space-y-5">
          {/* Envío Nube destacado */}
          <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-primary">Envío Nube</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Recomendada</span>
            </div>
            <p className="text-sm text-fg-muted">Nuestra solución logística</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {([
                [Package, 'Formas de entrega', 'Puntos de despacho y colecta'],
                [Truck, 'Operadores logísticos', 'Andreani, Correo Argentino y más'],
                [Tag, 'Envíos con descuento', 'Hasta 15% de ahorro'],
                [Settings, 'Gestión automatizada', 'Etiqueta y código de seguimiento'],
              ] as [LucideIcon, string, string][]).map(([Icon, title, body]) => (
                <div key={title} className="flex gap-3">
                  <Icon className="h-5 w-5 shrink-0 text-fg-muted" />
                  <div>
                    <div className="text-sm font-medium text-fg">{title}</div>
                    <div className="text-xs text-fg-muted">{body}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-md border border-warning/30 bg-warning-bg p-3 text-sm">
              <Info className="h-4 w-4 shrink-0 text-warning" />
              <span className="text-fg">
                Activá al menos una opción de envío para que tus clientes puedan elegir cómo recibir sus pedidos.
              </span>
              <button className="ml-auto inline-flex h-8 items-center rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-bg-muted">
                Editar
              </button>
            </div>
          </div>

          <Card title="Otros medios de envío">
            <button className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><Plus className="h-4 w-4" /> Agregar medio de envío</button>
          </Card>

          <Card title="Envío personalizado" description="Creá el medio de envío que quieras para realizar tus entregas.">
            <button className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><Plus className="h-4 w-4" /> Agregar envío personalizado</button>
          </Card>

          <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-fg">Costo y plazo de contingencia</h3>
                <p className="mt-0.5 text-sm text-fg-muted">
                  Definí un costo y un plazo fijos para usar cuando todos los medios de envío fallen temporalmente.
                </p>
              </div>
              <Switch checked={value.contingency} onChange={(contingency) => update({ contingency })} />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface p-10 text-center text-sm text-fg-muted shadow-card">
          {tab === 'Internacionales'
            ? 'Configurá envíos al exterior cuando tu logística internacional esté activa.'
            : 'Definí puntos de retiro para que tus clientes pasen a buscar sus pedidos.'}
        </div>
      )}

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur md:left-sidebar">
          <div className="mx-auto flex max-w-3xl justify-end">
            <button
              onClick={() => {
                save();
                toast('Envíos guardados', { variant: 'success' });
              }}
              className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}
