import { useQuery } from '@tanstack/react-query';
import { Mail, MessageCircle } from 'lucide-react';
import { Card } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api } from '../lib/api';
import { formatNumber } from '../lib/format';

interface ChannelUsage {
  month: number;
  total: number;
  /** Solo emails: lo enviado por campañas (otro circuito que los avisos automáticos). */
  campaignsMonth?: number;
  campaignsTotal?: number;
  unitUsdPer1000?: number;
  unitUsdPerMessage?: number;
  estimatedMonthUsd: number;
}
interface Usage {
  email: ChannelUsage;
  whatsapp: ChannelUsage;
}

/**
 * Dólares con el formato de acá ("US$ 0,40"). Antes salía "US$ 0.4": el
 * número crudo con punto decimal y sin el cero.
 */
const usd = (n: number, digits = 2) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: Math.max(digits, 3),
  }).format(n);

/**
 * Uso y costo estimado del canal (emails o WhatsApp) de la tienda.
 *
 * En emails se cuentan por separado los avisos automáticos (confirmación de
 * compra, envío…) y las campañas: la tarjeta contaba solo los primeros y
 * decía "0 enviados este mes" al lado de una campaña de 1.200 envíos.
 *
 * Los costos son ESTIMACIONES con tarifas de referencia configurables:
 * Resend cobra por plan (Pro ≈ US$ 0,40 c/1000) y Meta por mensaje de
 * plantilla (utility AR ≈ US$ 0,034). El real depende del plan contratado.
 */
export function NotificationUsage({ channel }: { channel: 'email' | 'whatsapp' }) {
  const { store } = useStore();
  const { data } = useQuery({
    queryKey: ['notifications-usage', store?.id],
    queryFn: () => api.get<Usage>('/api/v1/notifications/usage'),
    enabled: !!store,
  });
  if (!data) return null;

  const u = data[channel];
  const Icon = channel === 'email' ? Mail : MessageCircle;
  const isEmail = channel === 'email';
  const unidad = isEmail
    ? `${usd(u.unitUsdPer1000 ?? 0)} cada 1.000 emails (referencia Resend)`
    : `${usd(u.unitUsdPerMessage ?? 0, 3)} por mensaje de plantilla (referencia Meta, Argentina)`;

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Icon className="h-4 w-4 text-fg-muted" /> Uso del mes
        </div>
        <Metric value={formatNumber(u.month)} label={isEmail ? 'avisos automáticos' : 'mensajes enviados'} />
        {isEmail && u.campaignsMonth !== undefined && (
          <Metric value={formatNumber(u.campaignsMonth)} label="enviados por campañas" />
        )}
        <Metric
          value={u.estimatedMonthUsd < 0.01 && u.month > 0 ? `< ${usd(0.01)}` : usd(u.estimatedMonthUsd)}
          label="costo estimado del mes"
        />
        <Metric
          value={formatNumber(u.total + (u.campaignsTotal ?? 0))}
          label={
            isEmail && u.campaignsTotal !== undefined
              ? 'total histórico (avisos + campañas)'
              : 'total histórico'
          }
        />
      </div>
      <p className="mt-3 text-xs text-fg-subtle">
        {isEmail &&
          'Los avisos automáticos son los emails de cada compra (confirmación, envío, carritos abandonados); las campañas se cuentan aparte. '}
        Estimación de referencia: {unidad}. El costo real depende del plan que tengas contratado.
      </p>
    </Card>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold tabular-nums text-fg">{value}</div>
      <div className="text-xs text-fg-subtle">{label}</div>
    </div>
  );
}
