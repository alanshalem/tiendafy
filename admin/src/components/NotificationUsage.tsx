import { useQuery } from '@tanstack/react-query';
import { Mail, MessageCircle } from 'lucide-react';
import { Card } from '@tiendafy/ui';
import { useStore } from '../context/StoreContext';
import { api } from '../lib/api';

interface ChannelUsage {
  month: number;
  total: number;
  unitUsdPer1000?: number;
  unitUsdPerMessage?: number;
  estimatedMonthUsd: number;
}
interface Usage {
  email: ChannelUsage;
  whatsapp: ChannelUsage;
}

/**
 * Uso y costo estimado del canal (emails o WhatsApp) de la tienda.
 * Los costos son ESTIMACIONES con tarifas de referencia configurables:
 * Resend cobra por plan (Pro ≈ US$0,40 c/1000) y Meta por mensaje de
 * plantilla (utility AR ≈ US$0,034). El real depende del plan contratado.
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
  const unidad =
    channel === 'email'
      ? `US$ ${u.unitUsdPer1000} cada 1.000 emails (referencia Resend)`
      : `US$ ${u.unitUsdPerMessage} por mensaje de plantilla (referencia Meta, Argentina)`;

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Icon className="h-4 w-4 text-fg-muted" /> Uso del mes
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums text-fg">{u.month.toLocaleString('es-AR')}</div>
          <div className="text-xs text-fg-subtle">enviados este mes</div>
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums text-fg">
            {u.estimatedMonthUsd < 0.01 && u.month > 0
              ? '< US$ 0,01'
              : `US$ ${u.estimatedMonthUsd.toLocaleString('es-AR')}`}
          </div>
          <div className="text-xs text-fg-subtle">costo estimado del mes</div>
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums text-fg">{u.total.toLocaleString('es-AR')}</div>
          <div className="text-xs text-fg-subtle">total histórico</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-fg-subtle">
        Estimación de referencia: {unidad}. El costo real depende del plan que tengas contratado.
      </p>
    </Card>
  );
}
