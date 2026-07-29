import { useState, type ReactElement } from 'react';
import { Badge, Switch } from '@tiendafy/ui';
import { HelpCircle, ShoppingBag, Ticket } from 'lucide-react';
import type { HelpDemoId } from '../config/helpContent';

/**
 * Demos del centro de ayuda: los MISMOS componentes que el merchant ve en el
 * panel, renderizados dentro del artículo para que el texto tenga referencia
 * visual. Todo es estático/local — acá no se llama a la API.
 */

// Estados de una venta, con las mismas clases que la tabla de Ventas.
const ORDER_STATUSES = [
  { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  { label: 'Pagada', cls: 'bg-green-100 text-green-700' },
  { label: 'Enviada', cls: 'bg-green-100 text-green-700' },
  { label: 'Reembolsada', cls: 'bg-blue-100 text-blue-700' },
  { label: 'Reembolso parcial', cls: 'bg-sky-100 text-sky-700' },
  { label: 'Cancelada', cls: 'bg-gray-100 text-gray-600' },
  { label: 'Contracargo', cls: 'bg-rose-100 text-rose-700' },
];

function OrderStatusesDemo() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ORDER_STATUSES.map((s) => (
        <span
          key={s.label}
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}

function CampaignStatusesDemo() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="neutral">Borrador</Badge>
      <Badge variant="info">Programada</Badge>
      <Badge variant="warning">Enviando…</Badge>
      <Badge variant="success">Enviada</Badge>
      <Badge variant="danger">Cancelada</Badge>
    </div>
  );
}

function SwitchDemo() {
  const [on, setOn] = useState(true);
  return (
    <div className="max-w-sm">
      <Switch
        checked={on}
        onChange={setOn}
        label="E-mail de confirmación de compra"
        description={on ? 'Activado: se envía solo con cada venta.' : 'Desactivado: no se envía.'}
      />
    </div>
  );
}

function HelpLinkDemo() {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
      <HelpCircle className="h-3.5 w-3.5" /> Más sobre medios de pago
    </span>
  );
}

function CouponDemo() {
  return (
    <div className="max-w-sm rounded-xl border border-border bg-bg-subtle p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-primary/50 bg-primary/5 px-2.5 py-1 font-mono text-sm font-semibold tracking-wide text-primary">
          <Ticket className="h-3.5 w-3.5" /> BIENVENIDA10
        </span>
        <Badge variant="success">−10 %</Badge>
      </div>
      <div className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between text-fg-muted">
          <span>Subtotal</span>
          <span>$ 20.000</span>
        </div>
        <div className="flex justify-between text-success">
          <span>Descuento</span>
          <span>− $ 2.000</span>
        </div>
        <div className="flex justify-between font-semibold text-fg">
          <span>Total</span>
          <span>$ 18.000</span>
        </div>
      </div>
    </div>
  );
}

// Mini tienda interactiva: probar acentos de color como en el editor de temas.
const PREVIEW_COLORS = ['#007AFF', '#E4573D', '#0E9F6E', '#7C3AED'];

function StorefrontPreviewDemo() {
  const [accent, setAccent] = useState(PREVIEW_COLORS[0]);
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-xs font-medium text-fg-muted">Probá un color:</span>
        {PREVIEW_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            onClick={() => setAccent(c)}
            className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
              accent === c ? 'border-fg' : 'border-transparent'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <span className="text-sm font-bold tracking-tight text-gray-900">Mi Marca</span>
          <span className="flex items-center gap-3 text-[11px] text-gray-500">
            Inicio · Productos · Contacto
            <ShoppingBag className="h-3.5 w-3.5" style={{ color: accent }} />
          </span>
        </div>
        <div className="px-4 py-5 text-center" style={{ backgroundColor: `${accent}14` }}>
          <div className="text-sm font-bold text-gray-900">Nueva temporada</div>
          <div className="mt-0.5 text-[11px] text-gray-500">Envíos a todo el país</div>
          <span
            className="mt-2 inline-block rounded-full px-3 py-1 text-[11px] font-semibold text-white"
            style={{ backgroundColor: accent }}
          >
            Ver productos
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2.5 p-3">
          {['Remera', 'Buzo', 'Gorra'].map((name, i) => (
            <div key={name} className="rounded-lg border border-gray-100 p-1.5">
              <div
                className="h-10 rounded-md"
                style={{ backgroundColor: `${accent}${i === 1 ? '33' : '1f'}` }}
              />
              <div className="mt-1 text-[10px] font-medium text-gray-800">{name}</div>
              <div className="text-[10px] font-semibold" style={{ color: accent }}>
                $ {(i + 1) * 9}.999
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const DEMOS: Record<HelpDemoId, () => ReactElement> = {
  orderStatuses: OrderStatusesDemo,
  campaignStatuses: CampaignStatusesDemo,
  switch: SwitchDemo,
  helpLink: HelpLinkDemo,
  coupon: CouponDemo,
  storefrontPreview: StorefrontPreviewDemo,
};

export function HelpDemo({ demo }: { demo: HelpDemoId }) {
  const Demo = DEMOS[demo];
  return <Demo />;
}
